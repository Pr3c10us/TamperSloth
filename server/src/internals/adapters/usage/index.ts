import {SQL} from "bun";
import type {UsageRecord, UsageRepository} from "../../domain/usage";

export default class UsageRepositoryPG implements UsageRepository {
    sql: SQL

    constructor(postgresClient: SQL) {
        this.sql = postgresClient
    }

    async record(usage: UsageRecord): Promise<void> {
        await this.sql`
            INSERT INTO model_usage ${this.sql({
                user_id: usage.userId,
                model_id: usage.modelId,
                provider: usage.provider,
                provider_model: usage.providerModel,
                input_tokens: usage.input,
                output_tokens: usage.output,
                cache_read_tokens: usage.cacheRead,
                cache_write_tokens: usage.cacheWrite,
                cost_micros: usage.costMicros,
                status: usage.status,
            })}
        `
    }

    async spentSince(userId: string, since: Date): Promise<number> {
        const [row] = await this.sql`
            SELECT COALESCE(SUM(cost_micros), 0)::bigint AS spent
            FROM model_usage
            WHERE user_id = ${userId}
              AND created_at >= ${since}
        `
        return Number(row?.spent ?? 0)
    }
}
