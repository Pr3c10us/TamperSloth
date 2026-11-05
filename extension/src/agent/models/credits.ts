import {useSyncExternalStore} from "react";

/**
 * A Sloth run stopped by a plan limit: the month's credit is spent, or one
 * run used the plan's token budget. Unlike a rate limit, these don't clear by
 * waiting, so the chat offers the ways on instead of an error line: upgrade,
 * a model on the user's own key, or (for a run budget) another message.
 * "creditsLow" is a step that could cost more than the credit left; "pastDue" is a
 * failed renewal payment, which pauses the plan's credit until the card is updated.
 * "userBudget" is the user's own run budget from Preferences, on any model.
 * "unavailable" is TamperSloth pausing Sloth models for everyone for a while;
 * it does clear by waiting, but the user's own key works meanwhile.
 */

export type PlanLimit = "credits" | "creditsLow" | "pastDue" | "runBudget" | "runTooLong" | "userBudget" | "unavailable";

export interface CreditsExhausted {
    limit: PlanLimit;
    /** The server's own wording, for when the account hasn't loaded. */
    message: string;
    /** The token budget the run stopped at, for "userBudget". */
    budget?: number;
}

const CODES: Record<string, PlanLimit> = {
    CREDITS_EXHAUSTED: "credits",
    CREDITS_LOW: "creditsLow",
    PAYMENT_PAST_DUE: "pastDue",
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

/**
 * The server answers 402 with a plan-limit code, or 503 SLOTH_UNAVAILABLE while Sloth
 * models are paused; the SDK may wrap either in a RetryError.
 */
export function creditsExhaustedError(error: unknown): CreditsExhausted | null {
    const e = error as any;
    if (!e || typeof e !== "object") return null;
    if (e.lastError) return creditsExhaustedError(e.lastError);
    const status = e.statusCode ?? e.status;
    if (status !== 402 && status !== 503) return null;
    let code: string | undefined;
    try {
        code = JSON.parse(e.responseBody ?? "")?.code;
    } catch { /* Not JSON. */ }
    if (status === 503) return code === "SLOTH_UNAVAILABLE"
        ? {limit: "unavailable", message: typeof e.message === "string" && e.message ? e.message : "Sloth models aren't available at the moment. Try again later."}
        : null;
    if (code && !CODES[code]) return null;
    return {limit: code ? CODES[code] : "credits",
        message: typeof e.message === "string" && e.message ? e.message : "You've used this month's credit."};
}
