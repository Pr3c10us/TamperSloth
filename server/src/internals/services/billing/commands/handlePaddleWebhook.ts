import {
    type AdjustmentSnapshot,
    isLive,
    type PaymentEvent,
    type PaymentGateway,
    type Subscription,
    type SubscriptionRepository,
    type SubscriptionSnapshot,
    UnprocessableEventError,
} from "../../../domain/billing";
import type PlanPrices from "../prices.ts";
import type BillingAlerts from "../alerts.ts";
import {InvalidSignatureError} from "../../../../packages/errors";

const PROVIDER = "paddle"
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default class HandlePaddleWebhook {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private prices: PlanPrices,
        private alerts: BillingAlerts,
    ) {
    }

    /**
     * Applies one delivery before answering, so a failure becomes a 5xx and
     * Paddle retries it. Redeliveries of an applied or parked event are no-ops.
     */
    async handle(rawBody: string, signature: string): Promise<void> {
        let event: PaymentEvent
        try {
            event = await this.gateway.verifyWebhook(rawBody, signature)
        } catch (error) {
            // Paddle's own signature, but older than the SDK's few seconds: this server's clock is off.
            if (error instanceof InvalidSignatureError && error.ageSeconds !== null) {
                void this.alerts.send("clock", "Paddle webhooks are being rejected",
                    `A correctly signed Paddle webhook arrived ${error.ageSeconds}s after Paddle signed it, and Paddle's SDK only ` +
                    `accepts 5 seconds. If this repeats, the server's clock is wrong: no plan changes are being applied until it's synced.`)
            }
            throw error
        }
        if (await this.subscriptionRepository.recordWebhook(PROVIDER, event)) return
        await this.process(event)
    }

    /** Applies a recorded event; the reconcile job calls this for ones left part-way. */
    async process(event: PaymentEvent): Promise<void> {
        try {
            if (event.subscription) await this.applySubscription(event.subscription, event.occurredAt, event.eventId)
            if (event.adjustment) await this.applyAdjustment(event.adjustment)
            await this.subscriptionRepository.markWebhookProcessed(PROVIDER, event.eventId)
        } catch (error) {
            // Retrying can't fix these, so they're parked for a person instead of failing for days.
            if (!(error instanceof UnprocessableEventError)) throw error
            await this.subscriptionRepository.markWebhookFailed(PROVIDER, event.eventId, error.message)
            await this.alerts.send(`unprocessable:${event.eventId}`, "A Paddle event couldn't be applied",
                `${event.type} ${event.eventId}: ${error.message}\n\nIt's kept in webhook_events with failed_at set. ` +
                `Once the cause is fixed, clear failed_at and the reconcile job applies it.`)
        }
    }

    async applySubscription(snapshot: SubscriptionSnapshot, occurredAt: Date, eventId: string): Promise<void> {
        const id = snapshot.paddleSubscriptionId
        const plan = this.prices.planFor(snapshot.paddlePriceId, snapshot.planHint)
        if (!plan) {
            throw new UnprocessableEventError(`subscription ${id} is on price ${snapshot.paddlePriceId || "(none)"}, which isn't in ` +
                `PADDLE_PRICE_GO or PADDLE_PRICE_PRO and has no "plan" in its custom data`)
        }

        const existing = await this.subscriptionRepository.findByPaddleId(id)
        let userId = existing?.userId
        if (!userId) {
            userId = await this.newSubscriptionOwner(snapshot)
            if (isLive(snapshot.status)) {
                const live = await this.subscriptionRepository.findLiveByUser(userId)
                if (live) return await this.turnAwayDuplicate(snapshot, live, userId)
            }
        }
        await this.subscriptionRepository.apply({...snapshot, userId, plan, occurredAt, eventId})
    }

    /**
     * Paddle.js is public, so anyone can open a checkout with any custom data. A
     * subscription only counts when it came from our checkout: its user exists and
     * it's billed to the Paddle customer our checkout made for that user.
     */
    private async newSubscriptionOwner(snapshot: SubscriptionSnapshot): Promise<string> {
        const id = snapshot.paddleSubscriptionId
        if (!snapshot.userId || !UUID.test(snapshot.userId)) {
            throw new UnprocessableEventError(`subscription ${id} names no TamperSloth user in its custom data, so it wasn't started from our checkout`)
        }
        const account = await this.subscriptionRepository.billingAccount(snapshot.userId)
        if (!account) throw new UnprocessableEventError(`subscription ${id} names user ${snapshot.userId}, who doesn't exist`)
        if (account.paddleCustomerId !== snapshot.paddleCustomerId) {
            throw new UnprocessableEventError(`subscription ${id} is billed to Paddle customer ${snapshot.paddleCustomerId}, but user ` +
                `${account.userId}'s checkout used ${account.paddleCustomerId ?? "none"}, so it wasn't started from our checkout`)
        }
        return account.userId
    }

    /**
     * A second subscription for a user who already has one: two tabs, or a
     * checkout opened outside ours. Both would be billed, so the new one is
     * canceled and its payment refunded before it ever counts.
     */
    private async turnAwayDuplicate(snapshot: SubscriptionSnapshot, live: Subscription, userId: string) {
        const id = snapshot.paddleSubscriptionId
        await this.gateway.cancelImmediately(id)
        let refund = "and its payment refunded"
        try {
            await this.gateway.refundFirstPayment(id, "Duplicate subscription: this account already had a TamperSloth plan.")
        } catch (error) {
            console.error(`couldn't refund duplicate subscription ${id}`, error)
            refund = "but refunding its payment failed: refund it in Paddle"
        }
        await this.alerts.send(`duplicate:${id}`, "A duplicate subscription was canceled",
            `User ${userId} already had subscription ${live.paddleSubscriptionId}. The new one, ${id}, was canceled ${refund}.`)
    }

    /**
     * A full refund or a chargeback takes the money back, so the plan ends now.
     * Partial refunds and chargeback warnings are left for a person to judge.
     */
    private async applyAdjustment(adjustment: AdjustmentSnapshot) {
        const fullRefund = adjustment.action === "refund" && adjustment.status === "approved" && adjustment.type === "full"
        const chargeback = adjustment.action === "chargeback"
        if (!fullRefund && !chargeback) {
            if ((adjustment.action === "refund" && adjustment.status === "approved") || adjustment.action === "chargeback_warning") {
                await this.alerts.send(`adjustment:${adjustment.id}`, `A ${adjustment.type} ${adjustment.action.replace("_", " ")} came in`,
                    `Adjustment ${adjustment.id} on payment ${adjustment.transactionId} (customer ${adjustment.paddleCustomerId}). ` +
                    `The plan was left as it is; cancel it in Paddle if it should end.`)
            }
            return
        }
        const id = adjustment.paddleSubscriptionId ?? await this.gateway.subscriptionForTransaction(adjustment.transactionId)
        if (!id) return
        const subscription = await this.subscriptionRepository.findByPaddleId(id)
        if (!subscription || !isLive(subscription.status)) return
        await this.gateway.cancelImmediately(id)
        await this.alerts.send(`adjustment:${adjustment.id}`, chargeback ? "A chargeback ended a plan" : "A refund ended a plan",
            `${chargeback ? "A chargeback" : "A full refund"} (${adjustment.id}) on payment ${adjustment.transactionId} ` +
            `canceled subscription ${id} for user ${subscription.userId}; they're back on Free.`)
    }
}
