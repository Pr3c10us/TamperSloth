import {useSyncExternalStore} from "react";
import {type LanguageModel, wrapLanguageModel} from "ai";

/**
 * Any key can hit a provider's rate limit mid-run (free tiers allow only a
 * few requests a minute), so a 429 is a pause rather than a failure. Each model call that hits one waits out the
 * window and tries again, so the run carries on from the step it was on.
 * The SDK's own retries back off for seconds, which never clears a
 * per-minute limit.
 */

/** Retries after the first rate-limited attempt. */
export const RATE_LIMIT_RETRIES = 3;
/** A per-minute window always clears within this. */
export const RATE_LIMIT_WAIT_MS = 60_000;
/** A provider asking for longer means a daily or billing quota, which waiting won't fix. */
export const MAX_RATE_LIMIT_WAIT_MS = 5 * 60_000;

export interface RateLimitWait {
    modelName: string;
    /** Epoch ms when the next attempt is made. */
    until: number;
    /** 1-based retry about to be made. */
    retry: number;
    maxRetries: number;
}

const waits = new Map<string, RateLimitWait>();
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

/** The wait a chat's run is sitting in, or null while it isn't rate limited. */
export function useRateLimitWait(conversationId: string): RateLimitWait | null {
    return useSyncExternalStore(subscribe, () => waits.get(conversationId) ?? null);
}

export function rateLimitWait(conversationId: string): RateLimitWait | null {
    return waits.get(conversationId) ?? null;
}

/** Thrown once waiting can't help; its message tells the user what to do. */
export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RateLimitError";
    }
}

function errorText(error: any): string {
    const parts = [error?.message, typeof error?.responseBody === "string" ? error.responseBody : ""];
    return parts.filter(s => typeof s === "string").join("\n");
}

export function isRateLimitError(error: unknown): boolean {
    const e = error as any;
    if (!e || typeof e !== "object") return false;
    const status = e.statusCode ?? e.status;
    if (status === 429) return true;
    if (status !== undefined) return false;
    return /rate.?limit|RESOURCE_EXHAUSTED|too many requests/i.test(errorText(e));
}

/** "16h9m8.32s", "1.5s", "500ms", "6m0s" → ms. */
export function parseDuration(text: string): number | null {
    const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
    let total = 0;
    let matched = false;
    for (const [, value, unit] of text.matchAll(re)) {
        matched = true;
        total += Number(value) * (unit === "h" ? 3_600_000 : unit === "m" ? 60_000 : unit === "s" ? 1000 : 1);
    }
    return matched ? Math.round(total) : null;
}

/** How long the provider says to wait, from headers or the error text, if it says. */
export function retryAfterMs(error: unknown): number | null {
    const e = error as any;
    const headers: Record<string, string> | undefined = e?.responseHeaders;
    if (headers) {
        const ms = parseFloat(headers["retry-after-ms"] ?? "");
        if (!Number.isNaN(ms)) return ms;
        const after = headers["retry-after"];
        if (after) {
            const seconds = parseFloat(after);
            if (!Number.isNaN(seconds)) return seconds * 1000;
            const date = Date.parse(after);
            if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
        }
    }
    const text = errorText(e);
    // OpenAI: "Please try again in 20s"; Gemini: "Please retry in 16h9m8.3s" and "retryDelay": "37s".
    const hint = /(?:try again|retry) in ((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)/i.exec(text)
        ?? /"retryDelay"\s*:\s*"((?:\d+(?:\.\d+)?(?:ms|h|m|s))+)"/i.exec(text);
    return hint ? parseDuration(hint[1]) : null;
}

/** Quota that's used up or never granted, as opposed to a window that will reopen. */
function isExhausted(error: unknown, hintMs: number | null): boolean {
    if (hintMs !== null && hintMs > MAX_RATE_LIMIT_WAIT_MS) return true;
    const text = errorText(error);
    // OpenAI's out-of-credit code; Gemini's "limit: 0" means the model isn't on this key's tier.
    return /insufficient_quota/i.test(text) || /\blimit:\s*0\b/.test(text);
}

function formatWait(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60) return `${Math.max(1, minutes)} min`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            clearTimeout(timer);
            reject(signal!.reason ?? new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, {once: true});
    });
}

export interface RateLimitOptions {
    conversationId: string;
    modelName: string;
    /** Injected by tests. */
    wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Runs one model call, waiting out rate limits between attempts. */
export async function withRateLimitRetry<T>(call: () => PromiseLike<T>, options: RateLimitOptions, signal?: AbortSignal): Promise<T> {
    const {conversationId, modelName, wait = sleep} = options;
    const switchHint = "Pick a different model below and send your message again to continue.";
    for (let retry = 1; ; retry++) {
        try {
            return await call();
        } catch (error) {
            if (!isRateLimitError(error) || signal?.aborted) throw error;
            const hint = retryAfterMs(error);
            if (isExhausted(error, hint)) {
                throw new RateLimitError(hint !== null && hint > MAX_RATE_LIMIT_WAIT_MS
                    ? `${modelName} is out of quota on this API key for about ${formatWait(hint)}. ${switchHint}`
                    : `${modelName} has no quota left on this API key. ${switchHint}`);
            }
            if (retry > RATE_LIMIT_RETRIES) {
                throw new RateLimitError(`${modelName} is still rate limited after ${RATE_LIMIT_RETRIES} retries. ${switchHint}`);
            }
            const ms = Math.max(RATE_LIMIT_WAIT_MS, (hint ?? 0) + 1000);
            waits.set(conversationId, {modelName, until: Date.now() + ms, retry, maxRetries: RATE_LIMIT_RETRIES});
            notify();
            try {
                await wait(ms, signal);
            } finally {
                waits.delete(conversationId);
                notify();
            }
        }
    }
}

/** The model, with each request retried across rate-limit windows. */
export function withRateLimits(model: LanguageModel, options: RateLimitOptions): LanguageModel {
    if (typeof model === "string") return model;
    return wrapLanguageModel({
        model,
        middleware: {
            wrapGenerate: ({doGenerate, params}) => withRateLimitRetry(doGenerate, options, params.abortSignal),
            wrapStream: ({doStream, params}) => withRateLimitRetry(doStream, options, params.abortSignal),
        },
    });
}
