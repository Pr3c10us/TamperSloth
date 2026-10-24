import type {TokenUsage} from "../model";

/** completed: the provider reported usage. aborted/failed: usage was estimated. */
export type UsageStatus = "completed" | "aborted" | "failed"

export type UsageRecord = TokenUsage & {
    userId: string
    /** The agent run this request was one step of, when the client named one. */
    runId?: string
    modelId: string
    provider: string
    providerModel: string
    costMicros: number
    status: UsageStatus
}

export interface UsageRepository {
    record: (usage: UsageRecord) => Promise<void>
    spentSince: (userId: string, since: Date) => Promise<number>
    /** Input plus output tokens recorded for one run, or null when the run has none yet. */
    runTokens: (userId: string, runId: string) => Promise<number | null>
}

/**
 * Credit set aside for requests still running. Usage is only recorded when a
 * request finishes, so without holds several requests at once could each pass
 * the credit check and together spend well past the plan's credit.
 */
export interface CreditHolds {
    /** Sets aside `micros` unless spent, what's already held and this together pass the limit; returns its release, or null. */
    hold: (userId: string, params: { spentMicros: number, limitMicros: number, micros: number }) => Promise<(() => void) | null>
}
