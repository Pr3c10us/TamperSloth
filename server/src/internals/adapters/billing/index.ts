import {SQL} from "bun";
import {
    inferEventType,
    isLive,
    type PaymentEvent,
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
            SELECT processed_at
            FROM webhook_events
            WHERE provider = ${provider}
              AND event_id = ${event.eventId}
        `
        return Boolean(row?.processed_at)
    }

    async markWebhookProcessed(provider: string, eventId: string): Promise<void> {
        await this.sql`
            UPDATE webhook_events
            SET processed_at = now()
            WHERE provider = ${provider}
              AND event_id = ${eventId}
        `
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

    async apply(change: SubscriptionChange): Promise<void> {
        await this.sql.begin(async tx => {
            const [existingRow] = await tx`
                SELECT *
                FROM subscriptions
                WHERE paddle_subscription_id = ${change.paddleSubscriptionId}
                    FOR UPDATE
            `
            const existing = existingRow ? toSubscription(existingRow) : undefined

            // Paddle doesn't promise order; a late event would roll the subscription back.
            if (existing && change.occurredAt < existing.lastEventAt) {
                console.warn(`skipping paddle event ${change.eventId}: older than the last one applied to ${change.paddleSubscriptionId}`)
                return
            }

            const userId = existing?.userId ?? change.userId
            if (!userId) {
                // Thrown so Paddle retries; a subscription made outside our checkout has no user to land on.
                throw new Error(`subscription ${change.paddleSubscriptionId} has no userId in its custom data`)
            }
            if (existing && change.userId && change.userId !== existing.userId) {
                console.error(`paddle subscription ${change.paddleSubscriptionId} names user ${change.userId}, kept on ${existing.userId}`)
            }

            if (isLive(change.status)) {
                // Checkout refuses a second plan, so this is a race between two checkouts. Both are being
                // billed: the newer one wins here, and the other needs canceling in Paddle.
                const superseded = await tx`
                    UPDATE subscriptions
                    SET status      = 'canceled',
                        canceled_at = now(),
                        updated_at  = now()
                    WHERE user_id = ${userId}
                      AND paddle_subscription_id <> ${change.paddleSubscriptionId}
                      AND status IN ${tx(LIVE_STATUSES)}
                    RETURNING id, paddle_subscription_id, plan, status
                `
                for (const row of superseded) {
                    console.error(`user ${userId} has two live paddle subscriptions; cancel ${row.paddle_subscription_id} in Paddle`)
                    await tx`
                        INSERT INTO subscription_events (subscription_id, type, from_plan, to_plan, from_status, to_status, payload)
                        VALUES (${row.id}, 'canceled', ${row.plan}, ${row.plan}, ${row.status}, 'canceled',
                                ${{supersededBy: change.paddleSubscriptionId}}::jsonb)
                    `
                }
            }

            const [saved] = await tx`
                INSERT INTO subscriptions (user_id, paddle_subscription_id, plan, paddle_price_id, status,
                                           current_period_start, current_period_end, cancel_at_period_end,
                                           canceled_at, last_event_at)
                VALUES (${userId}, ${change.paddleSubscriptionId}, ${change.plan}, ${change.paddlePriceId}, ${change.status},
                        ${change.currentPeriodStart}, ${change.currentPeriodEnd}, ${change.cancelAtPeriodEnd},
                        ${change.canceledAt}, ${change.occurredAt})
                ON CONFLICT (paddle_subscription_id) DO UPDATE
                    SET plan                 = EXCLUDED.plan,
                        paddle_price_id      = EXCLUDED.paddle_price_id,
                        status               = EXCLUDED.status,
                        current_period_start = COALESCE(EXCLUDED.current_period_start, subscriptions.current_period_start),
                        current_period_end   = COALESCE(EXCLUDED.current_period_end, subscriptions.current_period_end),
                        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
                        canceled_at          = EXCLUDED.canceled_at,
                        last_event_at        = EXCLUDED.last_event_at,
                        updated_at           = now()
                RETURNING id
            `

            const type = inferEventType(existing, change)
            if (type) {
                await tx`
                    INSERT INTO subscription_events (subscription_id, type, from_plan, to_plan, from_status, to_status, payload)
                    VALUES (${saved.id}, ${type}, ${existing?.plan ?? null}, ${change.plan}, ${existing?.status ?? null},
                            ${change.status}, ${{eventId: change.eventId}}::jsonb)
                `
            }

            if (isLive(change.status)) {
                await tx`
                    UPDATE users
                    SET plan              = ${change.plan},
                        plan_period_start = ${change.currentPeriodStart},
                        plan_period_end   = ${change.currentPeriodEnd},
                        updated_at        = now()
                    WHERE id = ${userId}
                `
            } else {
                // Paused or canceled: back to free, unless another subscription is still live.
                await tx`
                    UPDATE users
                    SET plan              = 'free',
                        plan_period_start = NULL,
                        plan_period_end   = NULL,
                        updated_at        = now()
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
        })
    }
}

function toSubscription(row: any): Subscription {
    return {
        id: row.id,
        userId: row.user_id,
        paddleSubscriptionId: row.paddle_subscription_id,
        plan: row.plan,
        paddlePriceId: row.paddle_price_id,
        status: row.status,
        currentPeriodStart: row.current_period_start,
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: row.cancel_at_period_end,
        canceledAt: row.canceled_at,
        lastEventAt: row.last_event_at,
    }
}
