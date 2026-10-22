import type {LanguageModelV4StreamPart, LanguageModelV4Usage} from "@ai-sdk/provider";
import {APICallError} from "@ai-sdk/provider";
import type {User} from "../../../domain/user";
import {costMicros, findSlothModel, type SlothModel, type TokenUsage} from "../../../domain/model";
import type {ModelProviders, RateLimiter} from "../../../domain/model/provider.ts";
import type {UsageRepository, UsageStatus} from "../../../domain/usage";
import {billingPeriod, type Plan, planFor} from "../../../domain/plan";
import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    PaymentRequiredError,
    ServiceUnavailableError,
    TooManyRequestsError,
} from "../../../../packages/errors";
import {type ModelRequest, parseModelRequest} from "../../../../packages/utils/modelWire.ts";
import type {RunTokenBudgets} from "../../../../packages/secret";
import type GlobalSpendLimit from "../query/globalSpendLimit.ts";

export type StreamModelResult = {
    model: SlothModel
    stream: ReadableStream<LanguageModelV4StreamPart>
}

const RUN_ID = /^[A-Za-z0-9_-]{8,64}$/

export default class StreamModel {
    constructor(
        private providers: ModelProviders,
        private usageRepository: UsageRepository,
        private rateLimiter: RateLimiter,
        private spendLimit: GlobalSpendLimit,
        private runTokenBudgets: RunTokenBudgets,
        private creditsPerUsd: number,
    ) {
    }

