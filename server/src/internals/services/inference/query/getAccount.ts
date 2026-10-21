import type {User} from "../../../domain/user";
import type {UsageRepository} from "../../../domain/usage";
import {billingPeriod, planFor} from "../../../domain/plan";
import {SLOTH_MODELS} from "../../../domain/model";

export type AccountModel = {
    id: string
    name: string
    tagline: string
    poweredBy: string
    /** The vendor behind poweredBy, for its logo. */
    provider: string
    /** USD per million tokens. */
    pricing: { input: number, output: number, cacheRead: number, cacheWrite: number }
    contextWindow: number
    available: boolean
}

export type Account = {
    user: { id: string, email: string }
    plan: { id: string, name: string, monthlyCreditUsd: number, requestsPerMinute: number, defaultModel: string }
    usage: { spentUsd: number, creditUsd: number, periodStart: string, periodEnd: string }
    models: AccountModel[]
}

export default class GetAccount {
    constructor(private usageRepository: UsageRepository) {
    }

    async handle(user: User): Promise<Account> {
        const plan = planFor(user.plan)
        const period = billingPeriod()
        const spentMicros = await this.usageRepository.spentSince(user.id, period.start)
        return {
            user: {id: user.id, email: user.email},
            plan: {
                id: plan.id,
                name: plan.name,
                monthlyCreditUsd: plan.monthlyCreditUsd,
                requestsPerMinute: plan.requestsPerMinute,
                defaultModel: plan.defaultModel,
            },
            usage: {
                spentUsd: spentMicros / 1e6,
                creditUsd: plan.monthlyCreditUsd,
                periodStart: period.start.toISOString(),
                periodEnd: period.end.toISOString(),
            },
            models: SLOTH_MODELS.map(model => ({
                id: model.id,
                name: model.name,
                tagline: model.tagline,
                poweredBy: model.target.label,
                provider: model.target.provider,
                pricing: {
                    input: model.rates.input,
                    output: model.rates.output,
                    cacheRead: model.rates.cacheRead,
                    cacheWrite: model.rates.cacheWrite,
                },
                contextWindow: model.contextWindow,
                available: plan.models.includes(model.id),
            })),
        }
    }
}
