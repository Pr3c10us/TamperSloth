import {PLANS} from "../../../domain/plan";
import {SLOTH_MODELS} from "../../../domain/model";
import type {RunTokenBudgets} from "../../../../packages/secret";

export type PlanSummary = {
    id: string
    name: string
    priceUsd: number
    credits: number
    models: string[]
    requestsPerMinute: number
    /** Most tokens one agent run may use; 0 means no limit. */
    runTokenBudget: number
}

/** The plans as the pricing page shows them, from the same numbers the server enforces. */
export default class GetPlans {
    constructor(
        private runTokenBudgets: RunTokenBudgets,
        private creditsPerUsd: number,
    ) {
    }

    handle(): PlanSummary[] {
        return Object.values(PLANS).map(plan => ({
            id: plan.id,
            name: plan.name,
            priceUsd: plan.priceUsd,
            credits: plan.monthlyCreditUsd * this.creditsPerUsd,
            models: SLOTH_MODELS.filter(model => plan.models.includes(model.id)).map(model => model.name),
            requestsPerMinute: plan.requestsPerMinute,
            runTokenBudget: this.runTokenBudgets[plan.id] ?? 0,
        }))
    }
}
