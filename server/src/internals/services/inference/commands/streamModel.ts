import type {LanguageModelV4StreamPart, LanguageModelV4Usage} from "@ai-sdk/provider";
import {APICallError} from "@ai-sdk/provider";
import type {User} from "../../../domain/user";
import {costMicros, findSlothModel, type SlothModel, type TokenUsage} from "../../../domain/model";
import type {ModelProviders, RateLimiter} from "../../../domain/model/provider.ts";
import type {UsageRepository, UsageStatus} from "../../../domain/usage";
import {billingPeriod, planFor} from "../../../domain/plan";
import {
    BadRequestError,
    ForbiddenError,
    NotFoundError,
    PaymentRequiredError,
    ServiceUnavailableError,
    TooManyRequestsError,
} from "../../../../packages/errors";
import {parseModelRequest} from "../../../../packages/utils/modelWire.ts";

export type StreamModelResult = {
    model: SlothModel
    stream: ReadableStream<LanguageModelV4StreamPart>
}

export default class StreamModel {
    constructor(
        private providers: ModelProviders,
        private usageRepository: UsageRepository,
        private rateLimiter: RateLimiter,
    ) {
    }

    async handle(user: User, modelId: string, body: unknown, signal: AbortSignal): Promise<StreamModelResult> {
        const model = findSlothModel(modelId)
        if (!model) throw new NotFoundError(`model "${modelId}" does not exist`)

        const plan = planFor(user.plan)
        if (!plan.models.includes(model.id)) {
            const error = new ForbiddenError(`${model.name} isn't included in the ${plan.name} plan. Upgrade to Pro to use it.`)
            error.code = "MODEL_NOT_IN_PLAN"
            throw error
        }

        const provider = this.providers.get(model.target.provider)
        if (!provider?.configured) throw new ServiceUnavailableError(`${model.name} is not available right now`)

        const request = parseModelRequest(body, provider.optionsNamespace, model.maxOutputTokens)

        const spent = await this.usageRepository.spentSince(user.id, billingPeriod().start)
        if (spent >= plan.monthlyCreditUsd * 1e6) {
            throw new PaymentRequiredError(
                `You've used this month's $${plan.monthlyCreditUsd} of ${plan.name} credit. It renews on the 1st.`,
                "CREDITS_EXHAUSTED",
            )
        }

        const release = this.rateLimiter.acquire(user.id, plan)
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
            void this.usageRepository.record({
                userId: user.id,
                modelId: model.id,
                provider: provider.id,
                providerModel: model.target.modelId,
                ...usage,
                costMicros: costMicros(model.rates, usage),
                status: finalStatus,
            }).catch(error => console.error("failed to record model usage", error))
        }

        let settled = false
        const settle = (status: UsageStatus) => {
            if (settled) return
            settled = true
            record(status)
        }
        const stream = result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
            transform(part, controller) {
                meter.observe(part)
                controller.enqueue(part)
            },
            flush() {
                settle(signal.aborted ? "aborted" : "failed")
            },
        }))

        signal.addEventListener("abort", () => settle("aborted"), {once: true})

        return {model, stream}
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
