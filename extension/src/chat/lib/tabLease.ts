import {useSyncExternalStore} from "react";

/**
 * One chat at a time per tab. A chat claims a tab the first time one of its
 * tools looks at or acts on the page, and keeps it until its run ends, so
 * another chat can't navigate away mid-task or read a half-finished change.
 * Chats that only write scripts or answer from what they know never claim it.
 * Others queue in order; while waiting they can still think and use
 * tab-free tools.
 */

/** Tools that never look at or act on the page. */
const TAB_FREE_TOOLS = new Set([
    "getSkill", "viewCodeFiles", "createFileTool", "strReplaceTool", "deleteFileTool",
    "saveScript", "listScripts", "toggleScript", "removeScript", "askUser",
]);

interface Waiter {
    conversationId: string;
    tabId: number;
    resolve: () => void;
}

const holders = new Map<number, string>();
const queue: Waiter[] = [];
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

/** Resolves once the chat holds the tab; rejects if its run is stopped while waiting. */
export function acquireTab(tabId: number, conversationId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const holder = holders.get(tabId);
    if (holder === undefined || holder === conversationId) {
        if (holder === undefined) {
            holders.set(tabId, conversationId);
            notify();
        }
        return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => {
            const index = queue.indexOf(waiter);
            if (index >= 0) queue.splice(index, 1);
            notify();
            reject(new DOMException("Aborted", "AbortError"));
        };
        const waiter: Waiter = {
            conversationId,
            tabId,
            resolve: () => {
                signal?.removeEventListener("abort", onAbort);
                resolve();
            },
        };
        signal?.addEventListener("abort", onAbort, {once: true});
        queue.push(waiter);
        notify();
    });
}

/** Whether the chat holds any tab, i.e. may have left guidance or a debugger session behind. */
export function holdsTab(conversationId: string): boolean {
    return [...holders.values()].includes(conversationId);
}

/** The chat currently holding a tab, if any. */
export function tabHolder(tabId: number): string | undefined {
    return holders.get(tabId);
}

/** Whether any other chat holds a tab. */
export function othersHoldTabs(conversationId: string): boolean {
    return [...holders.values()].some(holder => holder !== conversationId);
}

/** Ends the chat's claims and hands each tab to the next chat waiting for it. */
export function releaseTabs(conversationId: string) {
    for (const [tabId, holder] of holders) {
        if (holder !== conversationId) continue;
        holders.delete(tabId);
        const index = queue.findIndex(waiter => waiter.tabId === tabId);
        if (index >= 0) {
            const [next] = queue.splice(index, 1);
            holders.set(tabId, next.conversationId);
            next.resolve();
        }
    }
    notify();
}

/** Wraps tab tools so each claims (or waits for) the tab before it runs. */
export function leaseTabTools<T extends Record<string, {execute?: (...args: any[]) => any}>>(
    tools: T,
    conversationId: string,
    getTabId: () => number,
    signal?: AbortSignal,
): T {
    const leased: Record<string, unknown> = {};
    for (const [name, definition] of Object.entries(tools)) {
        const execute = definition.execute;
        leased[name] = !execute || TAB_FREE_TOOLS.has(name) ? definition : {
            ...definition,
            execute: async (input: unknown, options: {abortSignal?: AbortSignal}) => {
                await acquireTab(getTabId(), conversationId, options?.abortSignal ?? signal);
                return execute(input, options);
            },
        };
    }
    return leased as T;
}

/** The chat holding the tab this chat is waiting for, or null when it isn't waiting. */
function getWaitingOn(conversationId: string): string | null {
    const waiter = queue.find(w => w.conversationId === conversationId);
    return waiter ? holders.get(waiter.tabId) ?? null : null;
}

export function useTabWait(conversationId: string): string | null {
    return useSyncExternalStore(subscribe, () => getWaitingOn(conversationId));
}
