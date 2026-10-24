import type {User} from "../../../domain/user";
import type {Money, PaidPlanId, PaymentGateway, Subscription, SubscriptionRepository} from "../../../domain/billing";
import type {UsageRepository} from "../../../domain/usage";
import {billingPeriod, creditAllowanceMicros, planFor, planRank} from "../../../domain/plan";
import type PlanPrices from "../prices.ts";
import type BillingAlerts from "../alerts.ts";
import {BadRequestError, ConflictError} from "../../../../packages/errors";
import {generatePlanChangeToken, verifyPlanChangeToken} from "../../../../packages/utils/encryption.ts";

/**
 * upgrade: the new plan's full price now, and a fresh period from today.
 * downgrade: the new plan from the next renewal; nothing is charged or refunded.
 * keep: undoes a downgrade that hasn't happened yet; nothing is charged.
 */
export type PlanChangeKind = "upgrade" | "downgrade" | "keep"

export type PlanChangePreview = {
    plan: PaidPlanId
    kind: PlanChangeKind
    /** What's charged today, tax and Paddle account credit included; null when nothing is. */
    chargeToday: Money | null
    /** When the user is on the new plan. */
    effectiveAt: string
    /** For an upgrade: the new plan's credit, and the old plan's unused credit it brings along. */
    credits: { plan: number, carriedOver: number } | null
    /** Proves the change is the one previewed; required to make it. */
    confirmToken: string
}

// Retries for moving the renewal date right after an upgrade, while Paddle may still be processing its charge.
const RESTART_RETRY_MS = [2_000, 5_000]

export default class ChangePlan {
    constructor(
        private gateway: PaymentGateway,
        private subscriptionRepository: SubscriptionRepository,
        private usageRepository: UsageRepository,
        private prices: PlanPrices,
        private alerts: BillingAlerts,
        private creditsPerUsd: number,
    ) {
    }

    async preview(user: User, plan: PaidPlanId): Promise<PlanChangePreview> {
        const {subscription, kind} = await this.plan(user, plan)
        const upgrade = kind === "upgrade"
        const chargeToday = upgrade
            ? await this.gateway.previewPlanChange(subscription.paddleSubscriptionId, this.prices.priceFor(plan), "charge_full")
            : null
        const effectiveAt = kind === "downgrade" ? subscription.currentPeriodEnd ?? new Date() : new Date()
        return {
            plan,
            kind,
            chargeToday,
            effectiveAt: effectiveAt.toISOString(),
            credits: upgrade
                ? {plan: planFor(plan).monthlyCreditUsd * this.creditsPerUsd, carriedOver: this.credits(await this.unusedCredit(user))}
                : null,
            confirmToken: generatePlanChangeToken({id: user.id, plan, kind, subscription: subscription.paddleSubscriptionId}),
        }
    }

    /**
     * Makes the previewed change. Upgrades are charged here; Paddle then sends
     * subscription.updated and the webhook moves the plan.
     */
    async confirm(user: User, plan: PaidPlanId, confirmToken: string): Promise<void> {
        const previewed = verifyPlanChangeToken(confirmToken)
        if (!previewed || previewed.id !== user.id || previewed.plan !== plan) {
            throw new BadRequestError("This confirmation has expired. Review the change and confirm it again.")
        }
        const {subscription, kind} = await this.plan(user, plan)
        if (previewed.kind !== kind || previewed.subscription !== subscription.paddleSubscriptionId) {
            throw new ConflictError("Your plan changed since you reviewed this. Review the change again.", "PLAN_CHANGED")
        }
        const id = subscription.paddleSubscriptionId
        // Choosing a plan while a cancellation is scheduled means staying, so the cancellation goes first.
        if (subscription.cancelAtPeriodEnd) await this.gateway.removeScheduledChange(id)

        if (kind !== "upgrade") {
            await this.gateway.changeSubscriptionPrice(id, this.prices.priceFor(plan), "no_charge")
            return
        }
        // Measured before the charge, so credit spent on the old plan stays with it.
        const carriedOver = await this.unusedCredit(user)
        await this.gateway.changeSubscriptionPrice(id, this.prices.priceFor(plan), "charge_full")
        const upgradedAt = new Date()
        await this.subscriptionRepository.startCreditWindow(user.id, upgradedAt, carriedOver)
        await this.restartBillingCycle(subscription, upgradedAt)
    }

    /** Which kind of change this is, or why it can't be made. */
    private async plan(user: User, target: PaidPlanId): Promise<{ subscription: Subscription, kind: PlanChangeKind }> {
        const subscription = await this.subscriptionRepository.findLiveByUser(user.id)
        if (!subscription) throw new BadRequestError("You don't have a paid plan to switch. Choose a plan to subscribe.")
        if (subscription.status === "past_due") {
            throw new BadRequestError("Your last payment didn't go through. Update your card under Manage billing before switching plans.")
        }
        const entitled = subscription.entitledPlan
        if (target === entitled) {
            if (subscription.plan === entitled) throw new BadRequestError(`You're already on ${planFor(target).name}.`)
            return {subscription, kind: "keep"}
        }
        if (planRank(target) > planRank(entitled)) return {subscription, kind: "upgrade"}
        if (subscription.plan === target) {
            const on = subscription.currentPeriodEnd?.toLocaleDateString("en-US", {month: "long", day: "numeric", timeZone: "UTC"})
            throw new BadRequestError(`Your switch to ${planFor(target).name} is already set for ${on ?? "your next renewal"}.`)
        }
        return {subscription, kind: "downgrade"}
    }

    /** The current plan's credit not yet spent this period, in USD micros. */
    private async unusedCredit(user: User): Promise<number> {
        const spent = await this.usageRepository.spentSince(user.id, billingPeriod(user).start)
        return Math.max(0, creditAllowanceMicros(user) - spent)
    }

    private credits(micros: number): number {
        return Math.floor(micros / 1e6 * this.creditsPerUsd * 10) / 10
    }

    /**
     * The upgrade paid for a full billing cycle from today, so the renewal moves
     * there. Paddle may still be processing the charge; the reconcile job keeps
     * trying if these attempts fail.
     */
    private async restartBillingCycle(subscription: Subscription, from: Date) {
        const id = subscription.paddleSubscriptionId
        for (let attempt = 0; ; attempt++) {
            try {
                await this.gateway.restartBillingCycle(id, from)
                return
            } catch (error) {
                const wait = RESTART_RETRY_MS[attempt]
                if (wait === undefined) {
                    console.error(`couldn't move ${id}'s renewal after its upgrade; the reconcile job will retry`, error)
                    await this.subscriptionRepository.setPendingNextBilledAt(id, from)
                    await this.alerts.send(`restart:${id}`, "An upgrade's renewal date didn't move",
                        `Subscription ${id} was upgraded at ${from.toISOString()}, but Paddle didn't accept moving its next renewal ` +
                        `to one cycle later. The reconcile job keeps trying every 10 minutes; if it still fails, set next_billed_at in Paddle ` +
                        `so the customer isn't charged again at the old renewal date.`)
                    return
                }
                await new Promise(resolve => setTimeout(resolve, wait))
            }
        }
    }
}
