import {PAID_PLAN_IDS, type PaidPlanId, type PaymentGateway, type SubscriptionRepository} from "../../../domain/billing";
import type {PaddleCredentials} from "../../../../packages/secret";

const PROVIDER = "paddle"

export default class HandlePaddleWebhook {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private prices: PaddleCredentials["prices"],
    ) {
    }

    /**
     * Applies one delivery before answering, so a failure becomes a 5xx and
     * Paddle retries it. Redeliveries of an applied event are no-ops.
     */
    async handle(rawBody: string, signature: string): Promise<void> {
        const event = await this.gateway.verifyWebhook(rawBody, signature)
        const alreadyProcessed = await this.subscriptionRepository.recordWebhook(PROVIDER, event)
        if (alreadyProcessed) return

        if (event.subscription) {
            const plan = this.planForPrice(event.subscription.paddlePriceId)
            if (!plan) {
                throw new Error(`paddle subscription ${event.subscription.paddleSubscriptionId} is on unknown price ${event.subscription.paddlePriceId}`)
            }
            await this.subscriptionRepository.apply({
                ...event.subscription,
                plan,
                occurredAt: event.occurredAt,
                eventId: event.eventId,
            })
        }

        await this.subscriptionRepository.markWebhookProcessed(PROVIDER, event.eventId)
    }

    private planForPrice(priceId: string): PaidPlanId | undefined {
        return PAID_PLAN_IDS.find(plan => this.prices[plan] === priceId)
    }
}
