import {tool} from "ai";
import {createBrowserTools, browserImageOutput, browserCall, setTaskStatus} from './browserTools';
import {z} from "zod";
import type {BackgroundScript} from "@/userscripts/types";
import {deleteFile, fileExists, listFiles, readFile, writeFile} from "@/storage/codeFiles";
import {deleteScript, loadScripts, loadScriptsByConversation, saveScript, updateScriptStatus} from "@/storage/scripts";
import {appendChunk, findLines, lineCount, numberedWindow, outlineCode, replaceLineRange, scriptFilePath} from "./codeFileText";
import {isNewTabPage, isValidMatchPattern} from "@/shared/url";
import {type AskUserAnswer, rejectPendingAsk, setPendingAsk,} from "./askUserBus";
import {startUserWait} from "./userWaitBus";
import {leaseTabTools} from "./tabLease";
import { skills, type SkillId } from "@/agent/prompt/skills";
import {scriptTargets} from "@/userscripts/userscript";


// Output budgets. Every tool result stays in the message history and is re-sent
// on each subsequent step, so an uncapped result is charged many times over.
const MAX_DOM_NODES = 250;
const MAX_CONSOLE_LOGS = 50;
const DEFAULT_VIEW_LINES = 120;

const responseFormatSchema = z
    .enum(["concise", "detailed"])
    .optional()
    .default("concise")
    .describe('Use detailed only for additional attributes, styles, or diagnostics.');

/**
 * querySelector throws a SyntaxError inside the injected script for Playwright/jQuery
 * syntax or unescaped utility classes (".hover:bg-muted", ".w-[32px]"); the model then
 * only sees an opaque injection failure. Validate here so it gets a fixable hint.
 */
function selectorError(selector: string | null | undefined) {
    if (!selector || typeof document === "undefined") return null;
    try {
        document.createDocumentFragment().querySelector(selector);
        return null;
    } catch {
        return {
            error: `Invalid CSS selector: ${selector}`,
            hint: "Use standard CSS only (no :has-text(), :contains() or text=). Escape special characters in class names " +
                "(.hover\\:bg-muted) or use attribute selectors such as [aria-label=\"Profile\"], [data-testid=\"avatar\"] or [class~=\"w-[32px]\"].",
        };
    }
}

/**
 * Runs in the page after a selector misses. Models guess site markup ("summary",
 * "img.avatar"); sending them back to getPageStructure loops when the capture stops
 * above the target. Returns real controls they can select directly instead.
 */
