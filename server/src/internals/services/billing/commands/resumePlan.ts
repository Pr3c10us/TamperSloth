import type {User} from "../../../domain/user";
import type {PaymentGateway, SubscriptionRepository} from "../../../domain/billing";
import {BadRequestError} from "../../../../packages/errors";

export default class ResumePlan {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
    ) {
    }

    /** Undoes a cancellation that hasn't happened yet, so the plan renews as before. */
    async handle(user: User): Promise<void> {
        const subscription = await this.subscriptionRepository.findLiveByUser(user.id)
        if (!subscription?.cancelAtPeriodEnd) throw new BadRequestError("Your plan isn't set to cancel.")
        await this.gateway.removeScheduledChange(subscription.paddleSubscriptionId)
    }
}
