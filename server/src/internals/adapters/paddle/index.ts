import {createHmac, timingSafeEqual} from "node:crypto";
import {
    type AdjustmentNotification,
    ApiError,
    Environment,
    type EventEntity,
    Paddle,
    type Subscription,
    type SubscriptionNotification,
    Webhooks,
} from "@paddle/paddle-node-sdk";
import type {
    AdjustmentSnapshot,
    Money,
    PaymentEvent,
    PaymentGateway,
    PlanChangeBilling,
    SubscriptionSnapshot,
} from "../../domain/billing";
import type {PaddleCredentials} from "../../../packages/secret";
import {
    ConflictError,
    InvalidSignatureError,
    PaymentRequiredError,
    ServiceUnavailableError,
    TooManyRequestsError,
} from "../../../packages/errors";

const LIVE_STATUSES = ["active", "trialing", "past_due"] as const

export default class PaddleGateway implements PaymentGateway {
    configured: boolean
    private client?: Paddle

    constructor(private credentials: PaddleCredentials) {
        this.configured = Boolean(credentials.apiKey && credentials.webhookSecret)
        if (credentials.apiKey) {
            this.client = new Paddle(credentials.apiKey, {
                environment: credentials.environment === "production" ? Environment.production : Environment.sandbox,
            })
        }
    }

    async resolveCustomer(email: string): Promise<string> {
        const paddle = this.paddle()
        try {
            const customer = await paddle.customers.create({email})
            return customer.id
        } catch (error) {
            if (!(error instanceof ApiError) || error.code !== "customer_already_exists") throw this.clientError(error)
        }
        // Someone with this email checked out before the customer id was saved, or bought outside the extension.
        const customers = await this.call(() => paddle.customers.list({email: [email]}).next())
        const match = customers.find(customer => customer.email.toLowerCase() === email.toLowerCase())
        if (!match) throw new ServiceUnavailableError("Billing is unavailable right now, try again")
        return match.id
    }

    async hasLiveSubscription(paddleCustomerId: string): Promise<boolean> {
        const subscriptions = await this.call(() => this.paddle().subscriptions
            .list({customerId: [paddleCustomerId], status: [...LIVE_STATUSES]}).next())
        return subscriptions.length > 0
    }

    async transactionStatus(transactionId: string): Promise<string | null> {
        try {
            return (await this.paddle().transactions.get(transactionId)).status
        } catch (error) {
            if (error instanceof ApiError && error.code === "entity_not_found") return null
            throw this.clientError(error)
        }
    }

    async createTransaction(params: { priceId: string, customerId: string, userId: string }): Promise<string> {
        const transaction = await this.call(() => this.paddle().transactions.create({
            items: [{priceId: params.priceId, quantity: 1}],
            customerId: params.customerId,
            customData: {userId: params.userId},
        }))
        return transaction.id
    }

    async previewPlanChange(paddleSubscriptionId: string, priceId: string, billing: PlanChangeBilling): Promise<Money | null> {
        const preview = await this.call(() => this.paddle().subscriptions.previewUpdate(paddleSubscriptionId, {
            items: [{priceId, quantity: 1}],
            prorationBillingMode: prorationMode(billing),
        }))
        const totals = preview.immediateTransaction?.details.totals
        return totals ? {amountMinor: Number(totals.grandTotal), currency: totals.currencyCode} : null
    }

    async changeSubscriptionPrice(paddleSubscriptionId: string, priceId: string, billing: PlanChangeBilling): Promise<void> {
        await this.call(() => this.paddle().subscriptions.update(paddleSubscriptionId, {
            items: [{priceId, quantity: 1}],
            prorationBillingMode: prorationMode(billing),
            // A declined charge leaves the plan as it was instead of putting it past due.
            onPaymentFailure: "prevent_change",
        }))
    }

    async restartBillingCycle(paddleSubscriptionId: string, from: Date): Promise<void> {
        const paddle = this.paddle()
        const subscription = await this.call(() => paddle.subscriptions.get(paddleSubscriptionId))
        // Paddle won't change items and the billing date in one request, so this follows the upgrade.
        await this.call(() => paddle.subscriptions.update(paddleSubscriptionId, {
            nextBilledAt: addCycle(from, subscription.billingCycle).toISOString(),
            prorationBillingMode: "do_not_bill",
        }))
    }

    async removeScheduledChange(paddleSubscriptionId: string): Promise<void> {
        // Paddle won't drop a scheduled change in the same update as other fields, so it's a call of its own.
        await this.call(() => this.paddle().subscriptions.update(paddleSubscriptionId, {scheduledChange: null}))
    }

    async cancelImmediately(paddleSubscriptionId: string): Promise<void> {
        const paddle = this.paddle()
        const subscription = await this.call(() => paddle.subscriptions.get(paddleSubscriptionId))
        if (subscription.status === "canceled") return
        await this.call(() => paddle.subscriptions.cancel(paddleSubscriptionId, {effectiveFrom: "immediately"}))
    }

    async refundFirstPayment(paddleSubscriptionId: string, reason: string): Promise<void> {
        const paddle = this.paddle()
        const transactions = await this.call(() => paddle.transactions
            .list({subscriptionId: [paddleSubscriptionId], status: ["paid", "completed"]}).next())
        const first = transactions.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
        if (!first) throw new Error(`no payment to refund for ${paddleSubscriptionId}`)
        await this.call(() => paddle.adjustments.create({action: "refund", type: "full", transactionId: first.id, reason}))
    }

    async getSubscription(paddleSubscriptionId: string): Promise<SubscriptionSnapshot & { updatedAt: Date }> {
        const subscription = await this.call(() => this.paddle().subscriptions.get(paddleSubscriptionId))
        return {...snapshot(subscription), updatedAt: new Date(subscription.updatedAt)}
    }

