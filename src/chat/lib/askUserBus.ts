export interface AskUserOption {
    label: string;
    emoji?: string;
}

export interface AskUserAnswer {
    label: string;
    emoji?: string;
    custom: boolean;
}

interface PendingAsk {
    id: string;
    question: string;
    options: AskUserOption[];
    resolve: (answer: AskUserAnswer) => void;
    reject: (err: Error) => void;
}

// Chats run side by side, so each keeps its own pending question; the overlay
// shows only the one for the chat on screen.
const pending = new Map<string, PendingAsk>();
const listeners = new Set<() => void>();

function notify() {
    for (const fn of listeners) fn();
}

export function subscribeAskUser(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getPendingAsk(conversationId: string): PendingAsk | null {
    return pending.get(conversationId) ?? null;
}

export function setPendingAsk(conversationId: string, p: PendingAsk): void {
    pending.set(conversationId, p);
    notify();
}

export function answerPendingAsk(conversationId: string, answer: AskUserAnswer): void {
    const p = pending.get(conversationId);
    if (!p) return;
    pending.delete(conversationId);
    notify();
    p.resolve(answer);
}

export function rejectPendingAsk(conversationId: string, err: Error): void {
    const p = pending.get(conversationId);
    if (!p) return;
    pending.delete(conversationId);
    notify();
    p.reject(err);
}