function explainNoMatch(sel: string) {
    const split = (text: string, isSep: (ch: string) => boolean) => {
        const out: string[] = [];
        let cur = "", quote = "", nest = 0;
        for (const ch of text) {
            if (quote) { if (ch === quote) quote = ""; }
            else if (ch === '"' || ch === "'") quote = ch;
            else if (ch === "[" || ch === "(") nest++;
            else if (ch === "]" || ch === ")") nest--;
            else if (nest === 0 && isSep(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
            cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    };
    const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const quoteAttr = (v: string) => '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    const selectorFor = (el: Element) => {
        const tag = el.tagName.toLowerCase();
        if (el.id) return "#" + CSS.escape(el.id);
        for (const attr of ["data-testid", "aria-label", "alt", "title", "name"]) {
            const v = el.getAttribute(attr);
            if (v && v.length <= 80) return tag + "[" + attr + "=" + quoteAttr(v) + "]";
        }
        const href = el.getAttribute("href");
        if (href && href.length <= 80) return tag + "[href=" + quoteAttr(href) + "]";
        return tag + (el.classList[0] ? "." + CSS.escape(el.classList[0]) : "");
    };
    const describe = (el: Element) => {
        const selector = selectorFor(el);
        const label = (el.getAttribute("aria-label") || el.getAttribute("alt") || el.textContent || "")
            .trim().replace(/\s+/g, " ").slice(0, 60);
        return {selector, matches: document.querySelectorAll(selector).length, ...(label && {label})};
    };
    const INTERACTIVE = 'a[href],button,summary,[role="button"],[role="menuitem"],[role="link"],input,select,textarea,img[alt],[aria-label]';

    // Deepest existing ancestor of any alternative, e.g. "header.GlobalNav".
    let scope: Element | null = null, scopeSelector = "";
    for (const part of split(sel, ch => ch === ",")) {
        const tokens = split(part, ch => /\s/.test(ch));
        for (let k = tokens.length - 1; k > 0 && !scope; k--) {
            const prefix = tokens.slice(0, k).join(" ").replace(/\s*[>+~]$/, "");
            try { scope = document.querySelector(prefix); } catch { /* not a valid prefix */ }
            if (scope) scopeSelector = prefix;
        }
        if (scope) break;
    }

    // Quoted attribute values ("profile", "Account") matched against real labels.
    const words = Array.from(sel.matchAll(/["']([^"']{3,})["']/g), m => m[1].toLowerCase());
    const labelMatches = words.length ? Array.from(document.querySelectorAll(INTERACTIVE)).filter(el => {
        if (!visible(el)) return false;
        const hay = ["aria-label", "alt", "title", "data-testid"].map(a => el.getAttribute(a) ?? "").join(" ").toLowerCase();
        return words.some(w => hay.includes(w));
    }).slice(0, 6).map(describe) : [];
    const controlsInScope = scope ? Array.from(scope.querySelectorAll(INTERACTIVE)).filter(visible).slice(0, 12).map(describe) : [];

    if (!labelMatches.length && !controlsInScope.length) return {};
    return {
        ...(labelMatches.length && {labelMatches}),
        ...(controlsInScope.length && {scope: scopeSelector, controlsInScope}),
        hint: "Do not guess markup. Use a selector from labelMatches or controlsInScope (matches = how many elements it hits).",
    };
}

async function withSelectorHelp<T>(tabId: number, selector: string | null | undefined, output: T): Promise<T> {
    const error = (output as {error?: unknown} | null)?.error;
    if (!selector || typeof error !== "string" || !error.startsWith("No element")) return output;
    try {
        const [help] = await chrome.scripting.executeScript({target: {tabId}, func: explainNoMatch, args: [selector]});
        return {...output, ...help.result};
    } catch {
        return output;
    }
}

/** An action counts as settled once the page has changed and then gone this long without changing. */
const SETTLE_QUIET_MS = 150;
/** A submit that navigates shows the tab loading within this. */
const NAVIGATION_START_MS = 400;

/**
 * Runs in the page: resolves with its URL once the DOM has gone `quietMs` without changing, or
 * after `capMs`. Injection waits for the document to be parsed, so this is "parsed and settled".
 * With `needChange`, quiet only counts after something changed (suggestions arriving after typing).
 */
function pageQuiet(quietMs: number, capMs: number, needChange = false) {
    return new Promise<string>(resolve => {
        const start = performance.now();
        let last = start, changed = false;
        const observer = new MutationObserver(() => { last = performance.now(); changed = true; });
        observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
        const check = () => {
            const now = performance.now();
            if (((changed || !needChange) && now - last >= quietMs) || now - start >= capMs) { observer.disconnect(); resolve(location.href); }
            else setTimeout(check, 25);
        };
        setTimeout(check, quietMs);
    });
}

/** Same document, only the fragment differs: the browser scrolls instead of loading anything. */
function sameDocument(a: string, b?: string) {
    try {
        const x = new URL(a), y = new URL(b ?? '');
        return x.hash !== y.hash && x.href.split('#')[0] === y.href.split('#')[0];
    } catch { return false; }
}

const SKILL_IDS = Object.keys(skills) as [SkillId, ...SkillId[]];

export function createAgentTools(context: { conversationId: string; abortSignal?: AbortSignal; findAttachment?: (name: string) => Promise<Blob | null> }) {
    let tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
    // Check cancellation at each browser mutation, including later steps of a tool.
    const guard = async () => {
        if (context.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
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
    // The page overlay names controls (listControls refs) and reports what an action changed.
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
    return leaseTabTools({
        ...createBrowserTools(() => tabId, id => { tabId = id; }, context.abortSignal, {conversationId: context.conversationId, originTabId: tabId > 0 ? tabId : undefined, originBlank, findAttachment: context.findAttachment}),
        // ═══════════════════════════════════════════════
        //  Skills
        // ═══════════════════════════════════════════════
        getSkill: tool({
            description:
                "Read optional reference guidance by skill_id. Fetch only details missing from the current context.",
            inputSchema: z.object({
                skill_id: z
                    .enum(SKILL_IDS)
                    .describe(
                        "Reference topic.",
                    ),
            }),
            execute: async ({skill_id}) => {
                const skill = skills[skill_id];
                if (!skill) {
                    return {
                        ok: false,
                        error: `Unknown skill_id: "${skill_id}". Available: ${Object.keys(skills).join(", ")}`,
                    };
                }
                return {
                    ok: true,
                    skill_id,
                    description: skill.description,
                    content: skill.content,
                };
            },
        }),

        // ═══════════════════════════════════════════════
        //  Code Edit
        // ═══════════════════════════════════════════════
        viewCodeFiles: tool({
            description:
                "Read numbered file lines, find lines with query, or list files with a path ending in /. In a long file, find the code with query rather than paging through it. Line-number prefixes are display-only.",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe('Virtual path. End with "/" to list a "directory" (prefix scan).'),
                query: z
                    .string()
                    .min(1)
                    .optional()
                    .describe('Text to find (case-insensitive), or a /regex/flags. Returns matching lines with their numbers and a little context, instead of a range.'),
                start_line: z
                    .number()
                    .int()
                    .optional()
                    .describe('Optional start line (1-indexed, inclusive). Defaults to 1.'),
                end_line: z
                    .number()
                    .int()
                    .optional()
                    .describe(
                        `Optional end line (1-indexed, inclusive). Omitted, reads a ${DEFAULT_VIEW_LINES}-line ` +
                        'window from start_line. Use -1 to read as far as one result allows.',
                    ),
            }),
            execute: async ({path, query, start_line, end_line}) => {
                try {
                    if (path.endsWith('/')) {
                        const entries = await listFiles(context.conversationId, path);
                        return {type: 'directory' as const, path, entries};
                    }

                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }

                    if (query) {
                        const found = findLines(content, query);
                        return {
                            type: 'search' as const,
                            path,
                            query,
                            ...found,
                            ...(found.shownMatches < found.matches && {
                                truncated: true,
                                hint: `Showing ${found.shownMatches} of ${found.matches} matches. Use a narrower query.`,
                            }),
                        };
                    }

                    const totalLines = lineCount(content);
                    const start = start_line ?? 1;
                    // Defaulting to EOF meant every re-view of a long script paid
                    // for the whole file again.
                    const end =
                        end_line === -1
                            ? totalLines
                            : end_line != null
                                ? end_line
                                : Math.min(totalLines, start + DEFAULT_VIEW_LINES - 1);
                    const {text, lastLine} = numberedWindow(content, start, end);

                    return {
                        type: 'file' as const,
                        path,
                        totalLines,
                        viewedRange: [start, lastLine] as [number, number],
                        ...(lastLine < totalLines && {
                            truncated: true,
                            nextStartLine: lastLine + 1,
                            hint:
                                `Showing lines ${start}-${lastLine} of ${totalLines}. To find something specific, ` +
                                "use query instead of reading on.",
                        }),
                        content: text,
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        createFileTool: tool({
            description:
                "Create a virtual file. Fails if it exists. Write at most about 150 lines per call and add the rest with appendToFile; edit existing files with strReplaceTool or replaceLines.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path where the new file should live'),
                file_text: z.string().describe("The file's content, or its first piece when appendToFile will add the rest"),
            }),
            execute: async ({path, file_text}) => {
                try {
                    if (await fileExists(context.conversationId, path)) {
                        return {error: `File already exists at ${path}. Use appendToFile to add to it, or strReplaceTool or replaceLines to edit it.`};
                    }
                    await writeFile(context.conversationId, path, file_text);
                    return {
                        success: true as const,
                        path,
                        bytesWritten: new Blob([file_text]).size,
                        lines: lineCount(file_text),
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        appendToFile: tool({
            description:
                "Add the next piece to the end of a virtual file, on a new line. Write long files this way, at most about 150 lines per call. Send only the new code, never what is already saved.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path to add to; created if it does not exist'),
                text: z.string().min(1).describe('The code that comes next'),
            }),
            execute: async ({path, text}) => {
                try {
                    const updated = appendChunk(await readFile(context.conversationId, path), text);
                    await writeFile(context.conversationId, path, updated);
                    return {success: true as const, path, addedLines: lineCount(text), totalLines: lineCount(updated)};
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        strReplaceTool: tool({
            description:
                "Replace exact unique strings in a virtual file. Use old_str/new_str or an ordered edits array. Batch edits commit atomically. Empty replacement deletes. For a large block, replaceLines avoids retyping it.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path to edit'),
                old_str: z.string().min(1).optional().describe('Exact unique string. Omit when using edits.'),
                new_str: z.string().default('').describe('Replacement string (empty deletes old_str)'),
                edits: z.array(z.object({old_str: z.string().min(1), new_str: z.string()})).min(1).max(20).optional()
                    .describe('Ordered replacements, committed together only if every match is unique. Alternative to old_str/new_str.'),
            }),
            execute: async ({path, old_str, new_str, edits}) => {
                try {
                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }

                    if ((old_str !== undefined) === (edits !== undefined)) {
                        return {error: 'Provide either old_str/new_str or edits, not both.'};
                    }
                    const replacements = edits ?? [{old_str: old_str!, new_str}];
                    let updated = content;
                    for (const [index, edit] of replacements.entries()) {
                        const occurrences = updated.split(edit.old_str).length - 1;
                        if (occurrences !== 1) return {error: `Edit ${index + 1}: old_str matches ${occurrences} times; expected exactly once. No changes written.`};
                        updated = updated.replace(edit.old_str, () => edit.new_str);
                    }
                    await writeFile(context.conversationId, path, updated);

                    return {
                        success: true as const,
                        path,
                        replaced: replacements.length,
                        delta: updated.length - content.length,
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        replaceLines: tool({
            description:
                "Replace a range of lines in a virtual file without retyping them. Empty new_text deletes the range; end_line = start_line - 1 inserts before start_line. Take line numbers from a fresh view or search, since any edit shifts them.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path to edit'),
                start_line: z.number().int().min(1).describe('First line to replace (1-indexed)'),
                end_line: z.number().int().min(0).describe('Last line to replace (inclusive)'),
                first_line: z.string().describe('The current text of start_line, without its number; checked so stale numbers cannot damage the file. Empty when inserting past the last line.'),
                new_text: z.string().default('').describe('The replacement lines'),
            }),
            execute: async ({path, start_line, end_line, first_line, new_text}) => {
                try {
                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }
                    const edit = replaceLineRange(content, start_line, end_line, first_line, new_text);
                    if ("error" in edit) return edit;
                    await writeFile(context.conversationId, path, edit.content);
                    return {
                        success: true as const,
                        path,
                        removedLines: edit.removed,
                        addedLines: edit.added,
                        totalLines: edit.totalLines,
                        around: numberedWindow(edit.content, start_line - 2, start_line + edit.added + 1, 1500).text,
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        deleteFileTool: tool({
            description: "Delete a virtual working file; no-op if absent.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path to delete'),
            }),
            execute: async ({path}) => {
                try {
                    const existed = await fileExists(context.conversationId, path);
                    await deleteFile(context.conversationId, path);
                    return {success: true as const, path, existed};
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        // ═══════════════════════════════════════════════
        //  PAGE INSPECTION
        // ═══════════════════════════════════════════════

        getCurrentTab: tool({
            description:
                "Refresh the attached tab URL and title. Initial tab metadata is already supplied.",
            inputSchema: z.object({
            }),
            execute: async () => {
                const tab = await chrome.tabs.get(tabId);
                return {tabId: tab.id, url: tab.url, title: tab.title};
            },
        }),

        getPageStructure: tool({
            description:
                "Inspect scoped DOM for selectors and links. Prefer getPageText for text. Expand maxNodes or scope when truncated.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .optional()
                    .describe(
                        "CSS selector to scope the capture to a specific section"
                    ),
                responseFormat: responseFormatSchema,
                maxNodes: z.number().int().min(20).max(1500).default(MAX_DOM_NODES),
                tabId: z.number().int().positive().optional()
                    .describe("Read another tab (e.g. a reference tab) without changing which tab page actions target. Omit for the target tab."),
            }),
            execute: async ({selector, responseFormat, maxNodes, tabId: readTabId}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: readTabId ?? tabId},
                    func: (sel: string | null, format: string, maxNodes: number) => {
                        const root = sel ? document.querySelector(sel) : document.body;
                        if (!root) {
                            return {
                                error: `No element found for selector: ${sel}`,
                                hint: "Omit selector to capture from document.body, or call getPageText to find valid landmarks.",
                            };
                        }

                        const concise = format === "concise";

                        // Depth alone does not bound this — a page can hold
                        // thousands of elements within six levels.
                        let budget = maxNodes;
                        let omitted = 0;
                        const omittedSubtrees: Array<{ selector: string; nodes: number }> = [];

                        const describe = (el: Element) => {
                            const id = el.id ? "#" + el.id : "";
                            const cls = el.classList.length
                                ? "." + Array.from(el.classList).slice(0, 2).join(".")
                                : "";
                            return el.tagName.toLowerCase() + id + cls;
                        };

                        const countNodes = (el: Element): number => {
                            let n = 1;
                            for (const c of Array.from(el.children)) n += countNodes(c);
                            return n;
                        };

                        function simplify(el: Element, depth = 0): any {
                            if (depth > 6) {
                                const size = countNodes(el);
                                omitted += size;
                                omittedSubtrees.push({selector: describe(el), nodes: size});
                                return "...";
                            }
                            if (budget <= 0) return null;
                            budget--;

                            const info: any = {tag: el.tagName.toLowerCase()};

                            if (concise) {
                                if (el.id) info.id = el.id;
                                if (el.classList.length) info.class = Array.from(el.classList).join(" ").slice(0, 160);
                                for (const attr of ["href", "role", "aria-label", "data-testid", "name", "type", "placeholder"]) {
                                    if (el.hasAttribute(attr)) info[attr] = el.getAttribute(attr)!.slice(0, 180);
                                }
                                const label = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent?.trim()).filter(Boolean).join(" ");
                                if (label) info.text = label.slice(0, 100);
                            } else {
                                const dominated = [
                                    "id", "class", "name", "type", "role", "aria-label",
                                    "href", "src", "placeholder", "data-testid", "value", "action",
                                ];
                                const attrs: Record<string, string> = {};
                                for (const attr of dominated) {
                                    if (el.hasAttribute(attr)) {
                                        let val = el.getAttribute(attr)!;
                                        if (val.length > 100) val = val.slice(0, 100) + "...";
                                        attrs[attr] = val;
                                    }
                                }
                                if (Object.keys(attrs).length) info.attrs = attrs;

                                const directText = Array.from(el.childNodes)
                                    .filter((n) => n.nodeType === Node.TEXT_NODE)
                                    .map((n) => n.textContent?.trim())
                                    .filter(Boolean)
                                    .join(" ");
                                if (directText) info.text = directText.slice(0, 200);

                                const rect = el.getBoundingClientRect();
                                if (rect.width === 0 && rect.height === 0) info.hidden = true;
                            }

                            const children: any[] = [];
                            for (const c of Array.from(el.children)) {
                                if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(c.tagName)) continue;
                                if (budget <= 0) {
                                    // Record what was skipped so the agent can
                                    // re-query that subtree instead of guessing.
                                    const size = countNodes(c);
                                    omitted += size;
                                    omittedSubtrees.push({selector: describe(c), nodes: size});
                                    continue;
                                }
                                const child = simplify(c, depth + 1);
                                if (child) children.push(child);
                            }
                            if (children.length) info.children = children;

                            return info;
                        }

                        const tree = simplify(root);

                        return {
                            url: location.href,
                            title: document.title,
                            tree,
                            ...(omitted > 0 && {
                                truncated: true,
                                omittedNodes: omitted,
                                largestOmitted: omittedSubtrees
                                    .sort((a, b) => b.nodes - a.nodes)
                                    .slice(0, 5),
                                hint:
                                    `DOM node (${maxNodes}) or depth limit reached — ${omitted} nodes omitted. ` +
                                    "Re-run with `selector` scoped to one of largestOmitted rather than " +
                                    "capturing the whole page again.",
                            }),
                        };
                    },
                    args: [selector ?? null, responseFormat ?? "concise", maxNodes ?? MAX_DOM_NODES],
                });

                return result.result;
            },
        }),

        getElementDetails: tool({
            description:
                "Inspect elements matching a selector. Detailed includes HTML, positions and computed styles.",
            inputSchema: z.object({
                selector: z.string(),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (sel: string, format: string) => {
                        const els = document.querySelectorAll(sel);
                        if (els.length === 0) {
                            const suggestions: string[] = [];
                            const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
                            if (classMatch) {
                                const similar = document.querySelectorAll('[class*="' + classMatch[1] + '"]');
                                if (similar.length > 0) suggestions.push("Similar classes: " + Array.from(similar).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + Array.from(e.classList).join(".")).join(", "));
                            }
                            const tagMatch = sel.match(/^([a-z]+)/i);
                            if (tagMatch) {
                                const count = document.querySelectorAll(tagMatch[1]).length;
                                if (count > 0) suggestions.push(count + " <" + tagMatch[1] + "> elements exist on the page");
                            }
                            return {
                                error: `No elements found for selector: ${sel}`, ...(suggestions.length > 0 && {suggestions}),
                                hint: "Call getPageStructure to inspect the DOM and find valid selectors."
                            };
                        }
                        const concise = format === "concise";
                        return Array.from(els)
                            .slice(0, 10)
                            .map((el) => {
                                const rect = el.getBoundingClientRect();
                                const style = getComputedStyle(el);
                                if (concise) {
                                    return {
                                        tag: el.tagName.toLowerCase(),
                                        id: el.id || undefined,
                                        text: el.textContent?.trim().slice(0, 100),
                                        visible: style.display !== "none"
                                            && style.visibility !== "hidden"
                                            && rect.width > 0 && rect.height > 0,
                                    };
                                }
                                return {
                                    tag: el.tagName.toLowerCase(),
                                    id: el.id || undefined,
                                    classes: Array.from(el.classList),
                                    text: el.textContent?.trim().slice(0, 300),
                                    html: el.outerHTML.slice(0, 500),
                                    visibility: {
                                        visible: style.display !== "none"
                                            && style.visibility !== "hidden"
                                            && rect.width > 0 && rect.height > 0,
                                        belowFold: rect.top > window.innerHeight,
                                        displayType: style.display,
                                    },
                                    position: {
                                        top: Math.round(rect.top),
                                        left: Math.round(rect.left),
                                        width: Math.round(rect.width),
                                        height: Math.round(rect.height),
                                    },
                                    style: {
                                        color: style.color,
                                        fontSize: style.fontSize,
                                        fontFamily: style.fontFamily,
                                        backgroundColor: style.backgroundColor,
                                        borderRadius: style.borderRadius,
                                        padding: style.padding,
                                        boxShadow: style.boxShadow,
                                    },
                                };
                            });
                    },
                    args: [selector, responseFormat ?? "concise"],
                });
                return withSelectorHelp(tabId, selector, result.result);
            },
        }),

        getPageText: tool({
            description:
                "Read visible page text, scoped to selector or main/article. Follow nextOffset for more; offsets refer to current text.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector to scope extraction to a specific container (e.g. "main", "#content"). ' +
                        "Omit to get the full page text."
                    ),
                maxLength: z
                    .number()
                    .int().min(100).max(20000)
                    .optional()
                    .describe("Characters per page: default 3000 concise, 10000 detailed; maximum 20000."),
                offset: z.number().int().min(0).default(0).describe('Character offset for the next page of text.'),
                responseFormat: responseFormatSchema,
                tabId: z.number().int().positive().optional()
                    .describe("Read another tab (e.g. a reference tab) without changing which tab page actions target. Omit for the target tab."),
            }),
            execute: async ({selector, maxLength, responseFormat, offset, tabId: readTabId}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const effectiveMax = maxLength ?? (responseFormat === "detailed" ? 10000 : 3000);
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: readTabId ?? tabId},
                    func: (sel: string | null, max: number, format: string, start: number) => {
                        const concise = format === "concise";
                        let root: Element | null;
                        if (sel) {
                            root = document.querySelector(sel);
                        } else if (concise) {
                            root = document.querySelector("main")
                                ?? document.querySelector("article")
                                ?? document.body;
                        } else {
                            root = document.body;
                        }
                        if (!root)
                            return {error: `No element found for selector: ${sel}`};

                        const text = (root as HTMLElement).innerText?.trim() ?? "";
                        const truncated = text.length > start + max;

                        let availableSections: string[] | undefined;
                        if (truncated) {
                            const sections: string[] = [];
                            for (const tag of ["nav", "main", "article", "aside", "footer", "header"]) {
                                const el = document.querySelector(tag);
                                if (el) {
                                    const len = (el as HTMLElement).innerText?.trim().length ?? 0;
                                    if (len > 0) sections.push(tag + " (~" + len + " chars)");
                                }
                            }
                            if (sections.length > 0) availableSections = sections;
                        }

                        return {
                            url: location.href,
                            title: document.title,
                            selector: sel ?? (concise ? root.tagName.toLowerCase() : "body"),
                            length: text.length,
                            offset: start,
                            truncated,
                            text: text.slice(start, start + max),
                            ...(truncated && {nextOffset: start + max}),
                            ...(truncated && availableSections && {
                                availableSections,
                                hint: "Use nextOffset for more text, or scope with selector. Offsets apply to the current page text.",
                            }),
                        };
                    },
                    args: [selector ?? null, effectiveMax, responseFormat ?? "concise", offset ?? 0],
                });
                return result.result;
            },
        }),

        takeScreenshot: tool({
            description:
                "Capture the visible viewport as an image. Use for visual verification.",
            inputSchema: z.object({
                detail: z.enum(["standard", "full"]).default("standard").describe('Standard caps width at 1280px; full preserves resolution for fine detail.'),
            }),
            execute: async ({detail}) => {
                const response = await chrome.runtime.sendMessage({
                    type: "TAKE_SCREENSHOT",
                    tabId,
                    maxWidth: detail === "full" ? undefined : 1280,
                });
                if (response?.error) throw new Error(response.error);
                return {screenshot: response.dataUrl as string, metadata: response.metadata};
            },
            toModelOutput: ({output}) => {
                return browserImageOutput(output);
            },
        }),

        // ═══════════════════════════════════════════════
        //  PAGE STATE (storage, cookies)
        // ═══════════════════════════════════════════════

        getLocalStorage: tool({
            description:
                "Read page local/session storage, optionally filtered by key prefix. Values are capped.",
            inputSchema: z.object({
                storageType: z
                    .enum(["local", "session", "both"])
                    .optional()
                    .default("local")
                    .describe(
                        'Which storage to read: "local" (default), "session", or "both". ' +
                        'Only ask for "both" when you actually need session storage too — it doubles the output.'
                    ),
                keyPrefix: z
                    .string()
                    .optional()
                    .describe(
                        'Only return keys starting with this prefix (e.g. "auth_", "user_"). ' +
                        "Strongly preferred over reading every key."
                    ),
                maxKeys: z
                    .number()
                    .optional()
                    .default(25)
                    .describe(
                        "Maximum number of keys to return per storage type (default: 25). " +
                        "Raise only when a prefix search has already narrowed the set."
                    ),
            }),
            execute: async ({storageType, keyPrefix, maxKeys}) => {
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (type: string, prefix: string | null, max: number) => {
                        const readStorage = (storage: Storage, name: string) => {
                            const entries: Record<string, string> = {};
                            let count = 0;
                            for (let i = 0; i < storage.length && count < max; i++) {
                                const key = storage.key(i)!;
                                if (prefix && !key.startsWith(prefix)) continue;
                                let value = storage.getItem(key) ?? "";
                                if (value.length > 300)
                                    value = value.slice(0, 300) + `...[truncated, ${value.length} chars total]`;
                                entries[key] = value;
                                count++;
                            }
                            return {
                                name,
                                count,
                                total: storage.length,
                                ...(storage.length > count && {
                                    truncated: true,
                                    hint: "Not all keys returned. Use keyPrefix to target what you need.",
                                }),
                                entries,
                            };
                        };

                        const data: any = {origin: location.origin};
                        if (type === "local" || type === "both") {
                            data.localStorage = readStorage(localStorage, "localStorage");
                        }
                        if (type === "session" || type === "both") {
                            data.sessionStorage = readStorage(
                                sessionStorage,
                                "sessionStorage"
                            );
                        }
                        return data;
                    },
                    args: [storageType ?? "local", keyPrefix ?? null, maxKeys ?? 25],
                });
                return result.result;
            },
        }),

        getCookies: tool({
            description:
                "Read cookies for the attached page, optionally filtered by name.",
            inputSchema: z.object({
                nameFilter: z
                    .string()
                    .optional()
                    .describe(
                        'Only return cookies whose name contains this substring (e.g. "session", "token"). ' +
                        "Case-insensitive. Omit to return all."
                    ),
            }),
            execute: async ({nameFilter}) => {
                const tab = await chrome.tabs.get(tabId);
                if (!tab.url) return {error: "Cannot access tab URL"};

                const url = new URL(tab.url);
                const allCookies = await chrome.cookies.getAll({
                    domain: url.hostname,
                });

                const filtered = nameFilter
                    ? allCookies.filter((c) =>
                        c.name.toLowerCase().includes(nameFilter.toLowerCase())
                    )
                    : allCookies;

                return {
                    domain: url.hostname,
                    total: allCookies.length,
                    returned: filtered.length,
                    cookies: filtered.slice(0, 50).map((c) => ({
                        name: c.name,
                        value:
                            c.value.length > 200
                                ? c.value.slice(0, 200) + "...[truncated]"
                                : c.value,
                        domain: c.domain,
                        path: c.path,
                        secure: c.secure,
                        httpOnly: c.httpOnly,
                        sameSite: c.sameSite,
                        expirationDate: c.expirationDate
                            ? new Date(c.expirationDate * 1000).toISOString()
                            : "session",
                    })),
                };
            },
        }),

        // ═══════════════════════════════════════════════
        //  EXECUTION & SCRIPTING
        // ═══════════════════════════════════════════════

        executeContentScript: tool({
            description:
                "Run the named function in a virtual file on the attached page. Create the file first. Null may indicate failure.",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe(
                        'Virtual path to the script file containing a named function definition (e.g. "scripts/highlight.js").'
                    ),
            }),
            execute: async ({path}) => {
                const code = await readFile(context.conversationId, path);
                if (code === null) {
                    return {
                        success: false,
                        error: `No file at ${path}. Create it with createFileTool first.`,
                    };
                }

                const fnMatch = code.match(
                    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/
                );
                if (!fnMatch) {
                    return {
                        success: false,
                        error:
                            `File at ${path} must contain a named function definition, e.g. function myFn() { ... }`,
                    };
                }
                const response = await chrome.runtime.sendMessage({
                    type: "EXECUTE_SCRIPT",
                    code,
                    tabId,
                });
                if (response?.error) {
                    return {
                        success: false,
                        error: response.error,
                        suggestion: response.error.includes('userScripts') || response.error.includes('Developer Mode') || response.error.includes('Allow User Scripts')
                            ? 'Go to chrome://extensions, click Tampersloth details, and enable "Allow User Scripts" (or "Allow in Developer Mode"). Then reload the extension.'
                            : undefined,
                    };
                }
                return response.result;
            },
        }),

        openScript: tool({
            description:
                "Open a saved script for editing. Puts its code in a working file and returns the file's path and an outline with line numbers (the code itself only when short). Then find code with viewCodeFiles query, edit with strReplaceTool or replaceLines, and update it with saveScript scriptId. Never rewrite a saved script to change it.",
            inputSchema: z.object({
                scriptId: z.string().describe("The ID of the saved script"),
                reset: z.boolean().optional().describe("Discard a working copy that differs from the saved code, and start again from the saved code."),
            }),
            execute: async ({scriptId, reset}) => {
                const script = (await loadScripts()).find((s) => s.id === scriptId);
                if (!script) {
                    return {error: `No saved script with ID ${scriptId}. Use listScripts to find it.`};
                }
                let path = script.sourcePath ?? scriptFilePath(script.name, script.id);
                let current = await readFile(context.conversationId, path);
                // Another script's file can already hold this name; a linked file is this script's own.
                if (!script.sourcePath && current !== null && current !== script.code) {
                    path = scriptFilePath(`${script.name}-${script.id.slice(0, 6)}`, script.id);
                    current = await readFile(context.conversationId, path);
                }
                if (current === null || reset) {
                    await writeFile(context.conversationId, path, script.code);
                    current = script.code;
                }
                const totalLines = lineCount(current);
                const short = totalLines <= DEFAULT_VIEW_LINES ? numberedWindow(current, 1, totalLines) : undefined;
                return {
                    success: true,
                    scriptId,
                    name: script.name,
                    path,
                    totalLines,
                    urlMatchPattern: script.urlMatchPattern,
                    runAt: script.runAt,
                    status: script.status,
                    ...(script.userscript && {
                        installedUserscript: "The file is this installed userscript's full source; its version and permissions were fixed at install.",
                    }),
                    ...(current !== script.code && {
                        differsFromSaved: "This working copy has edits the saved script does not. Pass reset to start again from the saved code.",
                    }),
                    ...(short?.lastLine === totalLines
                        ? {content: short.text}
                        : {outline: outlineCode(current), hint: "Use viewCodeFiles with query or start_line to read only the part you need."}),
                };
            },
        }),

        saveScript: tool({
            description:
                "Save a tested virtual file as a persistent browser script, or with scriptId update a saved one in place, keeping its settings and data. The working file stays for later edits. Confirm URL scope with the user first when adding a script or changing its scope.",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe(
                        'Virtual path to the script file containing the JavaScript code to execute persistently.'
                    ),
                scriptId: z.string().optional().describe("The saved script to update in place. Omit to add a new one."),
                name: z.string().optional().describe("Short descriptive name for the script. Required for a new script."),
                scriptDescription: z
                    .string()
                    .optional()
                    .describe("What this script does (stored alongside the script for later reference). Required for a new script."),
                urlMatchPattern: z
                    .string()
                    .optional()
                    .describe(
                        "Chrome-style URL match pattern. Format: <scheme>://<host>/<path>. " +
                        "Examples: https://*.example.com/*, *://example.com/api/*, <all_urls>"
                    ),
                runAt: z.enum(['document_start', 'document_end', 'document_idle'])
                    .optional()
                    .describe(
                        "When to inject: document_start (before DOM), document_end (DOM ready), document_idle (page loaded, default)"
                    ),
            }),
            execute: async ({path, scriptId, name, scriptDescription, urlMatchPattern, runAt}) => {
                if (urlMatchPattern && !isValidMatchPattern(urlMatchPattern)) {
                    return {
                        success: false,
                        error:
                            `Invalid URL match pattern: "${urlMatchPattern}". ` +
                            "Must follow Chrome match pattern format: <scheme>://<host>/<path>.",
                    };
                }

                const code = await readFile(context.conversationId, path);
                if (code === null) {
                    return {
                        success: false,
                        error: `No file at ${path}. Create it with createFileTool first.`,
                    };
                }

                // Every script tags its UI this way, so a bare selector deletes other scripts' UI too.
                if (/querySelector(?:All)?\(\s*(['"`])\[data-ts-ui\]\1\s*\)[\s\S]{0,80}?\.remove\(\)/.test(code)) {
                    return {
                        success: false,
                        error:
                            "This code removes every [data-ts-ui] element, which also deletes what the user's other scripts added to the page. " +
                            "Give this script's elements unique data-ts-ui values and remove only those, e.g. [data-ts-ui=\"acme-css\"], then save again.",
                    };
                }

                const saved = await loadScripts();
                // Saving a file again means updating what it was saved as, not adding a duplicate.
                const previous = scriptId
                    ? saved.find((s) => s.id === scriptId)
                    : saved.find((s) => s.conversationId === context.conversationId && s.sourcePath === path);
                if (scriptId && !previous) {
                    return {success: false, error: `No saved script with ID ${scriptId}. Use listScripts to find it.`};
                }
                if (!previous && !name) {
                    return {success: false, error: "A new script needs a name. Pass scriptId to update a saved one."};
                }

                const script: BackgroundScript = previous
                    ? {
                        ...previous,
                        code,
                        sourcePath: path,
                        name: name ?? previous.name,
                        description: scriptDescription ?? previous.description,
                        urlMatchPattern: urlMatchPattern ?? previous.urlMatchPattern,
                        runAt: runAt ?? previous.runAt,
                    }
                    : {
                        id: crypto.randomUUID(),
                        conversationId: context.conversationId,
                        name: name!,
                        description: scriptDescription ?? "",
                        code,
                        sourcePath: path,
                        urlMatchPattern: urlMatchPattern ?? "",
                        status: "active",
                        runAt: runAt ?? 'document_idle',
                    };

                await saveScript(script);

                return {
                    success: true,
                    scriptId: script.id,
                    name: script.name,
                    sourcePath: path,
                    urlMatchPattern: script.urlMatchPattern,
                    status: script.status,
                    runAt: script.runAt,
                    ...(previous ? {updated: true} : {}),
                    lines: lineCount(code),
                };
            },
        }),

        listScripts: tool({
            description:
                "List saved script IDs, names, status, URL patterns and sizes; optionally filter to this conversation. Use openScript to work on one's code.",
            inputSchema: z.object({
                conversationOnly: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                        "If true, only show scripts from the current conversation"
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({conversationOnly, responseFormat}) => {
                const scripts = conversationOnly
                    ? await loadScriptsByConversation(context.conversationId)
                    : await loadScripts();

                const concise = responseFormat === "concise";
                return {
                    count: scripts.length,
                    scripts: scripts.map((s) => concise
                        ? {id: s.id, name: s.name, status: s.status, urlPattern: scriptTargets(s).join(", "), lines: s.code ? lineCount(s.code) : 0}
                        : {
                            id: s.id,
                            name: s.name,
                            description: s.description,
                            urlPattern: scriptTargets(s).join(", "),
                            status: s.status,
                            lines: s.code ? lineCount(s.code) : 0,
                            ...(s.sourcePath ? {path: s.sourcePath} : {}),
                        }
                    ),
                };
            },
        }),

        toggleScript: tool({
            description: "Pause or resume a saved script by ID.",
            inputSchema: z.object({
                scriptId: z.string().describe("The ID of the script to toggle"),
                action: z
                    .enum(["pause", "resume"])
                    .describe("Whether to pause or resume the script"),
            }),
            execute: async ({scriptId, action}) => {
                await updateScriptStatus(
                    scriptId,
                    action === "pause" ? "paused" : "active"
                );
                return {
                    success: true,
                    scriptId,
                    status: action === "pause" ? "paused" : "active",
                };
            },
        }),

        removeScript: tool({
            description: "Permanently delete a saved script by ID after user confirmation.",
            inputSchema: z.object({
                scriptId: z.string().describe("The ID of the script to delete"),
            }),
            execute: async ({scriptId}) => {
                await deleteScript(scriptId);
                return {success: true, scriptId};
            },
        }),

        // ═══════════════════════════════════════════════
        //  NAVIGATION
        // ═══════════════════════════════════════════════

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
                const currentTab = await chrome.tabs.get(tabId);
                const resolvedUrl = new URL(url, currentTab.url).href;

                // Ready means "complete", or with domcontentloaded: the new document is parsed and its
                // DOM has settled briefly, without waiting on every image, ad and tracker.
                let finish!: (error?: Error) => void;
                const ready = new Promise<void>((resolve, reject) => {
                    let done = false, probing = false;
                    const timer = setTimeout(() => finish(new Error(`Navigation timed out after ${timeoutMs}ms`)), timeoutMs);
                    const listener = (updatedTabId: number, changeInfo: {status?: string}, tab: chrome.tabs.Tab) => {
                        if (updatedTabId !== tabId) return;
                        if (changeInfo.status === "complete") finish();
                        else if (waitUntil === "domcontentloaded" && !probing && tab.url && tab.url !== currentTab.url) {
                            probing = true;
                            void (async () => {
                                // Injection waits for the document to be parsed; an early one may still land in the old page.
                                while (!done) {
                                    const [probe] = await globalThis.chrome.scripting.executeScript({target: {tabId}, func: pageQuiet, args: [SETTLE_QUIET_MS, 1000]})
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

                await chrome.tabs.update(tabId, {url: resolvedUrl});
                // A fragment change only scrolls; nothing loads.
                if (sameDocument(resolvedUrl, currentTab.url)) setTimeout(() => finish(), 100);
                await ready;
                const loadDuration = Date.now() - startTime;

                // Optionally wait for a specific selector to appear in the DOM
                let selectorResult = null;
                if (waitForSelector) {
                    const remainingTime = Math.max(timeoutMs - loadDuration, 1000);

                    const [result] = await chrome.scripting.executeScript({
                        target: {tabId},
                        func: (sel: string, ms: number) => {
                            return new Promise<any>((resolve) => {
                                const existing = document.querySelector(sel);
                                if (existing) {
                                    resolve({found: true, waited: 0});
                                    return;
                                }

                                const start = Date.now();
                                const observer = new MutationObserver(() => {
                                    if (document.querySelector(sel)) {
                                        observer.disconnect();
                                        resolve({found: true, waited: Date.now() - start});
                                    }
                                });

                                observer.observe(document.body, {
                                    childList: true,
                                    subtree: true,
                                    attributes: true,
                                });

                                setTimeout(() => {
                                    observer.disconnect();
                                    resolve({found: false, waited: ms});
                                }, ms);
                            });
                        },
                        args: [waitForSelector, remainingTime],
                    });

                    selectorResult = result.result;
                }

                // Grab final page state
                const finalTab = await chrome.tabs.get(tabId);
                const redirected = finalTab.url !== resolvedUrl;
                // To act next, the model needs the page's controls; a text read brings its own page instead.
                const listed = readText ? undefined : await browserCall('guidance', {tabId, action: 'controls', limit: 25}).catch(() => undefined);

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
                const beforeTab = await chrome.tabs.get(tabId);

                await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (dir: string) => {
                        if (dir === "back") history.back();
                        else history.forward();
                    },
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
                        if (updatedTabId !== tabId) return;
                        if (changeInfo.status === "complete") {
                            clearTimeout(timer);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };

                    chrome.tabs.onUpdated.addListener(listener);

                    setTimeout(async () => {
                        const current = await chrome.tabs.get(tabId);
                        if (current.url === beforeTab.url && current.status === "complete") {
                            clearTimeout(timer);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    }, 500);
                });

                const afterTab = await chrome.tabs.get(tabId);
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
                const timeoutMs = timeout ?? 15000;
                const startTime = Date.now();

                await chrome.tabs.reload(tabId, {bypassCache: bypassCache ?? false});

                // Wait for load complete
                await new Promise<void>((resolve, reject) => {
                    const timer = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        reject(new Error(`Reload timed out after ${timeoutMs}ms`));
                    }, timeoutMs);

                    const listener = (
                        updatedTabId: number,
                        changeInfo: { status?: string }
                    ) => {
                        if (updatedTabId !== tabId) return;
                        if (changeInfo.status === "complete") {
                            clearTimeout(timer);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve();
                        }
                    };

                    chrome.tabs.onUpdated.addListener(listener);
                });

                const tab = await chrome.tabs.get(tabId);
                return {
                    success: true,
                    url: tab.url,
                    title: tab.title,
                    bypassCache: bypassCache ?? false,
                    timeMs: Date.now() - startTime,
                };
            },
        }),

        // ═══════════════════════════════════════════════
        //  INTERACTION
        // ═══════════════════════════════════════════════

        clickElement: tool({
            description:
                "Click an element by ref (from listControls or a changes report) or selector. Reports navigation and what the click changed (new controls with refs, dialogs, messages).",
            inputSchema: z.object({
                ref: z.string().optional().describe('Control ref such as "c12". Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector for the element to click, e.g. "button.submit", "#login-btn", ' +
                        '"a[href=\\"/about\\"]".'
                    ),
                index: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "If multiple elements match the selector, click the one at this 0-based index (default: 0)."
                    ),
                waitAfter: z
                    .number()
                    .optional()
                    .default(500)
                    .describe(
                        "Most milliseconds to wait for the click's effects (default 500). Returns sooner once the page has changed and gone quiet."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, index: givenIndex, waitAfter, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                // A ref's selector matches exactly one element.
                const selector = target.selector, index = ref ? 0 : givenIndex;
                await cue(selector, index, 'click');
                const beforeTab = await chrome.tabs.get(tabId);

                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (sel: string, idx: number, wait: number, quietMs: number, format: string) => {
                        return new Promise<any>((resolve) => {
                            const els = document.querySelectorAll(sel);
                            if (els.length === 0) {
                                const suggestions: string[] = [];
                                const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
                                if (classMatch) {
                                    const similar = document.querySelectorAll('[class*="' + classMatch[1] + '"]');
                                    if (similar.length > 0) suggestions.push("Similar classes: " + Array.from(similar).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + Array.from(e.classList).join(".")).join(", "));
                                }
                                const tagMatch = sel.match(/^([a-z]+)/i);
                                if (tagMatch) {
                                    const count = document.querySelectorAll(tagMatch[1]).length;
                                    if (count > 0) suggestions.push(count + " <" + tagMatch[1] + "> elements exist on the page");
                                }
                                resolve({
                                    error: `No elements found for selector: ${sel}`, ...(suggestions.length > 0 && {suggestions}),
                                    hint: "Call getPageStructure to inspect the DOM and find valid selectors."
                                });
                                return;
                            }
                            if (idx >= els.length) {
                                resolve({
                                    error: `Index ${idx} out of range — only ${els.length} element(s) matched "${sel}"`,
                                });
                                return;
                            }

                            const el = els[idx] as HTMLElement;
                            // el.click() needs no on-screen point; scroll only so the user sees what was clicked.
                            const box = el.getBoundingClientRect();
                            if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) el.scrollIntoView({behavior: "instant", block: "center"});
                            try {(window as any).__tamperSlothGuidance?.cue(el,'click');} catch { /* Decoration is optional. */ }

                            // Wait for the click's effects: until the page has changed and gone quiet, or `wait` at most.
                            let last = 0;
                            const observer = new MutationObserver(() => { last = performance.now(); });
                            observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
                            el.click();
                            const start = performance.now();
                            const check = () => {
                                const now = performance.now();
                                if (!(last && now - last >= quietMs && now - start >= 50) && now - start < wait) { setTimeout(check, 25); return; }
                                observer.disconnect();
                                if (format === "concise") {
                                    resolve({clicked: true});
                                } else {
                                    resolve({
                                        clicked: true,
                                        tag: el.tagName.toLowerCase(),
                                        id: el.id || undefined,
                                        classes: Array.from(el.classList),
                                        text: el.textContent?.trim().slice(0, 200),
                                        href: (el as HTMLAnchorElement).href || undefined,
                                        matchCount: els.length,
                                        indexClicked: idx,
                                        settledMs: Math.round(now - start),
                                    });
                                }
                            };
                            check();
                        });
                    },
                    args: [selector, index ?? 0, waitAfter ?? 500, SETTLE_QUIET_MS, responseFormat ?? "concise"],
                });

                const afterTab = await chrome.tabs.get(tabId);
                const navigated = afterTab.url !== beforeTab.url;
                const clicked = (result?.result as {clicked?: boolean} | undefined)?.clicked;

                return {
                    ...await withSelectorHelp(tabId, selector, result?.result),
                    navigated,
                    ...(navigated && {
                        newUrl: afterTab.url,
                        newTitle: afterTab.title,
                    }),
                    ...(clicked ? await changesSince() : {}),
                };
            },
        }),

        typeText: tool({
            description:
                "Type into an input or editable element by ref or selector; optionally clear or press Enter. For several fields use fillForm. After Enter, or in a field that suggests (combobox, search), reports what changed.",
            inputSchema: z.object({
                ref: z.string().optional().describe('Control ref such as "c12". Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector for the input element, e.g. "input[name=\\"email\\"]", "#search-box", ' +
                        '"textarea.comment".'
                    ),
                text: z
                    .string()
                    .describe("The text to type into the element."),
                clearFirst: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe(
                        "If true (default), clear the field before typing. Set false to append to existing content."
                    ),
                pressEnter: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                        "If true, simulate pressing Enter after typing the text. Useful for search fields."
                    ),
                index: z
                    .number()
                    .optional()
                    .default(0)
                    .describe(
                        "If multiple elements match, type into the one at this 0-based index (default: 0)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, text, clearFirst, pressEnter, index: givenIndex, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                const selector = target.selector, index = ref ? 0 : givenIndex;
                await cue(selector, index, 'type');
                const submission = pressEnter ? watchSubmission() : undefined;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (
                        sel: string,
                        value: string,
                        clear: boolean,
                        enter: boolean,
                        idx: number,
                        format: string
                    ) => {
                        const els = document.querySelectorAll(sel);
                        if (els.length === 0) {
                            const suggestions: string[] = [];
                            const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
                            if (classMatch) {
                                const similar = document.querySelectorAll('[class*="' + classMatch[1] + '"]');
                                if (similar.length > 0) suggestions.push("Similar classes: " + Array.from(similar).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + Array.from(e.classList).join(".")).join(", "));
                            }
                            const tagMatch = sel.match(/^([a-z]+)/i);
                            if (tagMatch) {
                                const count = document.querySelectorAll(tagMatch[1]).length;
                                if (count > 0) suggestions.push(count + " <" + tagMatch[1] + "> elements exist on the page");
                            }
                            return {
                                error: `No elements found for selector: ${sel}`, ...(suggestions.length > 0 && {suggestions}),
                                hint: "Call getPageStructure to inspect the DOM and find valid selectors."
                            };
                        }
                        if (idx >= els.length) {
                            return {
                                error: `Index ${idx} out of range — only ${els.length} element(s) matched "${sel}"`,
                            };
                        }

                        const el = els[idx] as HTMLElement;
                        const box = el.getBoundingClientRect();
                        if (box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) el.scrollIntoView({behavior: "instant", block: "center"});
                        el.focus();
                        // Fields that offer suggestions as you type, worth waiting for after typing.
                        const suggests = el.getAttribute("role") === "combobox" || el.hasAttribute("aria-autocomplete") || el.hasAttribute("list")
                            || (el as HTMLInputElement).type === "search";

                        try {(window as any).__tamperSlothGuidance?.cue(el,'type');} catch { /* Decoration is optional. */ }

                        const isInput =
                            el instanceof HTMLInputElement ||
                            el instanceof HTMLTextAreaElement;
                        const isContentEditable = el.isContentEditable;

                        if (!isInput && !isContentEditable) {
                            return {
                                error: `Element <${el.tagName.toLowerCase()}> is not an input, textarea, or contenteditable`,
                            };
                        }

                        if (isInput) {
                            const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
                            if (clear) inputEl.value = "";
                            inputEl.value += value;

                            // Trigger framework-compatible events
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                el instanceof HTMLTextAreaElement
                                    ? HTMLTextAreaElement.prototype
                                    : HTMLInputElement.prototype,
                                "value"
                            )?.set;
                            nativeInputValueSetter?.call(el, inputEl.value);

                            el.dispatchEvent(new Event("input", {bubbles: true}));
                            el.dispatchEvent(new Event("change", {bubbles: true}));
                        } else {
                            // contenteditable
                            if (clear) el.textContent = "";
                            el.textContent += value;
                            el.dispatchEvent(new Event("input", {bubbles: true}));
                        }

                        if (enter) {
                            el.dispatchEvent(
                                new KeyboardEvent("keydown", {
                                    key: "Enter",
                                    code: "Enter",
                                    keyCode: 13,
                                    bubbles: true,
                                })
                            );
                            el.dispatchEvent(
                                new KeyboardEvent("keypress", {
                                    key: "Enter",
                                    code: "Enter",
                                    keyCode: 13,
                                    bubbles: true,
                                })
                            );
                            el.dispatchEvent(
                                new KeyboardEvent("keyup", {
                                    key: "Enter",
                                    code: "Enter",
                                    keyCode: 13,
                                    bubbles: true,
                                })
                            );

                            // Also try submitting the parent form
                            const form = el.closest("form");
                            if (form) {
                                form.dispatchEvent(
                                    new SubmitEvent("submit", {
                                        bubbles: true,
                                        cancelable: true,
                                    })
                                );
                            }
                        }

                        if (format === "concise") {
                            return {typed: true, pressedEnter: enter, ...(suggests ? {suggests} : {})};
                        }
                        return {
                            typed: true,
                            tag: el.tagName.toLowerCase(),
                            id: el.id || undefined,
                            name: (el as HTMLInputElement).name || undefined,
                            finalValue: isInput
                                ? (el as HTMLInputElement).value.slice(0, 500)
                                : el.textContent?.slice(0, 500),
                            pressedEnter: enter,
                            ...(suggests ? {suggests} : {}),
                        };
                    },
                    args: [
                        selector,
                        text,
                        clearFirst ?? true,
                        pressEnter ?? false,
                        index ?? 0,
                        responseFormat ?? "concise",
                    ],
                });
                const typed = result?.result as {typed?: boolean; suggests?: boolean} | undefined;
                if (!typed?.typed) {
                    await submission?.(0);
                    return withSelectorHelp(tabId, selector, result?.result);
                }
                // Enter may submit or search; a suggesting field opens a list. Either way the next step depends on it.
                if (submission) {
                    const navigated = await submission(3000);
                    return {...typed, ...(navigated ? {navigated} : {}), ...await changesSince()};
                }
                if (typed.suggests) {
                    await globalThis.chrome.scripting.executeScript({target: {tabId}, func: pageQuiet, args: [SETTLE_QUIET_MS, 800, true]}).catch(() => {});
                    return {...typed, ...await changesSince()};
                }
                return typed;
            },
        }),

        selectOption: tool({
            description:
                "Select a native dropdown option by value, label or index. Name the <select> by ref or selector. Reports what the choice changed.",
            inputSchema: z.object({
                ref: z.string().optional().describe('Control ref such as "c12". Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe('CSS selector for the <select> element, e.g. "#country", "select[name=\\"size\\"]".'),
                value: z
                    .string()
                    .optional()
                    .describe(
                        'The option value attribute to select. E.g. "us", "large".'
                    ),
                label: z
                    .string()
                    .optional()
                    .describe(
                        'The visible text of the option to select. E.g. "United States", "Large".'
                    ),
                index: z
                    .number()
                    .optional()
                    .describe(
                        "The 0-based index of the option to select."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, value, label, index, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                const selector = target.selector;
                await cue(selector, 0, 'click');
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (
                        sel: string,
                        val: string | null,
                        lbl: string | null,
                        idx: number | null,
                        format: string
                    ) => {
                        const selectEl = document.querySelector(sel) as HTMLSelectElement;
                        if (!selectEl) {
                            const selectCount = document.querySelectorAll("select").length;
                            return {error: `No element found for selector: ${sel}`, ...(selectCount > 0 && {hint: selectCount + " <select> elements exist. Call getPageStructure to find the right selector."})};
                        }
                        if (selectEl.tagName.toLowerCase() !== "select") {
                            return {error: `Element is <${selectEl.tagName.toLowerCase()}>, not a <select>`};
                        }

                        const options = Array.from(selectEl.options);
                        try {(window as any).__tamperSlothGuidance?.cue(selectEl,'click');} catch { /* Decoration is optional. */ }

                        let targetOption: HTMLOptionElement | undefined;

                        if (val !== null) {
                            targetOption = options.find((o) => o.value === val);
                            if (!targetOption) {
                                return {
                                    error: `No option with value "${val}"`,
                                    availableValues: options.map((o) => ({
                                        value: o.value,
                                        label: o.textContent?.trim(),
                                    })),
                                };
                            }
                        } else if (lbl !== null) {
                            const lowerLabel = lbl.toLowerCase();
                            targetOption = options.find(
                                (o) => o.textContent?.trim().toLowerCase() === lowerLabel
                            );
                            if (!targetOption) {
                                return {
                                    error: `No option with label "${lbl}"`,
                                    availableLabels: options.map((o) => o.textContent?.trim()),
                                };
                            }
                        } else if (idx !== null) {
                            if (idx < 0 || idx >= options.length) {
                                return {
                                    error: `Index ${idx} out of range — ${options.length} options available`,
                                };
                            }
                            targetOption = options[idx];
                        } else {
                            return {error: "Provide at least one of: value, label, or index"};
                        }

                        selectEl.value = targetOption!.value;
                        selectEl.dispatchEvent(new Event("input", {bubbles: true}));
                        selectEl.dispatchEvent(new Event("change", {bubbles: true}));

                        if (format === "concise") {
                            return {selected: true, value: targetOption!.value};
                        }
                        return {
                            selected: true,
                            value: targetOption!.value,
                            label: targetOption!.textContent?.trim(),
                            optionIndex: targetOption!.index,
                            totalOptions: options.length,
                        };
                    },
                    args: [selector, value ?? null, label ?? null, index ?? null, responseFormat ?? "concise"],
                });
                const selected = result?.result as {selected?: boolean} | undefined;
                // A choice often reveals or changes other fields.
                return selected?.selected ? {...selected, ...await changesSince()} : result?.result;
            },
        }),

        scrollPage: tool({
            description:
                "Scroll by direction/amount or to an element.",
            inputSchema: z.object({
                direction: z
                    .enum(["up", "down", "left", "right", "top", "bottom"])
                    .optional()
                    .default("down")
                    .describe('Scroll direction or position. "top"/"bottom" scroll to the very top/bottom.'),
                amount: z
                    .number()
                    .optional()
                    .describe(
                        'Pixels to scroll (for up/down/left/right). Default: one viewport height. ' +
                        "Ignored for top/bottom."
                    ),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        "CSS selector — if provided, either scroll this container (if it's scrollable) " +
                        "or scroll the page until this element is visible."
                    ),
                behavior: z
                    .enum(["smooth", "instant"])
                    .optional()
                    .default("smooth")
                    .describe('Scroll behavior: "smooth" (animated) or "instant".'),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({direction, amount, selector, behavior, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                await browserCall('guidance',{tabId,action:'cue',selector,cue:'scroll'}).catch(()=>{});
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (
                        dir: string,
                        px: number | null,
                        sel: string | null,
                        scrollBehavior: ScrollBehavior,
                        format: string
                    ) => {
                        const concise = format === "concise";

                        if (sel) {
                            const el = document.querySelector(sel);
                            if (!el) return {
                                error: `No element found for selector: ${sel}`,
                                hint: "Call getPageStructure to inspect the DOM and find valid selectors."
                            };

                            el.scrollIntoView({
                                behavior: scrollBehavior,
                                block: "center",
                            });

                            const rect = el.getBoundingClientRect();
                            const base = {
                                scrolledTo: sel,
                                elementVisible: rect.top >= 0 && rect.bottom <= window.innerHeight,
                            };
                            if (concise) return base;
                            return {...base, scrollY: window.scrollY, scrollX: window.scrollX};
                        }

                        const scrollAmount = px ?? window.innerHeight * 0.85;
                        const beforeY = window.scrollY;
                        const beforeX = window.scrollX;

                        switch (dir) {
                            case "down":
                                window.scrollBy({top: scrollAmount, behavior: scrollBehavior});
                                break;
                            case "up":
                                window.scrollBy({top: -scrollAmount, behavior: scrollBehavior});
                                break;
                            case "right":
                                window.scrollBy({left: scrollAmount, behavior: scrollBehavior});
                                break;
                            case "left":
                                window.scrollBy({left: -scrollAmount, behavior: scrollBehavior});
                                break;
                            case "top":
                                window.scrollTo({top: 0, behavior: scrollBehavior});
                                break;
                            case "bottom":
                                window.scrollTo({
                                    top: document.documentElement.scrollHeight,
                                    behavior: scrollBehavior,
                                });
                                break;
                        }

                        const atTop = window.scrollY === 0;
                        const atBottom = window.scrollY + window.innerHeight >=
                            document.documentElement.scrollHeight - 5;

                        if (concise) {
                            return {
                                direction: dir,
                                scrollable: document.documentElement.scrollHeight > window.innerHeight,
                                reachedEnd: (dir === "down" || dir === "bottom") ? atBottom
                                    : (dir === "up" || dir === "top") ? atTop : false,
                                atTop,
                                atBottom,
                            };
                        }
                        return {
                            direction: dir,
                            scrolledPixels: dir === "top" || dir === "bottom" ? null : scrollAmount,
                            beforeY,
                            beforeX,
                            afterY: window.scrollY,
                            afterX: window.scrollX,
                            pageHeight: document.documentElement.scrollHeight,
                            viewportHeight: window.innerHeight,
                            scrollable: document.documentElement.scrollHeight > window.innerHeight,
                            atTop,
                            atBottom,
                        };
                    },
                    args: [
                        direction ?? "down",
                        amount ?? null,
                        selector ?? null,
                        (behavior ?? "smooth") as ScrollBehavior,
                        responseFormat ?? "concise",
                    ],
                });
                return withSelectorHelp(tabId, selector, result.result);
            },
        }),

        submitForm: tool({
            description:
                "Submit a form, then wait for the navigation it starts or, when the page handles it in place, for the page to settle. Reports what changed (messages, invalid fields, new controls). Obtain confirmation for consequential submissions.",
            inputSchema: z.object({
                ref: z.string().optional().describe('Ref of the form or of a control inside it. Use instead of selector.'),
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector for the <form> element, e.g. "#login-form", "form[action=\\"/search\\"]". ' +
                        "If the selector points to an element inside a form, the closest parent form is submitted."
                    ),
                timeout: z
                    .number()
                    .optional()
                    .default(5000)
                    .describe(
                        "Maximum time in ms to wait for a navigation the submission starts (default: 5000)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({ref, selector: given, timeout, responseFormat}) => {
                const target = await targetOf({ref, selector: given});
                if (!("selector" in target)) return target;
                const selector = target.selector;
                await cue(selector, 0, 'click');
                const timeoutMs = timeout ?? 5000;
                const beforeTab = await chrome.tabs.get(tabId);
                const submission = watchSubmission();

                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (sel: string, format: string) => {
                        let el = document.querySelector(sel);
                        if (!el) {
                            const formCount = document.querySelectorAll("form").length;
                            return {error: `No element found for selector: ${sel}`, ...(formCount > 0 && {hint: formCount + " <form> elements exist. Call getPageStructure to find the right selector."})};
                        }

                        const form =
                            el.tagName.toLowerCase() === "form"
                                ? (el as HTMLFormElement)
                                : el.closest("form");

                        if (!form) {
                            return {
                                error: `No <form> found at or above selector: ${sel}`,
                            };
                        }

                        const formInfo = format === "concise" ? undefined : {
                            action: form.action,
                            method: form.method,
                            id: form.id || undefined,
                            fieldCount: form.elements.length,
                        };

                        try {
                            try {(window as any).__tamperSlothGuidance?.cue(form,'click');} catch { /* Decoration is optional. */ }
                            form.requestSubmit();
                        } catch {
                            form.submit();
                        }

                        return {submitted: true, ...(formInfo && {form: formInfo})};
                    },
                    args: [selector, responseFormat ?? "concise"],
                }).catch(async error => { await submission(0); throw error; });
                const submitted = (result?.result as {submitted?: boolean} | undefined)?.submitted;
                const navigated = await submission(submitted ? timeoutMs : 0);

                const afterTab = await chrome.tabs.get(tabId);

                return {
                    ...result?.result,
                    navigated,
                    ...(navigated && afterTab.url !== beforeTab.url && {
                        newUrl: afterTab.url,
                        newTitle: afterTab.title,
                    }),
                    ...(submitted ? await changesSince() : {}),
                };
            },
        }),

        fillForm: tool({
            description:
                "Fill several form fields in one call, in order: text inputs, textareas, contenteditable, selects (by option value or visible label) " +
                "and checkboxes/radios (value \"true\" or \"false\"). Name each field by ref (from listControls or a changes report) or selector. " +
                "Stops at the first field it cannot fill. submit then clicks a control (e.g. the Save button) or, with true, submits the last field's form, " +
                "and waits like submitForm. Reports what changed. Obtain confirmation for consequential submissions.",
            inputSchema: z.object({
                fields: z.array(z.object({
                    ref: z.string().optional(),
                    selector: z.string().optional(),
                    index: z.number().int().min(0).optional(),
                    value: z.string(),
                })).min(1).max(30),
                submit: z.union([z.boolean(), z.object({ref: z.string().optional(), selector: z.string().optional()})]).optional()
                    .describe('A control to click after filling, or true to submit the form of the last field.'),
                timeout: z.number().int().min(500).max(15000).default(5000)
                    .describe('Maximum time in ms to wait for a navigation the submission starts.'),
            }),
            execute: async ({fields, submit, timeout}) => {
                const resolved: {selector: string; index: number; value: string}[] = [];
                for (const [i, field] of fields.entries()) {
                    const target = await targetOf(field);
                    if (!("selector" in target)) return {...target, failedField: i, filled: 0};
                    resolved.push({selector: target.selector, index: field.ref ? 0 : field.index ?? 0, value: field.value});
                }
                const submitTarget = submit && typeof submit === "object" ? await targetOf(submit) : undefined;
                if (submitTarget && !("selector" in submitTarget)) return {...submitTarget, failedField: "submit", filled: 0};
                await cue(resolved[0].selector, resolved[0].index, 'type');
                const submission = submit ? watchSubmission() : undefined;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (list: {selector: string; index: number; value: string}[], submitSelector: string | null, submitForm: boolean) => {
                        const fail = (i: number, error: string, extra = {}) => ({filled: i, failedField: i, error, ...extra});
                        let last: Element | undefined;
                        for (const [i, field] of list.entries()) {
                            const el = document.querySelectorAll(field.selector)[field.index] as HTMLElement | undefined;
                            if (!el) return fail(i, `No element for field ${i + 1}: ${field.selector}`);
                            if ((el as HTMLInputElement).disabled || (el as HTMLInputElement).readOnly) return fail(i, `Field ${i + 1} is disabled or read-only`);
                            try {(window as any).__tamperSlothGuidance?.cue(el, 'type');} catch { /* Decoration is optional. */ }
                            if (el instanceof HTMLSelectElement) {
                                const wanted = field.value.trim().toLowerCase();
                                const options = Array.from(el.options);
                                const option = options.find(o => o.value === field.value) ?? options.find(o => (o.textContent ?? "").trim().toLowerCase() === wanted);
                                if (!option) return fail(i, `No option "${field.value}" in field ${i + 1}`, {options: options.slice(0, 30).map(o => (o.textContent ?? "").trim())});
                                el.value = option.value;
                            } else if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
                                const on = !/^(false|off|no|0|unchecked)$/i.test(field.value.trim());
                                // A click flips it the way a person would, with the events frameworks listen for.
                                if (el.checked !== on) el.click();
                                last = el;
                                continue;
                            } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                                el.focus();
                                const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")?.set;
                                if (setter) setter.call(el, field.value); else el.value = field.value;
                            } else if (el.isContentEditable) {
                                el.focus();
                                el.textContent = field.value;
                            } else return fail(i, `Field ${i + 1} (<${el.tagName.toLowerCase()}>) is not a form field`);
                            el.dispatchEvent(new Event("input", {bubbles: true}));
                            el.dispatchEvent(new Event("change", {bubbles: true}));
                            last = el;
                        }
                        if (submitSelector) {
                            const control = document.querySelector(submitSelector) as HTMLElement | null;
                            if (!control) return {filled: list.length, error: `No submit control found for ${submitSelector}`};
                            control.click();
                            return {filled: list.length, submitted: true};
                        }
                        if (submitForm) {
                            const form = last?.closest("form");
                            if (!form) return {filled: list.length, error: "The last field is not inside a form; pass the submit control instead"};
                            try { form.requestSubmit(); } catch { form.submit(); }
                            return {filled: list.length, submitted: true};
                        }
                        return {filled: list.length};
                    },
                    args: [resolved, submitTarget && "selector" in submitTarget ? submitTarget.selector : null, submit === true],
                }).catch(async error => { await submission?.(0); throw error; });
                const output = (result?.result ?? {error: "The page did not report a result"}) as {filled?: number; submitted?: boolean; error?: string};
                const navigated = submission ? await submission(output.submitted ? timeout : 0) : false;
                return {...output, ...(navigated ? {navigated} : {}), ...(output.filled ? await changesSince() : {})};
            },
        }),

        // ═══════════════════════════════════════════════
        //  DOM EVENTS
        // ═══════════════════════════════════════════════

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
                    target: {tabId},
                    func: (sel: string, ms: number) => {
                        return new Promise<any>((resolve) => {
                            const describe = (el: Element) => {
                                const rect = el.getBoundingClientRect();
                                return {
                                    found: true,
                                    tag: el.tagName.toLowerCase(),
                                    id: el.id || undefined,
                                    classes: Array.from(el.classList),
                                    text: el.textContent?.trim().slice(0, 300),
                                    visible: rect.width > 0 && rect.height > 0,
                                    belowFold: rect.top > window.innerHeight,
                                    position: {
                                        top: Math.round(rect.top),
                                        left: Math.round(rect.left),
                                        width: Math.round(rect.width),
                                        height: Math.round(rect.height),
                                    },
                                    attributes: Object.fromEntries(
                                        Array.from(el.attributes)
                                            .filter((a) => !["class", "id"].includes(a.name))
                                            .slice(0, 20)
                                            .map((a) => [a.name, a.value.slice(0, 100)])
                                    ),
                                };
                            };

                            const existing = document.querySelector(sel);
                            if (existing) {
                                resolve(describe(existing));
                                return;
                            }

                            const observer = new MutationObserver(() => {
                                const el = document.querySelector(sel);
                                if (el) {
                                    observer.disconnect();
                                    resolve(describe(el));
                                }
                            });

                            observer.observe(document.body, {
                                childList: true,
                                subtree: true,
                                attributes: true,
                            });

                            setTimeout(() => {
                                observer.disconnect();
                                resolve({
                                    found: false,
                                    timedOutMs: ms,
                                    selector: sel,
                                    hint: "Element did not appear within timeout. Call getPageStructure to verify the selector is correct."
                                });
                            }, ms);
                        });
                    },
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
                            target: {tabId, allFrames: true},
                            func: (sel: string | null) => {
                                const root = sel ? document.querySelector(sel) : document.body;
                                const text = (root as HTMLElement | null)?.innerText ?? '';
                                let hash = 5381;
                                for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
                                return `${text.length}:${hash}`;
                            },
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
                    const tab = await chrome.tabs.update(tabId, {active: true});
                    if (tab) await chrome.windows.update(tab.windowId, {focused: true});
                    // Point at the field to fill, even when the selector names the whole form or misses.
                    const [found] = await chrome.scripting.executeScript({
                        target: {tabId},
                        func: (sel: string, mark: string) => {
                            const fields = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), textarea, select';
                            const visible = (el: Element) => {
                                const box = el.getBoundingClientRect(), style = getComputedStyle(el);
                                return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
                            };
                            const pick = (root: ParentNode) => {
                                const all = [...root.querySelectorAll(fields)].filter(visible) as HTMLInputElement[];
                                return all.find(el => !el.value) ?? all[0];
                            };
                            let root: Element | null = null;
                            try { root = document.querySelector(sel); } catch { /* an invalid selector falls back to the page */ }
                            const target = root && root.matches(fields) && visible(root) ? root
                                : (root && pick(root)) ?? pick(document) ?? (root && visible(root) ? root : null);
                            document.querySelectorAll('[data-tampersloth-tip]').forEach(el => el.removeAttribute('data-tampersloth-tip'));
                            if (!target) return false;
                            target.setAttribute('data-tampersloth-tip', mark);
                            target.scrollIntoView({block: 'nearest', inline: 'nearest'});
                            return true;
                        },
                        args: [tip.selector, tipId],
                    });
                    if (!found?.result) return;
                    if (tipShown) await browserCall('guidance', {tabId, action: 'remove', id: tipId}).catch(() => {});
                    await browserCall('guidance', {tabId, action: 'draw', id: tipId, kind: 'highlight', lineStyle: 'dashed',
                        selector: `[data-tampersloth-tip="${tipId}"]`, label: tip.text});
                    tipShown = true;
                };
                // The panel card says Sloth is waiting on the user.
                const endCard = tip ? startUserWait(context.conversationId, {
                    id: tipId, text: tip.text, tabId,
                    host: await chrome.tabs.get(tabId).then(t => t.url ? new URL(t.url).hostname : undefined, () => undefined),
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
                            const tab = await chrome.tabs.get(tabId);
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
                    if (tipShown) void browserCall('guidance', {tabId, action: 'remove', id: tipId}).catch(() => {});
                }
            },
        }),

        showTab: tool({
            description:
                "Bring the user to the tab you are working in: activates it and focuses its window. Call it before asking the user to do something there " +
                "(log in, solve a CAPTCHA, approve a prompt, check a result), so they see where their attention is needed. Does not change the target tab.",
            inputSchema: z.object({}),
            execute: async () => {
                const tab = await chrome.tabs.update(tabId, {active: true});
                if (!tab) throw new Error('Tab no longer exists');
                await chrome.windows.update(tab.windowId, {focused: true});
                return {shown: true, tabId: tab.id, url: tab.url, title: tab.title};
            },
        }),

        // ═══════════════════════════════════════════════
        //  DEBUGGING (network, console)
        // ═══════════════════════════════════════════════

        getDebugInfo: tool({
            description:
                "Observe console output and/or network activity. Console capture lasts 5s: reproduce during capture. Network hooks install on first call; filter with urlFilter.",
            inputSchema: z.object({
                sources: z
                    .array(z.enum(["console", "network"]))
                    .describe(
                        'Which debug sources to capture. E.g. ["console"], ["network"], or ["console", "network"] for both.'
                    ),
                clear: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe(
                        "Clear the network buffer after reading (default: true). Set false to accumulate. Only applies to network source."
                    ),
                urlFilter: z
                    .string()
                    .optional()
                    .describe(
                        'Only return network requests whose URL contains this substring (e.g. "/api/", "graphql"). Only applies to network source.'
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({sources, clear, urlFilter, responseFormat}) => {
                const result: any = {};
                const concise = responseFormat === "concise";

                if (sources.includes("console")) {
                    const response = await chrome.runtime.sendMessage({
                        type: "GET_CONSOLE",
                        tabId,
                        duration: 5000,
                    });
                    if (response?.error) throw new Error(response.error);
                    const logs = response.logs as Array<{
                        type: string;
                        args: any[];
                        timestamp: number;
                    }>;
                    if (concise) {
                        const errorCount = logs.filter((l) => l.type === "error" || l.type === "uncaught-error" || l.type === "unhandled-rejection").length;
                        const warnCount = logs.filter((l) => l.type === "warn").length;
                        const firstError = logs.find((l) => l.type === "error" || l.type === "uncaught-error");
                        result.console = {
                            count: logs.length,
                            errorCount,
                            warningCount: warnCount,
                            ...(firstError && {firstError: {type: firstError.type, args: firstError.args}}),
                        };
                    } else {
                        // Was unbounded — a chatty page could return thousands of
                        // entries. Errors and warnings are what debugging needs, so
                        // they survive truncation; the rest fills the remainder with
                        // the most recent entries.
                        const isSevere = (l: { type: string }) =>
                            l.type === "error" ||
                            l.type === "uncaught-error" ||
                            l.type === "unhandled-rejection" ||
                            l.type === "warn";
                        const severe = logs.filter(isSevere).slice(0, MAX_CONSOLE_LOGS);
                        const remaining = MAX_CONSOLE_LOGS - severe.length;
                        const filler = remaining > 0 ? logs
                            .filter((l) => !isSevere(l))
                            .slice(-remaining) : [];
                        const kept = [...severe, ...filler];

                        result.console = {
                            logs: kept,
                            count: logs.length,
                            ...(kept.length < logs.length && {
                                truncated: true,
                                omitted: logs.length - kept.length,
                                hint:
                                    `Showing ${kept.length} of ${logs.length} entries, errors and ` +
                                    "warnings first. Re-run after reproducing a narrower case if you " +
                                    "need the rest.",
                            }),
                        };
                    }
                }

                if (sources.includes("network")) {
                    const [netResult] = await chrome.scripting.executeScript({
                        target: {tabId},
                        world: "MAIN",
                        func: (shouldClear: boolean, filter: string | null) => {
                            // 200 x 2000 chars of bodies was ~100k tokens per call,
                            // re-sent on every later step.
                            const MAX_ENTRIES = 50;
                            const MAX_BODY = 600;
                            const w = window as any;

                            // ── Install interceptors on first call ──
                            if (!w.__netCapture) {
                                w.__netCapture = {requests: []};
                                const buf = w.__netCapture.requests;

                                // — Fetch interceptor —
                                const origFetch = w.fetch;
                                w.fetch = async function (...args: any[]) {
                                    const req =
                                        args[0] instanceof Request
                                            ? args[0]
                                            : new Request(args[0], args[1]);
                                    const entry: any = {
                                        source: "fetch",
                                        method: req.method,
                                        url: req.url,
                                        timestamp: Date.now(),
                                    };
                                    try {
                                        const requestBody = args[1]?.body;
                                        if (typeof requestBody === "string") {
                                            entry.requestBody = requestBody.slice(0, MAX_BODY);
                                        }
                                    } catch {
                                    }

                                    try {
                                        const response: Response = await origFetch.apply(w, args);
                                        entry.status = response.status;
                                        entry.statusText = response.statusText;
                                        // Full response headers on every request cost far
                                        // more than they answer; content-type is the one
                                        // that actually gets read.
                                        const contentType = response.headers.get("content-type");
                                        if (contentType) entry.contentType = contentType;

                                        const clone = response.clone();
                                        try {
                                            const text = await clone.text();
                                            entry.responseBody = text.slice(0, MAX_BODY);
                                            if (text.length > MAX_BODY)
                                                entry.responseBodyTruncated = true;
                                        } catch {
                                        }

                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        return response;
                                    } catch (err: any) {
                                        entry.error = err?.message ?? String(err);
                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        throw err;
                                    }
                                };

                                // — XHR interceptor —
                                const OrigXHR = w.XMLHttpRequest;
                                w.XMLHttpRequest = function () {
                                    const xhr = new OrigXHR();
                                    const entry: any = {source: "xhr", timestamp: Date.now()};

                                    const origOpen = xhr.open;
                                    xhr.open = function (
                                        method: string,
                                        url: string,
                                        ...rest: any[]
                                    ) {
                                        entry.method = method;
                                        entry.url = url;
                                        return origOpen.call(xhr, method, url, ...rest);
                                    };

                                    const origSend = xhr.send;
                                    xhr.send = function (body?: any) {
                                        if (typeof body === "string") {
                                            entry.requestBody = body.slice(0, MAX_BODY);
                                        }

                                        xhr.addEventListener("load", () => {
                                            entry.status = xhr.status;
                                            entry.statusText = xhr.statusText;
                                            try {
                                                const text =
                                                    typeof xhr.responseText === "string"
                                                        ? xhr.responseText
                                                        : "";
                                                entry.responseBody = text.slice(0, MAX_BODY);
                                                if (text.length > MAX_BODY)
                                                    entry.responseBodyTruncated = true;
                                            } catch {
                                            }
                                            if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        });

                                        xhr.addEventListener("error", () => {
                                            entry.error = "Network error";
                                            if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        });

                                        return origSend.call(xhr, body);
                                    };

                                    return xhr;
                                } as any;
                                w.XMLHttpRequest.prototype = OrigXHR.prototype;

                                // — WebSocket interceptor —
                                const OrigWS = w.WebSocket;
                                w.WebSocket = function (...args: any[]) {
                                    const ws = new OrigWS(...args);
                                    const connEntry: any = {
                                        source: "websocket",
                                        method: "CONNECT",
                                        url: args[0],
                                        timestamp: Date.now(),
                                    };
                                    if (buf.length < MAX_ENTRIES) buf.push(connEntry);

                                    ws.addEventListener("message", (e: any) => {
                                        const data =
                                            typeof e.data === "string"
                                                ? e.data.slice(0, MAX_BODY)
                                                : `[${e.data?.constructor?.name ?? "binary"}]`;
                                        const entry: any = {
                                            source: "websocket",
                                            method: "RECEIVE",
                                            url: args[0],
                                            timestamp: Date.now(),
                                            responseBody: data,
                                        };
                                        if (typeof e.data === "string" && e.data.length > MAX_BODY)
                                            entry.responseBodyTruncated = true;
                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                    });

                                    const origSendWS = ws.send.bind(ws);
                                    ws.send = function (data: any) {
                                        const body =
                                            typeof data === "string"
                                                ? data.slice(0, MAX_BODY)
                                                : `[${data?.constructor?.name ?? "binary"}]`;
                                        const entry: any = {
                                            source: "websocket",
                                            method: "SEND",
                                            url: args[0],
                                            timestamp: Date.now(),
                                            requestBody: body,
                                        };
                                        if (typeof data === "string" && data.length > MAX_BODY)
                                            entry.requestBodyTruncated = true;
                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        return origSendWS(data);
                                    };

                                    ws.addEventListener("close", (e: any) => {
                                        const entry: any = {
                                            source: "websocket",
                                            method: "CLOSE",
                                            url: args[0],
                                            timestamp: Date.now(),
                                            status: e.code,
                                            statusText: e.reason || "",
                                        };
                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                    });

                                    ws.addEventListener("error", () => {
                                        const entry: any = {
                                            source: "websocket",
                                            method: "ERROR",
                                            url: args[0],
                                            timestamp: Date.now(),
                                            error: "WebSocket error",
                                        };
                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                    });

                                    return ws;
                                } as any;
                                w.WebSocket.prototype = OrigWS.prototype;
                                w.WebSocket.CONNECTING = OrigWS.CONNECTING;
                                w.WebSocket.OPEN = OrigWS.OPEN;
                                w.WebSocket.CLOSING = OrigWS.CLOSING;
                                w.WebSocket.CLOSED = OrigWS.CLOSED;

                                // — EventSource (SSE) interceptor —
                                const OrigES = w.EventSource;
                                if (OrigES) {
                                    w.EventSource = function (...args: any[]) {
                                        const es = new OrigES(...args);
                                        const connEntry: any = {
                                            source: "eventsource",
                                            method: "CONNECT",
                                            url: args[0],
                                            timestamp: Date.now(),
                                        };
                                        if (buf.length < MAX_ENTRIES) buf.push(connEntry);

                                        es.addEventListener("message", (e: any) => {
                                            const entry: any = {
                                                source: "eventsource",
                                                method: "MESSAGE",
                                                url: args[0],
                                                timestamp: Date.now(),
                                                responseBody: (e.data ?? "").slice(0, MAX_BODY),
                                            };
                                            if (e.data && e.data.length > MAX_BODY)
                                                entry.responseBodyTruncated = true;
                                            if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        });

                                        es.addEventListener("error", () => {
                                            const entry: any = {
                                                source: "eventsource",
                                                method: "ERROR",
                                                url: args[0],
                                                timestamp: Date.now(),
                                                error: "EventSource error",
                                            };
                                            if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        });

                                        return es;
                                    } as any;
                                    w.EventSource.prototype = OrigES.prototype;
                                    w.EventSource.CONNECTING = OrigES.CONNECTING;
                                    w.EventSource.OPEN = OrigES.OPEN;
                                    w.EventSource.CLOSED = OrigES.CLOSED;
                                }

                                // — sendBeacon interceptor —
                                if (navigator.sendBeacon) {
                                    const origBeacon = navigator.sendBeacon.bind(navigator);
                                    navigator.sendBeacon = function (url: string, data?: any) {
                                        const body =
                                            typeof data === "string"
                                                ? data.slice(0, MAX_BODY)
                                                : data
                                                    ? `[${data.constructor?.name ?? "blob/formdata"}]`
                                                    : undefined;
                                        const entry: any = {
                                            source: "beacon",
                                            method: "POST",
                                            url,
                                            timestamp: Date.now(),
                                            requestBody: body,
                                        };
                                        if (buf.length < MAX_ENTRIES) buf.push(entry);
                                        return origBeacon(url, data);
                                    };
                                }
                            }

                            // ── Collect results ──
                            let requests: any[] = w.__netCapture.requests;

                            const perfEntries = performance
                                .getEntriesByType("resource")
                                .slice(-100)
                                .map((e: any) => ({
                                    source: "performance-api",
                                    url: e.name,
                                    type: e.initiatorType,
                                    duration: Math.round(e.duration),
                                    transferSize: e.transferSize,
                                    timestamp: Math.round(e.startTime),
                                }));

                            const interceptedUrls = new Set(
                                requests.map((r: any) => r.url)
                            );
                            const uniquePerfEntries = perfEntries.filter(
                                (p: any) => !interceptedUrls.has(p.url)
                            );

                            let allRequests = [...requests, ...uniquePerfEntries];

                            if (filter) {
                                allRequests = allRequests.filter((r: any) =>
                                    r.url?.includes(filter)
                                );
                            }

                            if (shouldClear) {
                                w.__netCapture.requests = [];
                            }

                            return {
                                interceptorInstalled: true,
                                captured: allRequests.length,
                                requests: allRequests.slice(-MAX_ENTRIES),
                            };
                        },
                        args: [clear ?? true, urlFilter ?? null],
                    });
                    const netData = netResult.result as any;
                    if (concise) {
                        const failed = (netData.requests ?? []).filter((r: any) => r.status >= 400 || r.error);
                        result.network = {
                            requestCount: netData.captured ?? 0,
                            failedCount: failed.length,
                            ...(failed.length > 0 && {firstFailedUrl: failed[0].url}),
                        };
                    } else {
                        result.network = {
                            ...netData,
                            ...((netData.captured ?? 0) > 50 && {
                                hint: "Many requests captured. Use urlFilter to narrow results.",
                            }),
                        };
                    }
                }

                return result;
            },
        }),

        // ═══════════════════════════════════════════════
        //  User Interaction
        // ═══════════════════════════════════════════════
        askUser: tool({
            description:
                "Ask a concrete question with 2–5 choices and wait. The UI adds Other; do not include it. Add a short description when a label alone doesn't show what the choice means.",
            inputSchema: z.object({
                question: z.string().min(1).describe("The question to ask the user."),
                options: z
                    .array(
                        // Weaker models (e.g. Gemini Flash Lite) send bare strings; accept both shapes.
                        z.union([
                            z.string().min(1),
                            z.object({
                                label: z.string().min(1).describe("Short option label."),
                                description: z
                                    .string()
                                    .max(120)
                                    .optional()
                                    .describe("One plain line on what this choice means or looks like. Aim for under 80 characters."),
                                emoji: z
                                    .string()
                                    .optional()
                                    .describe("Optional single emoji shown alongside the label."),
                            }),
                        ]),
                    )
                    .min(2)
                    .max(5)
                    .describe("The options to present. Do not include an \"Other\" option."),
            }),
            execute: async ({question, options: rawOptions}, {toolCallId, abortSignal}) => {
                const options = rawOptions.map((opt) => (typeof opt === "string" ? {label: opt} : opt));
                void setTaskStatus(context.conversationId, 'waiting');
                return new Promise<{ answer: AskUserAnswer }>((resolve, reject) => {
                    const onAbort = () => {
                        rejectPendingAsk(context.conversationId, new Error("aborted"));
                    };
                    abortSignal?.addEventListener("abort", onAbort, {once: true});
                    setPendingAsk(context.conversationId, {
                        id: toolCallId,
                        question,
                        options,
                        resolve: (answer) => {
                            abortSignal?.removeEventListener("abort", onAbort);
                            resolve({answer});
                        },
                        reject: (err) => {
                            abortSignal?.removeEventListener("abort", onAbort);
                            reject(err);
                        },
                    });
                }).finally(() => { void setTaskStatus(context.conversationId, 'working'); });
            },
        }),
    }, context.conversationId, () => tabId, context.abortSignal);
}
