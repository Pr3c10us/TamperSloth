import {tool} from "ai";
import {z} from "zod";
import {pageQuiet} from "@/injected/tools/pageQuiet";
import {type ToolContext, SETTLE_QUIET_MS} from "./toolContext";
import {browserCall} from "./browserTools";
import {goThroughHistory, waitForSelectorAfterNavigation} from "@/injected/tools/navigation";

/** Same document, only the fragment differs: the browser scrolls instead of loading anything. */
function sameDocument(a: string, b?: string) {
    try {
        const x = new URL(a), y = new URL(b ?? '');
        return x.hash !== y.hash && x.href.split('#')[0] === y.href.split('#')[0];
    } catch { return false; }
}

/** Reloads a tab and waits for it to finish loading. */
export async function reloadAndWait(chrome: ToolContext["chrome"], tabId: number, {bypassCache = false, timeoutMs = 15000} = {}) {
    const startTime = Date.now();
    await chrome.tabs.reload(tabId, {bypassCache});
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            reject(new Error(`Reload timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        const listener = (updatedTabId: number, changeInfo: {status?: string}) => {
            if (updatedTabId !== tabId || changeInfo.status !== "complete") return;
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        };
        chrome.tabs.onUpdated.addListener(listener);
    });
    const tab = await chrome.tabs.get(tabId);
    return {url: tab.url, title: tab.title, timeMs: Date.now() - startTime};
}

export function createNavigationTools(context: ToolContext) {
    const {chrome} = context;
    return {
        navigateTo: tool({
            description:
                "Navigate the attached tab and wait until it is ready. Optionally readText afterward in the same call; without readText the result lists the new page's on-screen controls with refs. Accepts absolute or relative URLs.",
            inputSchema: z.object({
                url: z
                    .string()
                    .describe(
                        "The URL to navigate to. Can be absolute (https://example.com/page) " +
                        "or relative to the current origin (/dashboard, #section2)."
                    ),
                waitUntil: z
                    .enum(["load", "domcontentloaded"])
                    .optional()
                    .default("domcontentloaded")
                    .describe(
                        '"domcontentloaded" (default) resolves once the HTML is parsed and the DOM has settled briefly. ' +
                        '"load" also waits for every image, ad and tracker; use it only when those matter.'
                    ),
                waitForSelector: z
                    .string()
                    .optional()
                    .describe(
                        "CSS selector to wait for after navigation completes. Navigation only resolves " +
                        "once this element exists in the DOM. Essential for SPAs where the load event " +
                        'fires before content renders. E.g. "#main-content", ".dashboard-loaded".'
                    ),
                timeout: z
                    .number()
                    .optional()
                    .default(15000)
                    .describe(
                        "Maximum wait time in milliseconds for the page load + optional selector (default: 15000)"
                    ),
                readText: z.boolean().default(false).describe('Return concise page text after navigation and optional readiness wait.'),
                readSelector: z.string().optional().describe('Scope the optional text read to this selector.'),
            }),
            execute: async ({url, waitUntil, waitForSelector, timeout, readText}) => {
                const timeoutMs = timeout ?? 15000;
                const startTime = Date.now();

                // Resolve relative URLs against the current tab URL
                const currentTab = await chrome.tabs.get(context.tabId);
                const resolvedUrl = new URL(url, currentTab.url).href;

                // Ready means "complete", or with domcontentloaded: the new document is parsed and its
                // DOM has settled briefly, without waiting on every image, ad and tracker.
                let finish!: (error?: Error) => void;
                const ready = new Promise<void>((resolve, reject) => {
                    let done = false, probing = false;
                    const timer = setTimeout(() => finish(new Error(`Navigation timed out after ${timeoutMs}ms`)), timeoutMs);
                    const listener = (updatedTabId: number, changeInfo: {status?: string}, tab: chrome.tabs.Tab) => {
                        if (updatedTabId !== context.tabId) return;
                        if (changeInfo.status === "complete") finish();
                        else if (waitUntil === "domcontentloaded" && !probing && tab.url && tab.url !== currentTab.url) {
                            probing = true;
                            void (async () => {
                                // Injection waits for the document to be parsed; an early one may still land in the old page.
                                while (!done) {
                                    const [probe] = await globalThis.chrome.scripting.executeScript({target: {tabId: context.tabId}, func: pageQuiet, args: [SETTLE_QUIET_MS, 1000]})
                                        .catch(() => [undefined]);
                                    if (done) return;
                                    if (typeof probe?.result === "string" && probe.result !== currentTab.url) return finish();
                                    await new Promise(r => setTimeout(r, 100));
                                }
                            })();
                        }
                    };
                    finish = (error?: Error) => {
                        if (done) return;
                        done = true;
                        clearTimeout(timer);
                        chrome.tabs.onUpdated.removeListener(listener);
                        if (error) reject(error); else resolve();
                    };
                    chrome.tabs.onUpdated.addListener(listener);
                });
                ready.catch(() => {});

                await chrome.tabs.update(context.tabId, {url: resolvedUrl});
                // A fragment change only scrolls; nothing loads.
                if (sameDocument(resolvedUrl, currentTab.url)) setTimeout(() => finish(), 100);
                await ready;
                const loadDuration = Date.now() - startTime;

                // Optionally wait for a specific selector to appear in the DOM
                let selectorResult = null;
                if (waitForSelector) {
                    const remainingTime = Math.max(timeoutMs - loadDuration, 1000);

                    const [result] = await chrome.scripting.executeScript({
                        target: {tabId: context.tabId},
                        func: waitForSelectorAfterNavigation,
                        args: [waitForSelector, remainingTime],
                    });

                    selectorResult = result.result;
                }

                // Grab final page state
                const finalTab = await chrome.tabs.get(context.tabId);
                const redirected = finalTab.url !== resolvedUrl;
                // To act next, the model needs the page's controls; a text read brings its own page instead.
                const listed = readText ? undefined : await browserCall('guidance', {tabId: context.tabId, action: 'controls', limit: 25}).catch(() => undefined);

                return {
                    success: true,
                    requestedUrl: resolvedUrl,
                    finalUrl: finalTab.url,
                    title: finalTab.title,
                    redirected,
                    loadTimeMs: loadDuration,
                    totalTimeMs: Date.now() - startTime,
                    ...(waitForSelector && {
                        waitForSelector: {
                            selector: waitForSelector,
                            ...selectorResult,
                        },
                    }),
                    ...(listed?.controls?.length && {controls: listed.controls, ...(listed.moreControls ? {moreControls: listed.moreControls} : {})}),
                };
            },
        }),

        navigateHistory: tool({
            description:
                "Go back or forward and wait for page load.",
            inputSchema: z.object({
                direction: z
                    .enum(["back", "forward"])
                    .describe('Navigate "back" or "forward" in history.'),
                timeout: z
                    .number()
                    .optional()
                    .default(10000)
                    .describe("Maximum wait time in ms for the page to load (default: 10000)"),
            }),
            execute: async ({direction, timeout}) => {
                const timeoutMs = timeout ?? 10000;
                const startTime = Date.now();
                const beforeTab = await chrome.tabs.get(context.tabId);

                await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: goThroughHistory,
                    args: [direction],
                });

                await new Promise<void>((resolve) => {
                    const timer = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve();
                    }, timeoutMs);

                    const listener = (
                        updatedTabId: number,
                        changeInfo: { status?: string }
                    ) => {
                        if (updatedTabId !== context.tabId) return;
                        if (changeInfo.status === "complete") {
                            clearTimeout(timer);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };

                    chrome.tabs.onUpdated.addListener(listener);

                    setTimeout(async () => {
                        const current = await chrome.tabs.get(context.tabId);
                        if (current.url === beforeTab.url && current.status === "complete") {
                            clearTimeout(timer);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    }, 500);
                });

                const afterTab = await chrome.tabs.get(context.tabId);
                return {
                    success: true,
                    direction,
                    previousUrl: beforeTab.url,
                    currentUrl: afterTab.url,
                    title: afterTab.title,
                    navigated: afterTab.url !== beforeTab.url,
                    timeMs: Date.now() - startTime,
                };
            },
        }),

        reloadPage: tool({
            description:
                "Reload the attached tab and wait for load.",
            inputSchema: z.object({
                bypassCache: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                        "If true, bypass the browser cache (hard reload). Default: false (normal reload)."
                    ),
                timeout: z
                    .number()
                    .optional()
                    .default(15000)
                    .describe("Maximum wait time in ms for the page to load (default: 15000)"),
            }),
            execute: async ({bypassCache, timeout}) => {
                const page = await reloadAndWait(chrome, context.tabId, {bypassCache: bypassCache ?? false, timeoutMs: timeout ?? 15000});
                return {success: true, ...page, bypassCache: bypassCache ?? false};
            },
        }),
    };
}
