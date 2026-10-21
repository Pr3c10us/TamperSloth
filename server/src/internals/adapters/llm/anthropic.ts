import {createAnthropic} from "@ai-sdk/anthropic";
import type {Effort, ModelProvider} from "../../domain/model/provider.ts";

export default class AnthropicProvider implements ModelProvider {
    id = "anthropic"
    optionsNamespace = "anthropic"
    configured: boolean
    private anthropic: ReturnType<typeof createAnthropic>

    constructor(apiKey: string) {
        this.configured = apiKey.length > 0
        this.anthropic = createAnthropic({apiKey})
    }

    languageModel(modelId: string) {
        return this.anthropic(modelId)
    }

    // Current Claude models reject disabled thinking (Opus 5.5, Sonnet 5.5), so
    // effort is the only depth control; "low" is what quick calls like titles use.
    // display "summarized" streams readable reasoning instead of empty blocks.
    callOptions(_modelId: string, effort: Effort) {
        return {anthropic: {thinking: {type: "adaptive", display: "summarized"}, effort}}
    }
}
