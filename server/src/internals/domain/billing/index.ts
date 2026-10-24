import {planRank} from "../plan";

export type PaidPlanId = "go" | "pro"

export const PAID_PLAN_IDS: PaidPlanId[] = ["go", "pro"]

export function isPaidPlan(plan: unknown): plan is PaidPlanId {
    return plan === "go" || plan === "pro"
}

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "paused" | "canceled"

/** Statuses that keep the paid plan; past_due too, while Paddle retries the payment. */
export function isLive(status: SubscriptionStatus): boolean {
    return status === "trialing" || status === "active" || status === "past_due"
}

export type Subscription = {
    id: string
    userId: string
    paddleSubscriptionId: string
    /** The plan Paddle bills next. */
    plan: PaidPlanId
    /** The plan paid for this period; above plan while a downgrade waits for the renewal. */
    entitledPlan: PaidPlanId
    paddlePriceId: string
    status: SubscriptionStatus
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
    lastEventAt: Date
    /**
     * When an upgrade whose renewal date Paddle wasn't yet told to move was made;
     * the reconcile job moves the renewal to one billing cycle after it.
     */
    pendingNextBilledAt: Date | null
}

export type SubscriptionEventType =
    | "created"
    | "activated"
    | "upgraded"
    | "downgrade_scheduled"
    | "downgrade_reverted"
    | "plan_changed"
    | "renewed"
    | "payment_failed"
    | "payment_recovered"
    | "cancel_scheduled"
    | "cancel_reverted"
    | "paused"
    | "resumed"
    | "canceled"

/** A subscription as Paddle last described it. */
export type SubscriptionSnapshot = {
    paddleSubscriptionId: string
    paddleCustomerId: string
    paddlePriceId: string
    /** custom_data.plan on the price, when the price is tagged; otherwise the price id is looked up. */
    planHint: string | null
    /** From the custom data checkout put on the transaction; Paddle copies it to the subscription. */
    userId: string | null
    status: SubscriptionStatus
    currentPeriodStart: Date | null
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
    canceledAt: Date | null
}

export type SubscriptionChange = SubscriptionSnapshot & {
    userId: string
    plan: PaidPlanId
    occurredAt: Date
    eventId: string
}

function samePeriod(existing: Subscription, next: SubscriptionChange): boolean {
    const a = existing.currentPeriodStart, b = next.currentPeriodStart
    return !a || !b || a.getTime() === b.getTime()
}

/**
 * The plan the user gets for this period. An upgrade is paid in full when it's
 * made, so it applies at once; a downgrade is billed from the next renewal, so
 * the plan already paid for stays until the period ends.
 */
export function entitlementFor(existing: Subscription | undefined, next: SubscriptionChange): PaidPlanId {
    if (!existing || !samePeriod(existing, next)) return next.plan
    return planRank(next.plan) > planRank(existing.entitledPlan) ? next.plan : existing.entitledPlan
}

/**
 * What changed between the stored subscription and the one a webhook carries.
 * Every subscription event holds the whole entity, so the event's own name is
 * not needed; null means nothing worth recording changed.
 */
