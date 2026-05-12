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

let current: PendingAsk | null = null;
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

export function getPendingAsk(): PendingAsk | null {
    return current;
}

export function setPendingAsk(p: PendingAsk | null): void {
    current = p;
    notify();
}

export function answerPendingAsk(answer: AskUserAnswer): void {
    const p = current;
    if (!p) return;
    current = null;
    notify();
    p.resolve(answer);
}

export function rejectPendingAsk(err: Error): void {
    const p = current;
    if (!p) return;
    current = null;
    notify();
    p.reject(err);
}
