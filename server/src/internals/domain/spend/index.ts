/** All users' Sloth model spend for the current UTC day, against the global daily limit. */
export type DailySpend = {
    spentMicros: number
    limitMicros: number
    /** Share of the limit, in percent, at which the approaching-limit email goes out. */
    alertPercent: number
    /** Whether today's emails already went out for the limit as it now stands. */
    warned: boolean
    tripped: boolean
}

export type SpendAlert = "warned" | "tripped"

export interface SpendLimitRepository {
    today: () => Promise<DailySpend>
    /** Marks today's alert as sent; false when another request already claimed it. */
    claimAlert: (alert: SpendAlert) => Promise<boolean>
}
