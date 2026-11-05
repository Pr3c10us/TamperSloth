/** A wait on the user (e.g. to sign in), shown as a card in that chat's panel. */
export interface UserWait {
    id: string;
    /** What the user should do, as shown in the on-page tip. */
    text: string;
    /** The site it happens on. */
    host?: string;
    /** The tab to bring the user back to. */
    tabId: number;
}

interface Actions {
    /** Bring the user to the tab and point at where to act. */
    show: () => void;
}

interface Pending extends UserWait, Actions {}

// Chats run side by side, so each keeps its own wait; the card shows only the one for the chat on screen.
const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

function notify() {
    for (const fn of listeners) fn();
}

export function subscribeUserWait(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getUserWait(conversationId: string): UserWait | null {
    return pending.get(conversationId) ?? null;
}

/** Shows the card. Returns a function that removes it. */
export function startUserWait(conversationId: string, wait: UserWait, actions: Actions): () => void {
    pending.set(conversationId, {...wait, ...actions});
    notify();
    return () => {
        if (pending.get(conversationId)?.id !== wait.id) return;
        pending.delete(conversationId);
        notify();
    };
}

export function showUserWait(conversationId: string) {
    pending.get(conversationId)?.show();
}
