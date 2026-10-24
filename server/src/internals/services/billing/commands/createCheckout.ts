import type {User} from "../../../domain/user";
import type {PaidPlanId, PaymentGateway, SubscriptionRepository} from "../../../domain/billing";
import type PlanPrices from "../prices.ts";
import {ConflictError} from "../../../../packages/errors";

/** An unpaid checkout is reused for this long, so two clicks or two tabs share one payment. */
const CHECKOUT_REUSE_MS = 24 * 60 * 60 * 1000

const PAID_STATUSES = ["billed", "paid", "completed"]

export default class CreateCheckout {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private prices: PlanPrices,
    ) {
    }

    /** A Paddle transaction for the plan, which the pricing page opens in Paddle checkout. */
    async handle(user: User, plan: PaidPlanId): Promise<{ transactionId: string }> {
        // A second checkout would start a second subscription; switching plans goes through change-plan.
        if (await this.subscriptionRepository.findLiveByUser(user.id)) {
            throw new ConflictError("You already have a paid plan. Switch plans instead.", "ALREADY_SUBSCRIBED")
        }

        let customerId = user.paddleCustomerId
        if (!customerId) {
            customerId = await this.gateway.resolveCustomer(user.email)
            await this.subscriptionRepository.setPaddleCustomerId(user.id, customerId)
        }
        // A payment from a moment ago, or from another tab, whose webhook hasn't landed yet.
        if (await this.gateway.hasLiveSubscription(customerId)) throw paymentInProgress()

        const open = await this.subscriptionRepository.openCheckout(user.id)
        if (open && Date.now() - open.createdAt.getTime() < CHECKOUT_REUSE_MS) {
            const status = await this.gateway.transactionStatus(open.transactionId)
            if (status && PAID_STATUSES.includes(status)) throw paymentInProgress()
            if (open.plan === plan && (status === "ready" || status === "draft")) return {transactionId: open.transactionId}
        }

        const transactionId = await this.gateway.createTransaction({
            priceId: this.prices.priceFor(plan),
            customerId,
            userId: user.id,
        })
        await this.subscriptionRepository.saveCheckout(user.id, {transactionId, plan, createdAt: new Date()})
        return {transactionId}
    }
}

function paymentInProgress() {
    return new ConflictError("Your payment went through and your plan is being set up. Refresh in a moment.", "ALREADY_SUBSCRIBED")
}
