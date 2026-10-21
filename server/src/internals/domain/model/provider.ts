import type {LanguageModelV4, SharedV4ProviderOptions} from "@ai-sdk/provider";

export type Effort = "low" | "medium" | "high" | "max"

export interface ModelProvider {
    id: string
    configured: boolean
    optionsNamespace: string
    languageModel: (modelId: string) => LanguageModelV4
    callOptions: (modelId: string, effort: Effort) => SharedV4ProviderOptions
}

export interface ModelProviders {
    get: (id: string) => ModelProvider | undefined
}

export interface RateLimiter {
    acquire: (userId: string, limits: { requestsPerMinute: number, maxConcurrent: number }) => () => void
}
