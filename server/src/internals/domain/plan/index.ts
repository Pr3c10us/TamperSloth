import type {User} from "../user";

export type Plan = {
    id: string
    name: string
    monthlyCreditUsd: number
    requestsPerMinute: number
    maxConcurrent: number
    models: string[]
    defaultModel: string
}

export const PLANS: Record<string, Plan> = {
    free: {
        id: "free",
        name: "Free",
        monthlyCreditUsd: 0.5,
        requestsPerMinute: 30,
        maxConcurrent: 4,
        models: ["sloth-mini"],
        defaultModel: "sloth-mini",
    },
    go: {
        id: "go",
        name: "Go",
        monthlyCreditUsd: 4,
        requestsPerMinute: 60,
        maxConcurrent: 6,
        models: ["sloth-mini", "sloth-pro"],
        defaultModel: "sloth-pro",
    },
    pro: {
        id: "pro",
        name: "Pro",
        monthlyCreditUsd: 20,
        requestsPerMinute: 120,
        maxConcurrent: 8,
        models: ["sloth-mini", "sloth-pro", "sloth-max"],
        defaultModel: "sloth-pro",
    },
}

export function planFor(planId: string | undefined): Plan {
    return (planId && PLANS[planId]) || PLANS.free!
}

/**
 * The window a user's credit is measured over. A paid plan follows its Paddle
 * billing period, so credit renews the day it's charged; everyone else, and a
 * paid plan whose period lapsed without a renewal, uses the UTC calendar month.
 */
export function billingPeriod(user: Pick<User, "plan" | "planPeriodStart" | "planPeriodEnd">, now = new Date()): { start: Date, end: Date } {
    const {planPeriodStart: start, planPeriodEnd: end} = user
    if (user.plan !== "free" && start && end && start <= now && now < end) return {start, end}
    return calendarMonth(now)
}

function calendarMonth(now: Date): { start: Date, end: Date } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return {start, end}
}
