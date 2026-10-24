import {SQL} from "bun";
import {
    type BillingAccount,
    entitlementFor,
    inferEventType,
    isLive,
    type OpenCheckout,
    type PaymentEvent,
    type StoredWebhook,
    type Subscription,
    type SubscriptionChange,
    type SubscriptionRepository,
} from "../../domain/billing";

const LIVE_STATUSES = ["trialing", "active", "past_due"]

export default class SubscriptionRepositoryPG implements SubscriptionRepository {
    sql: SQL

    constructor(postgresClient: SQL) {
        this.sql = postgresClient
    }

    async recordWebhook(provider: string, event: PaymentEvent): Promise<boolean> {
        // ::text first: a string bound straight to jsonb is stored as a JSON string, not the object.
        await this.sql`
            INSERT INTO webhook_events (provider, event_id, type, occurred_at, payload)
            VALUES (${provider}, ${event.eventId}, ${event.type}, ${event.occurredAt}, ${event.rawBody}::text::jsonb)
            ON CONFLICT (provider, event_id) DO NOTHING
        `
        const [row] = await this.sql`
            SELECT processed_at, failed_at
            FROM webhook_events
            WHERE provider = ${provider}
              AND event_id = ${event.eventId}
        `
        return Boolean(row?.processed_at || row?.failed_at)
    }

    async markWebhookProcessed(provider: string, eventId: string): Promise<void> {
        await this.sql`
            UPDATE webhook_events
            SET processed_at = now()
            WHERE provider = ${provider}
              AND event_id = ${eventId}
        `
    }

    async markWebhookFailed(provider: string, eventId: string, error: string): Promise<void> {
        await this.sql`
            UPDATE webhook_events
            SET failed_at = now(),
                error     = ${error}
            WHERE provider = ${provider}
              AND event_id = ${eventId}
        `
    }

    async pendingWebhooks(provider: string, receivedBefore: Date, limit: number): Promise<StoredWebhook[]> {
        const rows = await this.sql`
            SELECT event_id, payload::text AS raw
            FROM webhook_events
            WHERE provider = ${provider}
              AND processed_at IS NULL
              AND failed_at IS NULL
              AND received_at < ${receivedBefore}
            ORDER BY received_at
            LIMIT ${limit}
        `
        return rows.map((row: any) => ({eventId: row.event_id, rawBody: row.raw}))
    }

    async pruneWebhooks(processedBefore: Date): Promise<number> {
        const rows = await this.sql`
            DELETE
            FROM webhook_events
            WHERE COALESCE(processed_at, failed_at) < ${processedBefore}
            RETURNING 1
        `
        return rows.length
    }

    async billingAccount(userId: string): Promise<BillingAccount | null> {
        const [row] = await this.sql`
            SELECT id, paddle_customer_id
            FROM users
            WHERE id = ${userId}
        `
        return row ? {userId: row.id, paddleCustomerId: row.paddle_customer_id} : null
    }

    async findByPaddleId(paddleSubscriptionId: string): Promise<Subscription | null> {
        const [row] = await this.sql`
            SELECT *
            FROM subscriptions
            WHERE paddle_subscription_id = ${paddleSubscriptionId}
        `
        return row ? toSubscription(row) : null
    }

    async findLiveByUser(userId: string): Promise<Subscription | null> {
        const [row] = await this.sql`
            SELECT *
            FROM subscriptions
            WHERE user_id = ${userId}
              AND status IN ${this.sql(LIVE_STATUSES)}
            LIMIT 1
        `
        return row ? toSubscription(row) : null
    }

    async setPaddleCustomerId(userId: string, paddleCustomerId: string): Promise<void> {
        await this.sql`
            UPDATE users
            SET paddle_customer_id = ${paddleCustomerId},
                updated_at         = now()
            WHERE id = ${userId}
              AND paddle_customer_id IS NULL
        `
    }

    async openCheckout(userId: string): Promise<OpenCheckout | null> {
        const [row] = await this.sql`
            SELECT checkout_transaction_id, checkout_plan, checkout_created_at
            FROM users
            WHERE id = ${userId}
              AND checkout_transaction_id IS NOT NULL
        `
        return row ? {transactionId: row.checkout_transaction_id, plan: row.checkout_plan, createdAt: row.checkout_created_at} : null
    }

    async saveCheckout(userId: string, checkout: OpenCheckout | null): Promise<void> {
        await this.sql`
            UPDATE users
            SET checkout_transaction_id = ${checkout?.transactionId ?? null},
                checkout_plan           = ${checkout?.plan ?? null},
                checkout_created_at     = ${checkout?.createdAt ?? null}
            WHERE id = ${userId}
        `
    }

