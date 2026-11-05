import {tool} from "ai";
import {z} from "zod";
import {selectorError} from "./selectorHelp";
import {markFieldToFill, pageTextFingerprint, waitForElementInPage} from "@/injected/tools/waiting";
import {browserCall, setTaskStatus} from "./browserTools";
import {startUserWait} from "./userWaitBus";
import type {ToolContext} from "./toolContext";

export function createWaitTools(context: ToolContext) {
    const {chrome} = context;
    return {
        waitForElement: tool({
            description:
                "Wait for a selector to appear. Skip if navigation already waited for it.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .describe(
                        'CSS selector for the target element, e.g. ".modal.open", "#search-results li"'
                    ),
                timeout: z
                    .number()
                    .optional()
                    .default(5000)
                    .describe("Maximum wait time in ms (default: 5000)"),
            }),
            execute: async ({selector, timeout}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: waitForElementInPage,
                    args: [selector, timeout ?? 5000],
                });
                return result.result;
            },
        }),

        wait: tool({
            description:
                "Pause while something outside your control happens: a support agent or chatbot replying, someone messaging back, a job finishing, an email arriving. " +
                "Returns early when the tab's URL changes and finishes loading (e.g. after the user logs in), or by default once page text (frames included) changes and then holds still for 2s. Read or screenshot the page afterward.",
            inputSchema: z.object({
                seconds: z
                    .number()
                    .min(1)
                    .max(300)
                    .describe("Maximum wait in seconds (1–300). Call again to wait longer."),
                returnOnChange: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe("Return once the watched text changes and settles. false ignores text changes; a URL change still returns."),
                selector: z
                    .string()
                    .optional()
                    .describe("Optional CSS selector to scope change detection, e.g. a chat message list. Checked in every frame; defaults to the whole page."),
                tip: z
                    .object({
                        selector: z.string().describe("Unique CSS selector of what the user should act on, e.g. the sign-in form or its first field."),
                        text: z.string().max(80).describe("Short instruction, 3–8 words, e.g. \"Sign in here, I'll continue after\"."),
                    })
                    .optional()
                    .describe("While waiting for the user (e.g. to log in), the panel shows a waiting card with this text; its \"Show me where\" points Sloth's cursor at the field to fill. Removed when the wait ends."),
            }),
            execute: async ({seconds, returnOnChange, selector, tip}, {abortSignal}) => {
                if (selector) {
                    const invalid = selectorError(selector);
                    if (invalid) return invalid;
                }
                if (tip) {
                    const invalid = selectorError(tip.selector);
                    if (invalid) return invalid;
                }
                const signal = abortSignal ?? context.abortSignal;
                const sleep = (ms: number) => new Promise<void>((resolve, reject) => {
                    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
                    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
                    if (signal?.aborted) abort();
                    else signal?.addEventListener('abort', abort, {once: true});
                });
                // Chat widgets usually live in cross-origin iframes, so hash text in every frame.
                const fingerprint = async () => {
                    try {
                        const results = await chrome.scripting.executeScript({
                            target: {tabId: context.tabId, allFrames: true},
                            func: pageTextFingerprint,
                            args: [selector ?? null],
                        });
                        return results.map(r => r.result ?? '').join('|');
                    } catch (error) {
                        if (signal?.aborted) throw error;
                        return null;
                    }
                };

                // The page tip is drawn only when the user asks "Show me where", and goes away however the wait ends.
                const tipId = tip ? `wait-tip-${crypto.randomUUID()}` : '';
                let tipShown = false;
                const showTip = async () => {
                    if (!tip) return;
                    const tab = await chrome.tabs.update(context.tabId, {active: true});
                    if (tab) await chrome.windows.update(tab.windowId, {focused: true});
                    // Point at the field to fill, even when the selector names the whole form or misses.
                    const [found] = await chrome.scripting.executeScript({
                        target: {tabId: context.tabId},
                        func: markFieldToFill,
                        args: [tip.selector, tipId],
                    });
                    if (!found?.result) return;
                    if (tipShown) await browserCall('guidance', {tabId: context.tabId, action: 'remove', id: tipId}).catch(() => {});
                    await browserCall('guidance', {tabId: context.tabId, action: 'draw', id: tipId, kind: 'highlight', lineStyle: 'dashed',
                        selector: `[data-tampersloth-tip="${tipId}"]`, label: tip.text});
                    tipShown = true;
                };
                // The panel card says Sloth is waiting on the user.
                const endCard = tip ? startUserWait(context.conversationId, {
                    id: tipId, text: tip.text, tabId: context.tabId,
                    host: await chrome.tabs.get(context.tabId).then(t => t.url ? new URL(t.url).hostname : undefined, () => undefined),
                }, {
                    show: () => { showTip().catch(error => console.warn('[Tampersloth] Could not show the tip:', error)); },
                }) : () => {};
                if (tip) void setTaskStatus(context.conversationId, 'waiting');
                try {
                    const start = Date.now();
                    const deadline = start + seconds * 1000;
                    const elapsed = () => Math.round((Date.now() - start) / 100) / 10;
                    // A changed URL usually means the awaited step finished (e.g. a login redirect).
                    const tabState = async () => {
                        try {
                            const tab = await chrome.tabs.get(context.tabId);
                            return {url: tab.url ?? tab.pendingUrl ?? '', loading: tab.status !== 'complete'};
                        } catch { return null; }
                    };
                    const startUrl = (await tabState())?.url ?? '';
                    let navigatedUrl = '';
                    const urlResult = () => ({waitedSeconds: elapsed(), urlChanged: true, from: startUrl, to: navigatedUrl,
                        hint: "The page navigated. Read or screenshot it to confirm what happened (e.g. the user is now signed in)."});

                    let last = returnOnChange ? await fingerprint() : null;
                    let changed = false;
                    while (Date.now() < deadline) {
                        // Poll faster once navigation starts so redirect chains settle quickly.
                        await sleep(Math.min(navigatedUrl ? 1000 : 2000, deadline - Date.now()));
                        const state = await tabState();
                        if (state && startUrl && state.url && state.url !== startUrl) {
                            // Return once loading completes and the URL holds still for one poll.
                            if (!state.loading && state.url === navigatedUrl) return urlResult();
                            navigatedUrl = state.url;
                            continue;
                        }
                        navigatedUrl = '';
                        if (last === null) {
                            if (returnOnChange) last = await fingerprint();
                            continue;
                        }
                        const current = await fingerprint();
                        if (current === null) continue;
                        if (current !== last) {
                            last = current;
                            changed = true;
                        } else if (changed) {
                            return {waitedSeconds: elapsed(), changed: true, settled: true,
                                hint: "Page text changed. Read or screenshot it to see what arrived."};
                        }
                    }
                    if (navigatedUrl) return urlResult();
                    return {waitedSeconds: elapsed(), changed, settled: false,
                        hint: changed
                            ? "Page text is still changing. Read it now, or wait again briefly."
                            : "No change. Wait again if a reply is still expected, otherwise report back."};
                } finally {
                    endCard();
                    if (tip) void setTaskStatus(context.conversationId, 'working');
                    if (tipShown) void browserCall('guidance', {tabId: context.tabId, action: 'remove', id: tipId}).catch(() => {});
                }
            },
        }),

        showTab: tool({
            description:
                "Bring the user to the tab you are working in: activates it and focuses its window. Call it before asking the user to do something there " +
                "(log in, solve a CAPTCHA, approve a prompt, check a result), so they see where their attention is needed. Does not change the target tab.",
            inputSchema: z.object({}),
            execute: async () => {
                const tab = await chrome.tabs.update(context.tabId, {active: true});
                if (!tab) throw new Error('Tab no longer exists');
                await chrome.windows.update(tab.windowId, {focused: true});
                return {shown: true, tabId: tab.id, url: tab.url, title: tab.title};
            },
        }),
    };
}
