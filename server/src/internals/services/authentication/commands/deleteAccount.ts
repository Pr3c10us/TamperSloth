import type Repository from "../../../domain/user/repository.ts";
import type {PaymentGateway, SubscriptionRepository} from "../../../domain/billing";

export default class DeleteAccount {
    constructor(
        private accountRepository: Repository,
        private paymentGateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
    ) {
    }

    handle = async (id: string): Promise<void> => {
        // Deleting the user deletes their subscription rows, but Paddle would go on charging the card.
        const subscription = await this.subscriptionRepository.findLiveByUser(id)
        if (subscription) await this.paymentGateway.cancelImmediately(subscription.paddleSubscriptionId)
        await this.accountRepository.delete(id)
    };
}