    async apply(change: SubscriptionChange): Promise<boolean> {
        return await this.sql.begin(async tx => {
            // One event per subscription at a time, including its first ones, which have no row to lock yet.
            await tx`SELECT pg_advisory_xact_lock(hashtext(${change.paddleSubscriptionId}))`
            const [existingRow] = await tx`
                SELECT *
                FROM subscriptions
                WHERE paddle_subscription_id = ${change.paddleSubscriptionId}
            `
            const existing = existingRow ? toSubscription(existingRow) : undefined

            // Paddle doesn't promise order; a late event would roll the subscription back.
            if (existing && change.occurredAt < existing.lastEventAt) {
                console.warn(`skipping paddle event ${change.eventId}: older than the last one applied to ${change.paddleSubscriptionId}`)
                return false
            }

            const userId = existing?.userId ?? change.userId
            if (existing && change.userId !== existing.userId) {
                console.error(`paddle subscription ${change.paddleSubscriptionId} names user ${change.userId}, kept on ${existing.userId}`)
            }
            const entitled = entitlementFor(existing, change)

            // A user's second live subscription fails the unique index here, so the event is retried;
            // the webhook handler turns that subscription away before it gets this far.
            const [saved] = await tx`
                INSERT INTO subscriptions (user_id, paddle_subscription_id, plan, entitled_plan, paddle_price_id, status,
                                           current_period_start, current_period_end, cancel_at_period_end,
                                           canceled_at, last_event_at)
                VALUES (${userId}, ${change.paddleSubscriptionId}, ${change.plan}, ${entitled}, ${change.paddlePriceId},
                        ${change.status}, ${change.currentPeriodStart}, ${change.currentPeriodEnd},
                        ${change.cancelAtPeriodEnd}, ${change.canceledAt}, ${change.occurredAt})
                ON CONFLICT (paddle_subscription_id) DO UPDATE
                    SET plan                 = EXCLUDED.plan,
                        entitled_plan        = EXCLUDED.entitled_plan,
                        paddle_price_id      = EXCLUDED.paddle_price_id,
                        status               = EXCLUDED.status,
                        current_period_start = COALESCE(EXCLUDED.current_period_start, subscriptions.current_period_start),
                        current_period_end   = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
                        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                        canceled_at          = EXCLUDED.canceled_at,
                        last_event_at        = EXCLUDED.last_event_at,
                        updated_at           = now()
                WHERE subscriptions.last_event_at <= EXCLUDED.last_event_at
                RETURNING id
            `
            if (!saved) return false

            const type = inferEventType(existing, change, entitled)
            if (type) {
                await tx`
                    INSERT INTO subscription_events (subscription_id, type, from_plan, to_plan, from_status, to_status, payload)
                    VALUES (${saved.id}, ${type}, ${existing?.plan ?? null}, ${change.plan}, ${existing?.status ?? null},
                            ${change.status}, ${{eventId: change.eventId, entitledPlan: entitled}}::jsonb)
                `
            }

            if (isLive(change.status)) {
                await tx`
                    UPDATE users
                    SET plan                    = ${entitled},
                        plan_status             = ${change.status},
                        plan_period_start       = ${change.currentPeriodStart},
                        plan_period_end         = ${change.currentPeriodEnd},
                        -- Its checkout is paid; a later one starts fresh.
                        checkout_transaction_id = NULL,
                        checkout_plan           = NULL,
                        checkout_created_at     = NULL,
                        updated_at              = now()
                    WHERE id = ${userId}
                `
            } else {
                // Paused or canceled: back to free, unless another subscription is still live.
                await tx`
                    UPDATE users
                    SET plan                = 'free',
                        plan_status         = NULL,
                        plan_period_start   = NULL,
                        plan_period_end     = NULL,
                        credit_window_start = NULL,
                        credit_bonus_micros = 0,
                        updated_at          = now()
                    WHERE id = ${userId}
                      AND NOT EXISTS (SELECT 1
                                      FROM subscriptions
                                      WHERE user_id = ${userId}
                                        AND status IN ${tx(LIVE_STATUSES)})
                `
            }

            await tx`
                UPDATE users
                SET paddle_customer_id = ${change.paddleCustomerId}
                WHERE id = ${userId}
                  AND paddle_customer_id IS NULL
                  AND NOT EXISTS (SELECT 1 FROM users WHERE paddle_customer_id = ${change.paddleCustomerId})
            `
            return true
        })
    }

    async startCreditWindow(userId: string, start: Date, bonusMicros: number): Promise<void> {
        await this.sql`
            UPDATE users
            SET credit_window_start = ${start},
                credit_bonus_micros = ${Math.max(0, Math.round(bonusMicros))},
                updated_at          = now()
            WHERE id = ${userId}
        `
    }

    async setPendingNextBilledAt(paddleSubscriptionId: string, at: Date | null): Promise<void> {
        await this.sql`
            UPDATE subscriptions
            SET pending_next_billed_at = ${at}
            WHERE paddle_subscription_id = ${paddleSubscriptionId}
        `
    }

    async withPendingNextBilledAt(): Promise<Subscription[]> {
        const rows = await this.sql`
            SELECT *
            FROM subscriptions
            WHERE pending_next_billed_at IS NOT NULL
              AND status IN ${this.sql(LIVE_STATUSES)}
        `
        return rows.map(toSubscription)
    }

    async lapsed(endedBefore: Date, limit: number): Promise<Subscription[]> {
        const rows = await this.sql`
            SELECT s.*
            FROM subscriptions s
                     JOIN users u ON u.id = s.user_id
            WHERE s.status IN ${this.sql(LIVE_STATUSES)}
              AND u.plan <> 'free'
              AND u.plan_period_end < ${endedBefore}
            ORDER BY u.plan_period_end
            LIMIT ${limit}
        `
        return rows.map(toSubscription)
    }
}

function toSubscription(row: any): Subscription {
    return {
        id: row.id,
        userId: row.user_id,
        paddleSubscriptionId: row.paddle_subscription_id,
        plan: row.plan,
        entitledPlan: row.entitled_plan ?? row.plan,
        paddlePriceId: row.paddle_price_id,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        canceledAt: row.canceled_at,
        lastEventAt: row.last_event_at,
        pendingNextBilledAt: row.pending_next_billed_at,
    }
}
