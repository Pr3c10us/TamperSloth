import type {User} from "../../../domain/user";
import type {PaymentGateway, SubscriptionRepository} from "../../../domain/billing";
import {BadRequestError} from "../../../../packages/errors";

export default class OpenPortal {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
    ) {
    }

    /** A Paddle customer portal link, where the user cancels, updates their card or downloads invoices. */
    async handle(user: User): Promise<{ url: string }> {
        if (!user.paddleCustomerId) throw new BadRequestError("There's no billing account to manage yet.")
        const subscription = await this.subscriptionRepository.findLiveByUser(user.id)
        const url = await this.gateway.portalUrl(user.paddleCustomerId, subscription ? [subscription.paddleSubscriptionId] : [])
        return {url}
    }
}
