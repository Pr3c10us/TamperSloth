import type {User} from "../../../domain/user";
import type {SubscriptionRepository, SubscriptionStatus} from "../../../domain/billing";
import {entitledPlan} from "../../../domain/plan";

export type Billing = {
    email: string
    /** The plan the user has now. */
    plan: string
    status: SubscriptionStatus | null
    currentPeriodEnd: string | null
    cancelAtPeriodEnd: boolean
    /** A downgrade waiting for the renewal: the plan the user moves to at currentPeriodEnd. */
    scheduledPlan: string | null
}

export default class GetBilling {
    constructor(private subscriptionRepository: SubscriptionRepository) {
    }

    async handle(user: User): Promise<Billing> {
        const subscription = await this.subscriptionRepository.findLiveByUser(user.id)
        return {
            email: user.email,
            plan: entitledPlan(user).id,
            status: subscription?.status ?? null,
            currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
            scheduledPlan: subscription && subscription.plan !== subscription.entitledPlan ? subscription.plan : null,
        }
    }
}
