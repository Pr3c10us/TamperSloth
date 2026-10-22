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

export function billingPeriod(now = new Date()): { start: Date, end: Date } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return {start, end}
}