export function inferEventType(existing: Subscription | undefined, next: SubscriptionChange, entitled: PaidPlanId): SubscriptionEventType | null {
    if (!existing) return "created"
    if (next.plan !== existing.plan) {
        if (!samePeriod(existing, next)) return "plan_changed"
        if (entitled !== existing.entitledPlan) return "upgraded"
        return next.plan === entitled ? "downgrade_reverted" : "downgrade_scheduled"
    }
    if (next.status !== existing.status) return statusChangeEventType(existing.status, next.status)
    if (!samePeriod(existing, next)) return "renewed"
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

/** A refund, credit or chargeback Paddle recorded against a payment. */
export type AdjustmentSnapshot = {
    id: string
    action: "credit" | "credit_reverse" | "refund" | "chargeback" | "chargeback_reverse" | "chargeback_warning" | "chargeback_warning_reverse"
    status: "pending_approval" | "approved" | "rejected" | "reversed"
    /** full or partial. */
    type: string
    transactionId: string
    paddleSubscriptionId: string | null
    paddleCustomerId: string
}

/** A verified webhook. subscription or adjustment is set for those events. */
export type PaymentEvent = {
    eventId: string
    type: string
    occurredAt: Date
    rawBody: string
    subscription?: SubscriptionSnapshot
    adjustment?: AdjustmentSnapshot
}

/** A webhook that can never apply, such as one for an unknown price or user. It's parked, not retried. */
export class UnprocessableEventError extends Error {
}

/** How a plan change is billed: the new plan's full price now, or nothing until the next renewal. */
export type PlanChangeBilling = "charge_full" | "no_charge"

export type Money = { amountMinor: number, currency: string }

export interface PaymentGateway {
    /** False until the Paddle keys are set; billing routes answer 503 until then. */
    configured: boolean
    /** The Paddle customer for this email, created when there is none. */
    resolveCustomer: (email: string) => Promise<string>
    /** Whether Paddle already bills this customer for a subscription our records may not have yet. */
    hasLiveSubscription: (paddleCustomerId: string) => Promise<boolean>
    /** A checkout transaction's status in Paddle (ready, paid, completed, ...), or null when it's gone. */
    transactionStatus: (transactionId: string) => Promise<string | null>
    /** A checkout transaction for one plan price; Paddle.js opens it by id. */
    createTransaction: (params: { priceId: string, customerId: string, userId: string }) => Promise<string>
    /** What a plan change would charge now, tax and account credit included. */
    previewPlanChange: (paddleSubscriptionId: string, priceId: string, billing: PlanChangeBilling) => Promise<Money | null>
    /** Swaps the subscription onto another price; a declined charge leaves it as it was. */
    changeSubscriptionPrice: (paddleSubscriptionId: string, priceId: string, billing: PlanChangeBilling) => Promise<void>
    /** Moves the next renewal to one billing cycle after `from`, with nothing billed for the move. */
    restartBillingCycle: (paddleSubscriptionId: string, from: Date) => Promise<void>
    removeScheduledChange: (paddleSubscriptionId: string) => Promise<void>
    /** Ends the subscription now; a no-op when it already ended. */
    cancelImmediately: (paddleSubscriptionId: string) => Promise<void>
    /** Refunds the payment that started the subscription in full. */
    refundFirstPayment: (paddleSubscriptionId: string, reason: string) => Promise<void>
    getSubscription: (paddleSubscriptionId: string) => Promise<SubscriptionSnapshot & { updatedAt: Date }>
    /** The subscription a payment belongs to, for adjustments that don't name one. */
    subscriptionForTransaction: (transactionId: string) => Promise<string | null>
    portalUrl: (paddleCustomerId: string, paddleSubscriptionIds: string[]) => Promise<string>
    /** Verifies the signature and parses the event; throws when the signature is wrong or stale. */
    verifyWebhook: (rawBody: string, signature: string) => Promise<PaymentEvent>
    /** Parses an event stored after it was verified, to process it again. */
    parseStoredEvent: (rawBody: string) => PaymentEvent
}

/** A user's billing fields the webhook checks against. */
export type BillingAccount = {
    userId: string
    paddleCustomerId: string | null
}

export type OpenCheckout = {
    transactionId: string
    plan: PaidPlanId
    createdAt: Date
}

export type StoredWebhook = {
    eventId: string
    rawBody: string
}

export interface SubscriptionRepository {
    /** Stores the delivery; true when this event was already applied or parked. */
    recordWebhook: (provider: string, event: PaymentEvent) => Promise<boolean>
    markWebhookProcessed: (provider: string, eventId: string) => Promise<void>
    markWebhookFailed: (provider: string, eventId: string, error: string) => Promise<void>
    /** Deliveries that failed part-way and were never applied, oldest first. */
    pendingWebhooks: (provider: string, receivedBefore: Date, limit: number) => Promise<StoredWebhook[]>
    pruneWebhooks: (processedBefore: Date) => Promise<number>
    billingAccount: (userId: string) => Promise<BillingAccount | null>
    findByPaddleId: (paddleSubscriptionId: string) => Promise<Subscription | null>
    findLiveByUser: (userId: string) => Promise<Subscription | null>
    setPaddleCustomerId: (userId: string, paddleCustomerId: string) => Promise<void>
    openCheckout: (userId: string) => Promise<OpenCheckout | null>
    saveCheckout: (userId: string, checkout: OpenCheckout | null) => Promise<void>
    /** Upserts the subscription, logs what changed and moves users.plan with it; false when the event was stale. */
    apply: (change: SubscriptionChange) => Promise<boolean>
    /** Restarts the user's credit window at an upgrade, with the old plan's unused credit carried over. */
    startCreditWindow: (userId: string, start: Date, bonusMicros: number) => Promise<void>
    setPendingNextBilledAt: (paddleSubscriptionId: string, at: Date | null) => Promise<void>
    withPendingNextBilledAt: () => Promise<Subscription[]>
    /** Live subscriptions of users whose paid period ended before `endedBefore` with no renewal recorded. */
    lapsed: (endedBefore: Date, limit: number) => Promise<Subscription[]>
}
