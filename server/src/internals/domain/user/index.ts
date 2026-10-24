export type User = {
    id: string
    email: string
    googleId?: string
    createdAt: string
    updatedAt: string
    plan: string
    paddleCustomerId?: string | null
    /** The paid plan's current Paddle billing period; null on the free plan. */
    planPeriodStart?: Date | null
    planPeriodEnd?: Date | null
    /** The live subscription's status; past_due pauses Sloth credit until the payment goes through. */
    planStatus?: string | null
    /** Set by an upgrade: credit is measured from here, with the old plan's unused credit added. */
    creditWindowStart?: Date | null
    creditBonusMicros?: number
}

export type GetUserParameters = {
    id?: string
    email?: string
    googleId?: string
}