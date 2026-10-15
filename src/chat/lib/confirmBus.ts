/** Actions held for the user's approval before they run, one per chat at a time. */

export type ConfirmAnswer = "allow" | "allow-all" | "deny";

export interface ActionConfirmation {
    /** The tool call waiting on this answer. */
    id: string;
    /** What the action does, in the agent's words or ours. */
    title: string;
    /** The element or URL it acts on. */
    target?: string;
    /** Why it needs approval. */
    reasons: string[];
    /** It may come from instructions in page content rather than the user. */
    injection: boolean;
    /** Offer "Allow all for this task" ("Ask before acting" mode). */
    allowAll: boolean;
}

interface Pending extends ActionConfirmation {
    resolve: (answer: ConfirmAnswer) => void;
}

// Chats run side by side, so each keeps its own pending confirmation; the card
// shows only the one for the chat on screen.
const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

function notify() {
    for (const fn of listeners) fn();
}

export function subscribeConfirmations(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getPendingConfirmation(conversationId: string): ActionConfirmation | null {
    return pending.get(conversationId) ?? null;
}

export function answerConfirmation(conversationId: string, answer: ConfirmAnswer) {
    const entry = pending.get(conversationId);
    if (!entry) return;
    pending.delete(conversationId);
    notify();
    entry.resolve(answer);
}

/** Waits for the user's answer; stopping the run rejects with AbortError. */
export function requestConfirmation(conversationId: string, request: ActionConfirmation, signal?: AbortSignal): Promise<ConfirmAnswer> {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            if (pending.get(conversationId)?.id === request.id) {
                pending.delete(conversationId);
                notify();
            }
            reject(new DOMException("Aborted", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, {once: true});
        pending.set(conversationId, {
            ...request,
            resolve: (answer) => {
                signal?.removeEventListener("abort", onAbort);
                resolve(answer);
            },
        });
        notify();
    });
}
