import {SQL} from "bun";
import type {DailySpend, SpendAlert, SpendLimitRepository} from "../../domain/spend";

export default class SpendLimitRepositoryPG implements SpendLimitRepository {
    sql: SQL

    constructor(postgresClient: SQL) {
        this.sql = postgresClient
    }

    async today(): Promise<DailySpend> {
        const [row] = await this.sql`
            SELECT (l.daily_limit_usd * 1e6)::bigint                    AS limit_micros,
                   l.alert_percent,
                   COALESCE(d.spent_micros, 0)::bigint                  AS spent_micros,
                   COALESCE(d.warned_at >= l.updated_at, false)         AS warned,
                   COALESCE(d.tripped_at >= l.updated_at, false)        AS tripped
            FROM spend_limit l
                     LEFT JOIN daily_spend d ON d.day = (now() AT TIME ZONE 'UTC')::date
        `
        if (!row) {
            // The breaker fails closed: without its row there is no limit to trust.
            console.error("spend_limit has no row; Sloth models are paused until one is added")
            return {spentMicros: 0, limitMicros: 0, alertPercent: 100, warned: true, tripped: true}
        }
        return {
            spentMicros: Number(row.spent_micros),
            limitMicros: Number(row.limit_micros),
            alertPercent: Number(row.alert_percent),
            warned: row.warned,
            tripped: row.tripped,
        }
    }

    async claimAlert(alert: SpendAlert): Promise<boolean> {
        // An alert sent before the limit last changed was for the old limit, so it may go out again.
        const rows = alert === "warned"
            ? await this.sql`
                INSERT INTO daily_spend (day, warned_at)
                VALUES ((now() AT TIME ZONE 'UTC')::date, now())
                ON CONFLICT (day) DO UPDATE SET warned_at = now()
                WHERE daily_spend.warned_at IS NULL
                   OR daily_spend.warned_at < (SELECT updated_at FROM spend_limit)
                RETURNING day
            `
            : await this.sql`
                INSERT INTO daily_spend (day, tripped_at)
                VALUES ((now() AT TIME ZONE 'UTC')::date, now())
                ON CONFLICT (day) DO UPDATE SET tripped_at = now()
                WHERE daily_spend.tripped_at IS NULL
                   OR daily_spend.tripped_at < (SELECT updated_at FROM spend_limit)
                RETURNING day
            `
        return rows.length > 0
    }
}
