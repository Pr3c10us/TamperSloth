import {useSyncExternalStore} from "react";

/**
 * A Sloth run stopped by a plan limit: the month's credit is spent, or one
 * run used the plan's token budget. Unlike a rate limit, these don't clear by
 * waiting, so the chat offers the ways on instead of an error line: upgrade,
 * a model on the user's own key, or (for a run budget) another message.
 * "userBudget" is the user's own run budget from Preferences, on any model.
 */

export type PlanLimit = "credits" | "runBudget" | "runTooLong" | "userBudget";

export interface CreditsExhausted {
    limit: PlanLimit;
    /** The server's own wording, for when the account hasn't loaded. */
    message: string;
    /** The token budget the run stopped at, for "userBudget". */
    budget?: number;
}

const CODES: Record<string, PlanLimit> = {
    CREDITS_EXHAUSTED: "credits",
    RUN_BUDGET_EXHAUSTED: "runBudget",
    RUN_TOO_LONG: "runTooLong",
};

const exhausted = new Map<string, CreditsExhausted>();
const listeners = new Set<() => void>();

function notify() {
    for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Set while this chat's last Sloth run was stopped by a plan limit; null otherwise. */
export function useCreditsExhausted(conversationId: string): CreditsExhausted | null {
    return useSyncExternalStore(subscribe, () => exhausted.get(conversationId) ?? null);
}

export function setCreditsExhausted(conversationId: string, value: CreditsExhausted | null) {
    if (value) exhausted.set(conversationId, value);
    else if (!exhausted.delete(conversationId)) return;
    notify();
}

/** The server answers 402 with a plan-limit code; the SDK may wrap it in a RetryError. */
export function creditsExhaustedError(error: unknown): CreditsExhausted | null {
    const e = error as any;
    if (!e || typeof e !== "object") return null;
    if (e.lastError) return creditsExhaustedError(e.lastError);
    if ((e.statusCode ?? e.status) !== 402) return null;
    let code: string | undefined;
    try {
        code = JSON.parse(e.responseBody ?? "")?.code;
    } catch { /* Not JSON. */ }
    if (code && !CODES[code]) return null;
    return {limit: code ? CODES[code] : "credits",
        message: typeof e.message === "string" && e.message ? e.message : "You've used this month's credit."};
}
