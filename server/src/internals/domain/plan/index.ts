import type {User} from "../user";

export type Plan = {
    id: string
    name: string
    /** The monthly price in US dollars, for display; Paddle holds the price that's charged. */
    priceUsd: number
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
        priceUsd: 0,
        monthlyCreditUsd: 0.5,
        requestsPerMinute: 30,
        maxConcurrent: 4,
        models: ["sloth-mini"],
        defaultModel: "sloth-mini",
    },
    go: {
        id: "go",
        name: "Go",
        priceUsd: 5,
        monthlyCreditUsd: 4,
        requestsPerMinute: 60,
        maxConcurrent: 6,
        models: ["sloth-mini", "sloth-pro"],
        defaultModel: "sloth-pro",
    },
    pro: {
        id: "pro",
        name: "Pro",
        priceUsd: 20,
        monthlyCreditUsd: 19,
        requestsPerMinute: 120,
        maxConcurrent: 8,
        models: ["sloth-mini", "sloth-pro", "sloth-max"],
        defaultModel: "sloth-pro",
    },
}

/** Monthly credit per plan from the environment, so allowances can change without a release. */
export function setPlanCredits(credits: Record<string, number | undefined>) {
    for (const [id, credit] of Object.entries(credits)) {
        if (credit !== undefined && PLANS[id]) PLANS[id].monthlyCreditUsd = credit
    }
}

export function planFor(planId: string | undefined): Plan {
    return (planId && PLANS[planId]) || PLANS.free!
}

/** Free < Go < Pro; tells an upgrade from a downgrade. */
export function planRank(planId: string): number {
    return Object.keys(PLANS).indexOf(planId)
}

/**
 * Paddle's renewal webhook can arrive a little after the period ends; the paid
 * plan carries on for this long before it's treated as lapsed.
 */
export const RENEWAL_GRACE_MS = 24 * 60 * 60 * 1000

type BillingUser = Pick<User, "plan" | "planPeriodStart" | "planPeriodEnd" | "creditWindowStart" | "creditBonusMicros">

/** The paid period the user is in, grace included, or null on Free or once it lapsed. */
function paidPeriod(user: BillingUser, now: Date): { start: Date, end: Date } | null {
    const {planPeriodStart: start, planPeriodEnd: end} = user
    if (user.plan === "free" || !start || !end) return null
    if (now < start || now.getTime() >= end.getTime() + RENEWAL_GRACE_MS) return null
    return {start, end}
}

/** When an upgrade restarted the credit window inside the current paid period. */
function upgradedAt(user: BillingUser, period: { start: Date } | null, now: Date): Date | null {
    const restart = user.creditWindowStart
    return period && restart && restart > period.start && restart <= now ? restart : null
}

/**
 * The plan the user can use now. A paid period that ended a day ago with no
 * renewal from Paddle counts as Free until one arrives, so a lost webhook
 * can't keep a paid plan running unpaid.
 */
export function entitledPlan(user: BillingUser, now = new Date()): Plan {
    return paidPeriod(user, now) ? planFor(user.plan) : PLANS.free!
}

/**
 * The window a user's credit is measured over. A paid plan follows its Paddle
 * billing period, so credit renews the day it's charged, and an upgrade starts
 * a fresh window from the moment it's paid. Free uses the UTC calendar month.
 */
export function billingPeriod(user: BillingUser, now = new Date()): { start: Date, end: Date } {
    const period = paidPeriod(user, now)
    if (!period) return calendarMonth(now)
    return {start: upgradedAt(user, period, now) ?? period.start, end: period.end}
}

/** The window's credit in USD micros: the plan's, plus the unused credit an upgrade carried over. */
export function creditAllowanceMicros(user: BillingUser, now = new Date()): number {
    const period = paidPeriod(user, now)
    const bonus = upgradedAt(user, period, now) ? Number(user.creditBonusMicros ?? 0) : 0
    return Math.round(entitledPlan(user, now).monthlyCreditUsd * 1e6) + bonus
}

function calendarMonth(now: Date): { start: Date, end: Date } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return {start, end}
}