    async handle(user: User, modelId: string, body: unknown, signal: AbortSignal, runId?: string): Promise<StreamModelResult> {
        if (runId !== undefined && !RUN_ID.test(runId)) throw new BadRequestError("invalid run id")

        const model = findSlothModel(modelId)
        if (!model) throw new NotFoundError(`model "${modelId}" does not exist`)

        const plan = planFor(user.plan)
        if (!plan.models.includes(model.id)) {
            const error = new ForbiddenError(`${model.name} isn't included in the ${plan.name} plan. Upgrade your plan to use it.`)
            error.code = "MODEL_NOT_IN_PLAN"
            throw error
        }

        const provider = this.providers.get(model.target.provider)
        if (!provider?.configured) throw new ServiceUnavailableError(`${model.name} is not available right now`)

        const request = parseModelRequest(body, provider.optionsNamespace, model.maxOutputTokens)

        await this.spendLimit.ensureAvailable()
        const period = billingPeriod(user)
        const spent = await this.usageRepository.spentSince(user.id, period.start)
        if (spent >= plan.monthlyCreditUsd * 1e6) {
            throw new PaymentRequiredError(
                `You've used this month's ${plan.monthlyCreditUsd * this.creditsPerUsd} ${plan.name} credits. They renew on ${renewalDate(period.end)}.`,
                "CREDITS_EXHAUSTED",
            )
        }
        await this.checkRunBudget(user.id, plan, runId, request)

        const release = await this.rateLimiter.acquire(user.id, plan)
        let result
        try {
            result = await provider.languageModel(model.target.modelId).doStream({
                ...request.options,
                providerOptions: provider.callOptions(model.target.modelId, request.effort),
                abortSignal: signal,
            })
        } catch (error) {
            release()
            throw this.clientError(error, model)
        }

        const meter = new UsageMeter(request.estimatedInputTokens)
        const record = (status: UsageStatus) => {
            release()
            const usage = meter.usage()
            const finalStatus = meter.reported ? "completed" : status
            return this.usageRepository.record({
                userId: user.id,
                runId,
                modelId: model.id,
                provider: provider.id,
                providerModel: model.target.modelId,
                ...usage,
                costMicros: costMicros(model.rates, usage),
                status: finalStatus,
            }).catch(error => console.error("failed to record model usage", error))
        }

        let settled = false
        const settle = async (status: UsageStatus) => {
            if (settled) return
            settled = true
            await record(status)
        }
        const stream = result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
            transform(part, controller) {
                meter.observe(part)
                controller.enqueue(part)
            },
            // The response ends only once usage is saved, so the run's next step is measured against it.
            flush() {
                return settle(signal.aborted ? "aborted" : "failed")
            },
        }))

        signal.addEventListener("abort", () => void settle("aborted"), {once: true})

        return {model, stream}
    }

    /**
     * Refuses a step once its run has used the plan's run budget. The last step
     * may go over, as in the extension: a step is never cut off mid-answer.
     */
    private async checkRunBudget(userId: string, plan: Plan, runId: string | undefined, request: ModelRequest) {
        const budget = this.runTokenBudgets[plan.id] ?? 0
        if (budget <= 0) return
        const upgrade = plan.id === "pro" ? "" : ", or upgrade your plan for longer runs"
        // One step whose prompt alone is over the budget would spend it before anything was recorded.
        if (request.estimatedInputTokens > budget) {
            throw new PaymentRequiredError(
                `This chat is too long for one run on the ${plan.name} plan. Start a new chat to keep going${upgrade}.`,
                "RUN_TOO_LONG",
            )
        }
        const used = runId ? await this.usageRepository.runTokens(userId, runId) : null
        if (used === null) {
            // A run starts on the user's message; a prompt ending in tool results continues one,
            // so it can't skip the budget by leaving out the run id or sending a new one.
            if (request.options.prompt.at(-1)?.role === "tool") {
                throw new BadRequestError("This step isn't part of a run TamperSloth started. Update the extension and try again.")
            }
            return
        }
        if (used >= budget) {
            throw new PaymentRequiredError(
                `This reply reached the ${plan.name} plan's limit for one run. Send a message to keep going${upgrade}.`,
                "RUN_BUDGET_EXHAUSTED",
            )
        }
    }

    private clientError(error: unknown, model: SlothModel): Error {
        if (!APICallError.isInstance(error)) {
            console.error("model request failed", error)
            return new ServiceUnavailableError(`${model.name} is not available right now`)
        }
        const status = error.statusCode ?? 500
        if (status === 429 || status === 529) {
            const retryAfter = Number(error.responseHeaders?.["retry-after"]) || 30
            return new TooManyRequestsError(`${model.name} is busy, retrying shortly`, retryAfter)
        }
        if (status === 400 || status === 413) {
            const message = error.message.replaceAll(model.target.modelId, model.id)
            return new BadRequestError(message)
        }
        console.error(`model provider answered ${status}`, error.message)
        return new ServiceUnavailableError(`${model.name} is not available right now`)
    }
}

/** "March 4": the first day the next period's credit can be spent. */
function renewalDate(periodEnd: Date): string {
    return periodEnd.toLocaleDateString("en-US", {month: "long", day: "numeric", timeZone: "UTC"})
}

/** Usage from the provider's finish part, or an estimate when the stream ends before it. */
class UsageMeter {
    reported = false
    private outputChars = 0
    private finish?: LanguageModelV4Usage

    constructor(private estimatedInputTokens: number) {
    }

    observe(part: LanguageModelV4StreamPart) {
        if (part.type === "finish") {
            this.finish = part.usage
            this.reported = true
        } else if (part.type === "text-delta" || part.type === "reasoning-delta" || part.type === "tool-input-delta") {
            this.outputChars += part.delta.length
        }
    }

    usage(): TokenUsage {
        const reported = this.finish
        if (!reported) {
            return {input: this.estimatedInputTokens, output: Math.ceil(this.outputChars / 4), cacheRead: 0, cacheWrite: 0}
        }
        const cacheRead = reported.inputTokens.cacheRead ?? 0
        const cacheWrite = reported.inputTokens.cacheWrite ?? 0
        const input = reported.inputTokens.total ?? (reported.inputTokens.noCache ?? 0) + cacheRead + cacheWrite
        return {input, output: reported.outputTokens.total ?? 0, cacheRead, cacheWrite}
    }
}
