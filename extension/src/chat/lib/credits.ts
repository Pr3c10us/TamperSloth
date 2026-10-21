import {useSyncExternalStore} from "react";

/**
 * A Sloth run refused because the plan's monthly credit is spent. Unlike a
 * rate limit, waiting won't clear it before the period renews, so the chat
 * offers the two ways on instead of an error line: upgrade, or a model on
 * the user's own key.
 */

export interface CreditsExhausted {
    /** The server's own wording, for when the account hasn't loaded. */
    message: string;
}

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

/** Set while this chat's last Sloth run was refused for credit; null otherwise. */
export function useCreditsExhausted(conversationId: string): CreditsExhausted | null {
    return useSyncExternalStore(subscribe, () => exhausted.get(conversationId) ?? null);
}

export function setCreditsExhausted(conversationId: string, value: CreditsExhausted | null) {
    if (value) exhausted.set(conversationId, value);
    else if (!exhausted.delete(conversationId)) return;
    notify();
}

/** The server answers 402 with code CREDITS_EXHAUSTED; the SDK may wrap it in a RetryError. */
export function creditsExhaustedError(error: unknown): CreditsExhausted | null {
    const e = error as any;
    if (!e || typeof e !== "object") return null;
    if (e.lastError) return creditsExhaustedError(e.lastError);
    if ((e.statusCode ?? e.status) !== 402) return null;
    let code: string | undefined;
    try {
        code = JSON.parse(e.responseBody ?? "")?.code;
    } catch { /* Not JSON. */ }
    if (code && code !== "CREDITS_EXHAUSTED") return null;
    return {message: typeof e.message === "string" && e.message ? e.message : "You've used this month's credit."};
}