    async subscriptionForTransaction(transactionId: string): Promise<string | null> {
        return (await this.call(() => this.paddle().transactions.get(transactionId))).subscriptionId
    }

    async portalUrl(paddleCustomerId: string, paddleSubscriptionIds: string[]): Promise<string> {
        const session = await this.call(() => this.paddle().customerPortalSessions.create(paddleCustomerId, paddleSubscriptionIds))
        return session.urls.general.overview
    }

    async verifyWebhook(rawBody: string, signature: string): Promise<PaymentEvent> {
        if (!this.configured) throw new ServiceUnavailableError("Billing isn't set up")
        let event: EventEntity
        try {
            // Checks the HMAC and that the signature is at most a few seconds old, which stops replays.
            event = await this.paddle().webhooks.unmarshal(rawBody, this.credentials.webhookSecret, signature)
        } catch {
            throw new InvalidSignatureError(this.validSignatureAge(rawBody, signature))
        }
        return toPaymentEvent(event, rawBody)
    }

    parseStoredEvent(rawBody: string): PaymentEvent {
        return toPaymentEvent(Webhooks.fromJson(JSON.parse(rawBody)), rawBody)
    }

    /**
     * The age in seconds of a signature that is right but too old, or null when it's
     * simply wrong. A right but old signature from Paddle means this server's clock is off.
     */
    private validSignatureAge(rawBody: string, signature: string): number | null {
        const ts = /(?:^|;)ts=(\d+)/.exec(signature)?.[1]
        const h1 = /(?:^|;)h1=([a-f0-9]+)/.exec(signature)?.[1]
        if (!ts || !h1) return null
        const expected = createHmac("sha256", this.credentials.webhookSecret).update(`${ts}:${rawBody}`).digest()
        const given = Buffer.from(h1, "hex")
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
        return Math.round(Date.now() / 1000 - Number(ts))
    }

    private paddle(): Paddle {
        if (!this.configured || !this.client) throw new ServiceUnavailableError("Billing isn't set up")
        return this.client
    }

    private async call<T>(request: () => Promise<T>): Promise<T> {
        try {
            return await request()
        } catch (error) {
            throw this.clientError(error)
        }
    }

    /** Paddle's messages are for us, not the user: log them and answer with our own. */
    private clientError(error: unknown): Error {
        if (!(error instanceof ApiError)) return error instanceof Error ? error : new Error(String(error))
        console.error(`paddle answered ${error.code}: ${error.detail}`)
        if (error.code.startsWith("subscription_locked")) {
            return new ConflictError("Your plan is being renewed or changed right now. Try again in half an hour.", "BILLING_BUSY")
        }
        if (/declin|payment_failed|payment_method/.test(error.code)) {
            return new PaymentRequiredError("Your card was declined. Update it under Manage billing, then try again.", "PAYMENT_DECLINED")
        }
        if (error.code === "too_many_requests" || error.retryAfter) {
            return new TooManyRequestsError("Too many billing changes in a short time. Try again shortly.", error.retryAfter ?? 60)
        }
        const clientError = new ServiceUnavailableError("Billing is unavailable right now, try again")
        clientError.code = "BILLING_UNAVAILABLE"
        return clientError
    }
}

function prorationMode(billing: PlanChangeBilling) {
    return billing === "charge_full" ? "full_immediately" as const : "do_not_bill" as const
}

function addCycle(from: Date, cycle: { interval: string, frequency: number }): Date {
    const next = new Date(from)
    if (cycle.interval === "year") next.setUTCFullYear(next.getUTCFullYear() + cycle.frequency)
    else if (cycle.interval === "month") next.setUTCMonth(next.getUTCMonth() + cycle.frequency)
    else if (cycle.interval === "week") next.setUTCDate(next.getUTCDate() + 7 * cycle.frequency)
    else next.setUTCDate(next.getUTCDate() + cycle.frequency)
    return next
}

function toPaymentEvent(event: EventEntity, rawBody: string): PaymentEvent {
    return {
        eventId: event.eventId,
        type: event.eventType,
        occurredAt: new Date(event.occurredAt),
        rawBody,
        ...(event.eventType.startsWith("subscription.") && {
            subscription: snapshot(event.data as SubscriptionNotification),
        }),
        ...(event.eventType.startsWith("adjustment.") && {
            adjustment: adjustment(event.data as AdjustmentNotification),
        }),
    }
}

/** A webhook's subscription and an API one have the same fields this needs. */
function snapshot(subscription: SubscriptionNotification | Subscription): SubscriptionSnapshot {
    const item = subscription.items.find(item => item.recurring) ?? subscription.items[0]
    const userId = subscription.customData?.userId
    const plan = item?.price?.customData?.plan
    const period = subscription.currentBillingPeriod
    return {
        paddleSubscriptionId: subscription.id,
        paddleCustomerId: subscription.customerId,
        paddlePriceId: item?.price?.id ?? "",
        planHint: typeof plan === "string" ? plan : null,
        userId: typeof userId === "string" ? userId : null,
        status: subscription.status,
        currentPeriodStart: period ? new Date(period.startsAt) : null,
        currentPeriodEnd: period ? new Date(period.endsAt) : null,
        cancelAtPeriodEnd: subscription.scheduledChange?.action === "cancel",
        canceledAt: subscription.canceledAt ? new Date(subscription.canceledAt) : null,
    }
}

function adjustment(data: AdjustmentNotification): AdjustmentSnapshot {
    return {
        id: data.id,
        action: data.action,
        status: data.status,
        type: data.type,
        transactionId: data.transactionId,
        paddleSubscriptionId: data.subscriptionId,
        paddleCustomerId: data.customerId,
    }
}
