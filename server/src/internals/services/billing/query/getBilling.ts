import type {User} from "../../../domain/user";
import type {SubscriptionRepository, SubscriptionStatus} from "../../../domain/billing";

export type Billing = {
    email: string
    plan: string
    status: SubscriptionStatus | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
}

export default class GetBilling {
    constructor(private subscriptionRepository: SubscriptionRepository) {
    }

    async handle(user: User): Promise<Billing> {
        const subscription = await this.subscriptionRepository.findLiveByUser(user.id)
        return {
            email: user.email,
            plan: user.plan,
            status: subscription?.status ?? null,
            currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
        }
    }
}
