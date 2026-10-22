import type {User} from "../../../domain/user";
import type {PaidPlanId, PaymentGateway, SubscriptionRepository} from "../../../domain/billing";
import type {PaddleCredentials} from "../../../../packages/secret";
import {ConflictError} from "../../../../packages/errors";

export default class CreateCheckout {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private prices: PaddleCredentials["prices"],
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

        const transactionId = await this.gateway.createTransaction({
            priceId: this.prices[plan],
            customerId,
            userId: user.id,
        })
        return {transactionId}
    }
}
