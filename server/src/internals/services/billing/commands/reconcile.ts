import {type PaymentGateway, type SubscriptionRepository, UnprocessableEventError} from "../../../domain/billing";
import type HandlePaddleWebhook from "./handlePaddleWebhook.ts";
import type BillingAlerts from "../alerts.ts";

const PROVIDER = "paddle"
const MINUTE = 60_000
/** Long enough for a delivery that's still being applied to finish first. */
const STALLED_AFTER_MS = 5 * MINUTE
/** A renewal webhook this late probably isn't coming; Paddle is asked directly. */
const RENEWAL_OVERDUE_MS = 60 * MINUTE
const KEEP_EVENTS_MS = 90 * 24 * 60 * MINUTE
const BATCH = 50

/**
 * Catches what webhooks missed: deliveries left part-way, upgrades whose renewal
 * date Paddle wasn't told about, and paid periods that ended with no renewal on
 * record, which are re-read from Paddle's API. Runs every few minutes.
 */
export default class Reconcile {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private webhook: HandlePaddleWebhook,
        private alerts: BillingAlerts,
    ) {
    }

    async handle(): Promise<void> {
        if (!this.gateway.configured) return
        await this.replayStalled()
        await this.restartPendingCycles()
        await this.refreshLapsed()
        await this.subscriptionRepository.pruneWebhooks(new Date(Date.now() - KEEP_EVENTS_MS))
    }

    private async replayStalled() {
        const stalled = await this.subscriptionRepository.pendingWebhooks(PROVIDER, new Date(Date.now() - STALLED_AFTER_MS), BATCH)
        for (const stored of stalled) {
            try {
                // Its signature was checked when it arrived.
                await this.webhook.process(this.gateway.parseStoredEvent(stored.rawBody))
            } catch (error) {
                console.error(`replaying paddle event ${stored.eventId} failed`, error)
            }
        }
    }

    private async restartPendingCycles() {
        for (const subscription of await this.subscriptionRepository.withPendingNextBilledAt()) {
            const id = subscription.paddleSubscriptionId
            try {
                await this.gateway.restartBillingCycle(id, subscription.pendingNextBilledAt!)
                await this.subscriptionRepository.setPendingNextBilledAt(id, null)
            } catch (error) {
                console.error(`moving ${id}'s renewal after its upgrade failed again`, error)
            }
        }
    }

    private async refreshLapsed() {
        const lapsed = await this.subscriptionRepository.lapsed(new Date(Date.now() - RENEWAL_OVERDUE_MS), BATCH)
        for (const subscription of lapsed) {
            const id = subscription.paddleSubscriptionId
            try {
                const current = await this.gateway.getSubscription(id)
                await this.webhook.applySubscription(current, current.updatedAt, `reconcile:${id}:${current.updatedAt.toISOString()}`)
            } catch (error) {
                if (error instanceof UnprocessableEventError) {
                    await this.alerts.send(`lapsed:${id}`, "A lapsed subscription couldn't be refreshed", error.message)
                } else {
                    console.error(`refreshing lapsed subscription ${id} failed`, error)
                }
            }
        }
    }
}
