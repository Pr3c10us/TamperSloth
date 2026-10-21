import type {TokenUsage} from "../model";

/** completed: the provider reported usage. aborted/failed: usage was estimated. */
export type UsageStatus = "completed" | "aborted" | "failed"

export type UsageRecord = TokenUsage & {
    userId: string
    modelId: string
    provider: string
    providerModel: string
    costMicros: number
    status: UsageStatus
}

export interface UsageRepository {
    record: (usage: UsageRecord) => Promise<void>
    spentSince: (userId: string, since: Date) => Promise<number>
}
