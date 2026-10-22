import type {User} from "../../../domain/user";
import type {PaidPlanId, PaymentGateway, SubscriptionRepository} from "../../../domain/billing";
import type {PaddleCredentials} from "../../../../packages/secret";
import {BadRequestError} from "../../../../packages/errors";

export default class ChangePlan {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private prices: PaddleCredentials["prices"],
    ) {
    }

    /**
     * Moves the live subscription to another paid plan, prorated now. Nothing is
     * written here: Paddle sends subscription.updated, and the webhook moves the plan.
     */
    async handle(user: User, plan: PaidPlanId): Promise<void> {
        const subscription = await this.subscriptionRepository.findLiveByUser(user.id)
        if (!subscription) throw new BadRequestError("You don't have a paid plan to switch. Choose a plan to subscribe.")
        if (subscription.plan === plan) return
        if (subscription.status === "past_due") {
            throw new BadRequestError("Your last payment didn't go through. Update your payment method before switching plans.")
        }
        // Choosing a plan while a cancellation is scheduled means staying, so the cancellation is dropped.
        await this.gateway.changeSubscriptionPrice(subscription.paddleSubscriptionId, this.prices[plan], subscription.cancelAtPeriodEnd)
    }
}
