import {isPaidPlan, PAID_PLAN_IDS, type PaidPlanId} from "../../domain/billing";
import type {PaddleCredentials} from "../../../packages/secret";

/** Which Paddle prices sell which plan. */
export default class PlanPrices {
    constructor(private prices: PaddleCredentials["prices"]) {
    }

    /** The price checkout and plan changes sell. */
    priceFor(plan: PaidPlanId): string {
        return this.prices[plan][0] ?? ""
    }

    /**
     * A price tagged with custom_data {"plan": "go"} in Paddle names its plan, so a
     * new or annual price works without a deploy; otherwise it's looked up in the env lists.
     */
    planFor(priceId: string, hint: string | null): PaidPlanId | null {
        if (isPaidPlan(hint)) return hint
        if (!priceId) return null
        return PAID_PLAN_IDS.find(plan => this.prices[plan].includes(priceId)) ?? null
    }
}
