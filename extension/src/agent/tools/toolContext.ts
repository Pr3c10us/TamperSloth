import {z} from "zod";
import {pageQuiet} from "@/injected/tools/pageQuiet";
import {isNewTabPage} from "@/shared/url";
import {browserCall} from "./browserTools";
import {selectorError} from "./selectorHelp";

export const responseFormatSchema = z
    .enum(["concise", "detailed"])
    .optional()
    .default("concise")
    .describe('Use detailed only for additional attributes, styles, or diagnostics.');

/** An action counts as settled once the page has changed and then gone this long without changing. */
export const SETTLE_QUIET_MS = 150;
/** A submit that navigates shows the tab loading within this. */
const NAVIGATION_START_MS = 400;

export type ToolContextOptions = { conversationId: string; abortSignal?: AbortSignal; findAttachment?: (name: string) => Promise<Blob | null> };

/** What every tool group shares for one run: the working tab, cancellable browser APIs and the page overlay's helpers. */
export function createToolContext(options: ToolContextOptions) {
    let tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
    // Check cancellation at each browser mutation, including later steps of a tool.
    const guard = async () => {
        if (options.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
    };
    const guardedAPI = <T extends object,>(api: T, mutations: string[]): T => api && new Proxy(api, {
        get(target, property) {
            const value = Reflect.get(target, property);
            if (typeof value !== 'function' || !mutations.includes(String(property))) return value;
            return async (...args: unknown[]) => { await guard(); return Reflect.apply(value, target, args); };
        },
    });
    const chrome = {...globalThis.chrome,
        scripting: guardedAPI(globalThis.chrome.scripting, ['executeScript']),
        tabs: guardedAPI(globalThis.chrome.tabs, ['create', 'update', 'remove', 'reload', 'goBack', 'goForward']),
        windows: guardedAPI(globalThis.chrome.windows, ['update']),
    };
    // Read before any tool can navigate it: a chat started on a new tab page uses that tab for the task.
    const originBlank = Promise.resolve().then(async () => tabId > 0 && isNewTabPage((await globalThis.chrome.tabs.get(tabId)).url)).catch(() => false);
    /** The selector a call names its element by: its own, or one for a ref. An unknown ref throws with candidates. */
    const targetOf = async (input: {selector?: string; ref?: string}): Promise<{selector: string} | {error: string; hint?: string}> => {
        if (input.ref) return {selector: (await browserCall('guidance', {tabId, action: 'resolveRef', ref: input.ref})).selector};
        if (!input.selector) return {error: 'Provide selector or ref.', hint: 'Use a ref from listControls or a changes report, or a CSS selector.'};
        return selectorError(input.selector) ?? {selector: input.selector};
    };
    /** Moves the agent cursor to the element and remembers the page, so changesSince can report the action's effects. */
    const cue = (selector: string | undefined, index: number | undefined, kind: 'click' | 'type' | 'scroll') =>
        browserCall('guidance', {tabId, action: 'cue', selector, index, cue: kind, baseline: kind !== 'scroll'}).catch(() => {});
    /** What the last cued action changed: new controls with refs, dialogs, messages, invalid fields, focus, URL. */
    const changesSince = async () => {
        const changes = await browserCall('guidance', {tabId, action: 'changes'}).catch(() => undefined);
        return changes && Object.keys(changes).length ? {changes} : {};
    };
    /**
     * Call before a submit; the returned wait resolves after the navigation it started (true), or once
     * the page settles when script handled it in place (false), instead of always waiting the timeout.
     */
    const watchSubmission = () => {
        let loading = false, completed = false;
        const listener = (updatedTabId: number, changeInfo: {status?: string}) => {
            if (updatedTabId !== tabId) return;
            if (changeInfo.status === 'loading') loading = true;
            if (changeInfo.status === 'complete' && loading) completed = true;
        };
        globalThis.chrome.tabs.onUpdated.addListener(listener);
        return async (timeoutMs: number) => { try {
            const deadline = Date.now() + timeoutMs, started = Date.now();
            let settledInPlace = false;
            while (!completed && Date.now() < deadline) {
                // A form that navigates starts loading almost at once; one handled by script never does.
                if (!loading && !settledInPlace && Date.now() - started >= NAVIGATION_START_MS) {
                    if ((await globalThis.chrome.tabs.get(tabId)).status === 'loading') loading = true;
                    else {
                        await globalThis.chrome.scripting.executeScript({target: {tabId}, func: pageQuiet, args: [SETTLE_QUIET_MS, 1500]}).catch(() => {});
                        settledInPlace = true;
                        if (!loading) break;
                    }
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            return completed;
        } finally { globalThis.chrome.tabs.onUpdated.removeListener(listener); } };
    };
    return {
        ...options,
        /** The tab the run works in; browserTabs can switch it. */
        get tabId() { return tabId; },
        set tabId(id: number) { tabId = id; },
        chrome,
        originBlank,
        targetOf,
        cue,
        changesSince,
        watchSubmission,
    };
}

export type ToolContext = ReturnType<typeof createToolContext>;
