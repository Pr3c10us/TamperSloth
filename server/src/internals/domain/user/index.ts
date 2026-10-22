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
}

export type GetUserParameters = {
    id?: string
    email?: string
    googleId?: string
}