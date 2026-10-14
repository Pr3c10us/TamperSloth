import {tool} from "ai";
import {createBrowserTools, browserImageOutput, browserCall} from './browserTools';
import {z} from "zod";
import type {BackgroundScript} from "./types";
import {
    deleteFile,
    deleteScript,
    fileExists,
    listFiles,
    loadScripts,
    loadScriptsByConversation,
    readFile,
    saveScript,
    updateScriptStatus,
    writeFile,
} from "./storage";
import {isValidMatchPattern} from "./url";
import {type AskUserAnswer, rejectPendingAsk, setPendingAsk,} from "./askUserBus";
import {leaseTabTools} from "./tabLease";
import { skills, type SkillId } from "./skills";


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

function numberLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    const slice = lines.slice(startLine - 1, endLine);
    return slice
        .map((line, i) => `${String(startLine + i).padStart(5)}\t${line}`)
        .join('\n');
}

const SKILL_IDS = Object.keys(skills) as [SkillId, ...SkillId[]];

export function createAgentTools(context: { conversationId: string; abortSignal?: AbortSignal }) {
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
    return leaseTabTools({
        ...createBrowserTools(() => tabId, id => { tabId = id; }, context.abortSignal),
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
                "Read numbered file lines, or list files with a path ending in /. Line-number prefixes are display-only.",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe('Virtual path. End with "/" to list a "directory" (prefix scan).'),
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
                        'window from start_line. Use -1 for the whole file, which is rarely necessary.',
                    ),
            }),
            execute: async ({path, start_line, end_line}) => {
                try {
                    if (path.endsWith('/')) {
                        const entries = await listFiles(context.conversationId, path);
                        return {type: 'directory' as const, path, entries};
                    }

                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }

                    const totalLines = content.split('\n').length;
                    const start = start_line ?? 1;
                    // Defaulting to EOF meant every re-view of a long script paid
                    // for the whole file again. -1 still opts into the full read.
                    const end =
                        end_line === -1
                            ? totalLines
                            : end_line != null
                                ? end_line
                                : Math.min(totalLines, start + DEFAULT_VIEW_LINES - 1);

                    return {
                        type: 'file' as const,
                        path,
                        totalLines,
                        viewedRange: [start, end] as [number, number],
                        ...(end < totalLines && {
                            truncated: true,
                            hint:
                                `Showing lines ${start}-${end} of ${totalLines}. Pass start_line/end_line ` +
                                "for a different window, or end_line: -1 for the whole file.",
                        }),
                        content: numberLines(content, start, end),
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        createFileTool: tool({
            description:
                "Create a virtual file. Fails if it exists; edit existing files with strReplaceTool.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path where the new file should live'),
                file_text: z.string().describe('Full content to write'),
            }),
            execute: async ({path, file_text}) => {
                try {
                    if (await fileExists(context.conversationId, path)) {
                        return {error: `File already exists at ${path}. Use strReplaceTool to edit it.`};
                    }
                    await writeFile(context.conversationId, path, file_text);
                    return {
                        success: true as const,
                        path,
                        bytesWritten: new Blob([file_text]).size,
                        lines: file_text.split('\n').length,
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        strReplaceTool: tool({
            description:
                "Replace exact unique strings in a virtual file. Use old_str/new_str or an ordered edits array. Batch edits commit atomically. Empty replacement deletes.",
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
            }),
            execute: async ({selector, responseFormat, maxNodes}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
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
            }),
            execute: async ({selector, maxLength, responseFormat, offset}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const effectiveMax = maxLength ?? (responseFormat === "detailed" ? 10000 : 3000);
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
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

        saveScript: tool({
            description:
                "Save a tested virtual file as a persistent browser script. Confirm URL scope with the user first.",
            inputSchema: z.object({
                path: z
                    .string()
                    .describe(
                        'Virtual path to the script file containing the JavaScript code to execute persistently.'
                    ),
                name: z.string().describe("Short descriptive name for the script"),
                scriptDescription: z
                    .string()
                    .describe("What this script does (stored alongside the script for later reference)"),
                urlMatchPattern: z
                    .string()
                    .optional()
                    .describe(
                        "Chrome-style URL match pattern. Format: <scheme>://<host>/<path>. " +
                        "Examples: https://*.example.com/*, *://example.com/api/*, <all_urls>"
                    ),
                runAt: z.enum(['document_start', 'document_end', 'document_idle'])
                    .default('document_idle')
                    .optional()
                    .describe(
                        "When to inject: document_start (before DOM), document_end (DOM ready), document_idle (page loaded, default)"
                    ),
            }),
            execute: async ({path, name, scriptDescription, urlMatchPattern, runAt}) => {
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

                const script: BackgroundScript = {
                    id: crypto.randomUUID(),
                    conversationId: context.conversationId,
                    name,
                    description: scriptDescription,
                    code,
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
                    status: "active",
                    runAt: script.runAt,
                };
            },
        }),

        listScripts: tool({
            description:
                "List saved script IDs, names, status and URL patterns; optionally filter to this conversation.",
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
                        ? {id: s.id, name: s.name, status: s.status, urlPattern: s.urlMatchPattern}
                        : {
                            id: s.id,
                            name: s.name,
                            description: s.description,
                            urlPattern: s.urlMatchPattern,
                            status: s.status,
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
                "Navigate the attached tab and wait for loading/readiness. Optionally readText afterward in the same call. Accepts absolute or relative URLs.",
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
                    .default("load")
                    .describe(
                        '"load" waits for all resources including images/stylesheets (default). ' +
                        '"domcontentloaded" resolves earlier, as soon as the HTML is parsed.'
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
            execute: async ({url, waitUntil, waitForSelector, timeout}) => {
                const timeoutMs = timeout ?? 15000;
                const startTime = Date.now();

                // Resolve relative URLs against the current tab URL
                const currentTab = await chrome.tabs.get(tabId);
                const resolvedUrl = new URL(url, currentTab.url).href;

                // Navigate the tab
                await chrome.tabs.update(tabId, {url: resolvedUrl});

                // Wait for the tab to finish loading
                const waitForLoad = () =>
                    new Promise<chrome.tabs.Tab>((resolve, reject) => {
                        const timer = setTimeout(() => {
                            chrome.tabs.onUpdated.removeListener(listener);
                            reject(new Error(`Navigation timed out after ${timeoutMs}ms`));
                        }, timeoutMs);

                        const targetEvent =
                            waitUntil === "domcontentloaded" ? "loading" : "complete";

                        const listener = (
                            updatedTabId: number,
                            changeInfo: { status?: string },
                            tab: chrome.tabs.Tab
                        ) => {
                            if (updatedTabId !== tabId) return;

                            if (
                                changeInfo.status === "complete" ||
                                (targetEvent === "loading" && changeInfo.status === "loading" && tab.url !== currentTab.url)
                            ) {
                                if (targetEvent === "loading" && changeInfo.status === "loading") {
                                    setTimeout(() => {
                                        clearTimeout(timer);
                                        chrome.tabs.onUpdated.removeListener(listener);
                                        resolve(tab);
                                    }, 100);
                                } else {
                                    clearTimeout(timer);
                                    chrome.tabs.onUpdated.removeListener(listener);
                                    resolve(tab);
                                }
                            }
                        };

                        chrome.tabs.onUpdated.addListener(listener);
                    });

                await waitForLoad();
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
                "Click a selector match and report navigation. Choose index for multiple matches.",
            inputSchema: z.object({
                selector: z
                    .string()
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
                        "Milliseconds to wait after clicking for any triggered effects to settle (default: 500)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, index, waitAfter, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                await browserCall('guidance',{tabId,action:'cue',selector,index,cue:'click'}).catch(()=>{});
                const beforeTab = await chrome.tabs.get(tabId);

                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (sel: string, idx: number, wait: number, format: string) => {
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
                            el.scrollIntoView({behavior: "smooth", block: "center"});

                            setTimeout(() => {
                                try {(window as any).__tamperSlothGuidance?.cue(el,'click');} catch { /* Decoration is optional. */ }
                                el.click();

                                setTimeout(() => {
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
                                        });
                                    }
                                }, wait);
                            }, 200);
                        });
                    },
                    args: [selector, index ?? 0, waitAfter ?? 500, responseFormat ?? "concise"],
                });

                const afterTab = await chrome.tabs.get(tabId);
                const navigated = afterTab.url !== beforeTab.url;

                return {
                    ...await withSelectorHelp(tabId, selector, result.result),
                    navigated,
                    ...(navigated && {
                        newUrl: afterTab.url,
                        newTitle: afterTab.title,
                    }),
                };
            },
        }),

        typeText: tool({
            description:
                "Type into a matched input or editable element; optionally clear or press Enter.",
            inputSchema: z.object({
                selector: z
                    .string()
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
            execute: async ({selector, text, clearFirst, pressEnter, index, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                await browserCall('guidance',{tabId,action:'cue',selector,index,cue:'type'}).catch(()=>{});
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
                        el.scrollIntoView({behavior: "smooth", block: "center"});
                        el.focus();

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
                            return {typed: true, pressedEnter: enter};
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
                return withSelectorHelp(tabId, selector, result.result);
            },
        }),

        selectOption: tool({
            description:
                "Select a native dropdown option by value, label or index.",
            inputSchema: z.object({
                selector: z
                    .string()
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
            execute: async ({selector, value, label, index, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                await browserCall('guidance',{tabId,action:'cue',selector,index,cue:'click'}).catch(()=>{});
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
                return result.result;
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
                "Submit a form and wait for navigation. Obtain confirmation for consequential submissions.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .describe(
                        'CSS selector for the <form> element, e.g. "#login-form", "form[action=\\"/search\\"]". ' +
                        "If the selector points to an element inside a form, the closest parent form is submitted."
                    ),
                timeout: z
                    .number()
                    .optional()
                    .default(5000)
                    .describe(
                        "Maximum time in ms to wait for navigation or page changes after submission (default: 5000)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, timeout, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                await browserCall('guidance',{tabId,action:'cue',selector,cue:'click'}).catch(()=>{});
                const timeoutMs = timeout ?? 5000;
                const beforeTab = await chrome.tabs.get(tabId);

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
                });

                const navigated = await new Promise<boolean>((resolve) => {
                    const timer = setTimeout(() => {
                        chrome.tabs.onUpdated.removeListener(listener);
                        resolve(false);
                    }, timeoutMs);

                    const listener = (
                        updatedTabId: number,
                        changeInfo: { status?: string }
                    ) => {
                        if (updatedTabId !== tabId) return;
                        if (changeInfo.status === "complete") {
                            clearTimeout(timer);
                            chrome.tabs.onUpdated.removeListener(listener);
                            resolve(true);
                        }
                    };

                    chrome.tabs.onUpdated.addListener(listener);
                });

                const afterTab = await chrome.tabs.get(tabId);

                return {
                    ...result.result,
                    navigated,
                    ...(navigated && afterTab.url !== beforeTab.url && {
                        newUrl: afterTab.url,
                        newTitle: afterTab.title,
                    }),
                };
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
                "By default returns early once page text (frames included) changes and then holds still for 2s. Read or screenshot the page afterward.",
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
                    .describe("Return once the watched text changes and settles. false always waits the full time."),
                selector: z
                    .string()
                    .optional()
                    .describe("Optional CSS selector to scope change detection, e.g. a chat message list. Checked in every frame; defaults to the whole page."),
            }),
            execute: async ({seconds, returnOnChange, selector}, {abortSignal}) => {
                if (selector) {
                    const invalid = selectorError(selector);
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

                const start = Date.now();
                const deadline = start + seconds * 1000;
                const elapsed = () => Math.round((Date.now() - start) / 100) / 10;
                let last = returnOnChange ? await fingerprint() : null;
                if (last === null) {
                    await sleep(Math.max(0, deadline - Date.now()));
                    return {waitedSeconds: elapsed(), watched: false};
                }
                let changed = false;
                while (Date.now() < deadline) {
                    await sleep(Math.min(2000, deadline - Date.now()));
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
                return {waitedSeconds: elapsed(), changed, settled: false,
                    hint: changed
                        ? "Page text is still changing. Read it now, or wait again briefly."
                        : "No change. Wait again if a reply is still expected, otherwise report back."};
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
                "Ask a concrete question with 2–5 choices and wait. The UI adds Other; do not include it.",
            inputSchema: z.object({
                question: z.string().min(1).describe("The question to ask the user."),
                options: z
                    .array(
                        // Weaker models (e.g. Gemini Flash Lite) send bare strings; accept both shapes.
                        z.union([
                            z.string().min(1),
                            z.object({
                                label: z.string().min(1).describe("Short option label."),
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
                });
            },
        }),
    }, context.conversationId, () => tabId, context.abortSignal);
}
