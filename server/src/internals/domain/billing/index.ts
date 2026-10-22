export type PaidPlanId = "go" | "pro"

export const PAID_PLAN_IDS: PaidPlanId[] = ["go", "pro"]

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled"

/** Statuses that keep the paid plan; past_due too, while Paddle retries the payment. */
export function isLive(status: SubscriptionStatus): boolean {
    return status === "trialing" || status === "active" || status === "past_due"
}

export type Subscription = {
    id: string
    userId: string
    paddleSubscriptionId: string
    plan: PaidPlanId
    paddlePriceId: string
    status: SubscriptionStatus
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
    lastEventAt: Date
}

export type SubscriptionEventType =
    | "created"
    | "activated"
    | "plan_changed"
    | "renewed"
    | "payment_failed"
    | "payment_recovered"
    | "cancel_scheduled"
    | "cancel_reverted"
    | "paused"
    | "resumed"
    | "canceled"

/** A subscription as Paddle last described it, in the webhook that carried it. */
export type SubscriptionSnapshot = {
    paddleSubscriptionId: string
    paddleCustomerId: string
    paddlePriceId: string
    /** From the custom data checkout put on the transaction; Paddle copies it to the subscription. */
    userId: string | null
    status: SubscriptionStatus
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
}

export type SubscriptionChange = SubscriptionSnapshot & {
    plan: PaidPlanId
    occurredAt: Date
    eventId: string
}

/**
 * What changed between the stored subscription and the one a webhook carries.
 * Every subscription event holds the whole entity, so the event's own name is
 * not needed; null means nothing worth recording changed.
 */
export function inferEventType(existing: Subscription | undefined, next: SubscriptionChange): SubscriptionEventType | null {
    if (!existing) return "created"
    if (next.plan !== existing.plan) return "plan_changed"
    if (next.status !== existing.status) return statusChangeEventType(existing.status, next.status)
    if (next.currentPeriodStart && existing.currentPeriodStart && next.currentPeriodStart > existing.currentPeriodStart) {
        return "renewed"
    }
    if (next.cancelAtPeriodEnd !== existing.cancelAtPeriodEnd) {
        return next.cancelAtPeriodEnd ? "cancel_scheduled" : "cancel_reverted"
    }
    return null
}

function statusChangeEventType(from: SubscriptionStatus, to: SubscriptionStatus): SubscriptionEventType {
    switch (to) {
        case "active":
            if (from === "past_due") return "payment_recovered"
            if (from === "paused") return "resumed"
            return "activated"
        case "past_due":
            return "payment_failed"
        case "paused":
            return "paused"
        case "canceled":
            return "canceled"
        default:
            return "activated"
    }
}

/** A verified webhook. subscription is set for subscription.* events. */
export type PaymentEvent = {
    eventId: string
    type: string
    occurredAt: Date
    rawBody: string
    subscription?: SubscriptionSnapshot
}

export interface PaymentGateway {
    /** False until the Paddle keys are set; billing routes answer 503 until then. */
    configured: boolean
    /** The Paddle customer for this email, created when there is none. */
    resolveCustomer: (email: string) => Promise<string>
    /** A checkout transaction for one plan price; Paddle.js opens it by id. */
    createTransaction: (params: { priceId: string, customerId: string, userId: string }) => Promise<string>
    /** Swaps the subscription onto another price, prorated now; keepActive drops a scheduled cancellation. */
    changeSubscriptionPrice: (paddleSubscriptionId: string, priceId: string, keepActive: boolean) => Promise<void>
    portalUrl: (paddleCustomerId: string, paddleSubscriptionIds: string[]) => Promise<string>
    /** Verifies the signature and parses the event; throws when the signature is wrong or stale. */
    verifyWebhook: (rawBody: string, signature: string) => Promise<PaymentEvent>
}

export interface SubscriptionRepository {
    /** Stores the delivery; true when this event was already applied. */
    recordWebhook: (provider: string, event: PaymentEvent) => Promise<boolean>
    markWebhookProcessed: (provider: string, eventId: string) => Promise<void>
    findLiveByUser: (userId: string) => Promise<Subscription | null>
    setPaddleCustomerId: (userId: string, paddleCustomerId: string) => Promise<void>
    /** Upserts the subscription, logs what changed and moves users.plan with it. */
    apply: (change: SubscriptionChange) => Promise<void>
}
