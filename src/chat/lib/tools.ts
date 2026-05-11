import {tool} from "ai";
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

const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));

const responseFormatSchema = z
    .enum(["concise", "detailed"])
    .optional()
    .default("detailed")
    .describe(
        'Response verbosity: "concise" returns minimal fields for token efficiency, ' +
        '"detailed" (default) returns full information.'
    );

function numberLines(content: string, startLine: number, endLine: number): string {
    const lines = content.split('\n');
    const slice = lines.slice(startLine - 1, endLine);
    return slice
        .map((line, i) => `${String(startLine + i).padStart(5)}\t${line}`)
        .join('\n');
}

export function createAgentTools(context: { conversationId: string }) {
    return {
        // ═══════════════════════════════════════════════
        //  Code Edit
        // ═══════════════════════════════════════════════
        viewCodeFiles: tool({
            description:
                'View a virtual file or list virtual files. For files, returns numbered lines ' +
                '(the `    N\\t` prefix is display-only — do NOT include it in str_replace inputs). ' +
                'For directory-style listing, pass a path ending in "/" to list all files under that prefix.',
            inputSchema: z.object({
                description: z.string().describe('Why this view is needed'),
                path: z
                    .string()
                    .describe('Virtual path. End with "/" to list a "directory" (prefix scan).'),
                view_range: z
                    .tuple([z.number().int(), z.number().int()])
                    .optional()
                    .describe('Optional [start, end] line range (1-indexed, inclusive). Use -1 for EOF.'),
            }),
            execute: async ({path, view_range}) => {
                try {
                    if (path.endsWith('/')) {
                        const entries = await listFiles(path);
                        return {type: 'directory' as const, path, entries};
                    }

                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }

                    const totalLines = content.split('\n').length;
                    const start = view_range?.[0] ?? 1;
                    const end =
                        view_range == null || view_range[1] === -1 ? totalLines : view_range[1];

                    return {
                        type: 'file' as const,
                        path,
                        totalLines,
                        viewedRange: [start, end] as [number, number],
                        content: numberLines(content, start, end),
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        createFileTool: tool({
            description:
                'Create a new virtual file. Fails if the path already exists — use str_replace to edit existing files.',
            inputSchema: z.object({
                description: z.string().describe('Why this file is being created'),
                path: z.string().describe('Virtual path where the new file should live'),
                file_text: z.string().describe('Full content to write'),
            }),
            execute: async ({path, file_text}) => {
                try {
                    if (await fileExists(context.conversationId, path)) {
                        return {error: `File already exists at ${path}. Use str_replace to edit it.`};
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
                'Replace a unique string in a virtual file. `old_str` must match exactly (whitespace and ' +
                'newlines included) and appear EXACTLY ONCE. Add surrounding context to disambiguate if ' +
                'needed. Pass an empty `new_str` to delete `old_str`. Do not include the `view` line-number prefix.',
            inputSchema: z.object({
                description: z.string().describe('Why this edit is being made'),
                path: z.string().describe('Virtual path to edit'),
                old_str: z.string().min(1).describe('Exact string to find (must be unique in file)'),
                new_str: z.string().default('').describe('Replacement string (empty deletes old_str)'),
            }),
            execute: async ({path, old_str, new_str}) => {
                try {
                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }

                    const occurrences = content.split(old_str).length - 1;
                    if (occurrences === 0) {
                        return {
                            error:
                                'old_str not found. Re-view the file and check whitespace, newlines, and exact characters.',
                        };
                    }
                    if (occurrences > 1) {
                        return {
                            error: `old_str appears ${occurrences} times — it must appear exactly once. Add more surrounding context.`,
                        };
                    }

                    const updated = content.replace(old_str, new_str);
                    await writeFile(context.conversationId, path, updated);

                    return {
                        success: true as const,
                        path,
                        replaced: 1,
                        delta: new_str.length - old_str.length,
                    };
                } catch (err) {
                    return {error: err instanceof Error ? err.message : String(err)};
                }
            },
        }),

        deleteFileTool: tool({
            description: 'Delete a virtual file. No-op if the file does not exist.',
            inputSchema: z.object({
                description: z.string().describe('Why this file is being deleted'),
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
                "Get the browser tab id, url and title for the tab this sidebar is attached to. " +
                "Call this at the start of every task to establish the current page context.",
            inputSchema: z.object({}),
            execute: async () => {
                const tab = await chrome.tabs.get(tabId);
                return {tabId: tab.id, url: tab.url, title: tab.title};
            },
        }),

        getPageStructure: tool({
            description:
                "Get a simplified DOM structure of the current page for writing content scripts. " +
                "Prefer getPageText when you only need text content.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .optional()
                    .describe(
                        "CSS selector to scope the capture to a specific section"
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, responseFormat}) => {
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                if (!tab?.id) throw new Error("No active tab found");

                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: (sel: string | null, format: string) => {
                        const root = sel ? document.querySelector(sel) : document.body;
                        if (!root) return null;

                        const concise = format === "concise";

                        function simplify(el: Element, depth = 0): any {
                            if (depth > 6) return "...";

                            const info: any = {tag: el.tagName.toLowerCase()};

                            if (concise) {
                                if (el.id) info.id = el.id;
                                if (el.classList.length) info.class = Array.from(el.classList).join(" ");
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

                            const children = Array.from(el.children)
                                .map((c) => simplify(c, depth + 1))
                                .filter(Boolean);
                            if (children.length) info.children = children;

                            return info;
                        }

                        return {
                            url: location.href,
                            title: document.title,
                            tree: simplify(root),
                        };
                    },
                    args: [selector ?? null, responseFormat ?? "detailed"],
                });

                return result.result;
            },
        }),

        getElementDetails: tool({
            description:
                "Get detailed info about specific elements matching a CSS selector",
            inputSchema: z.object({
                selector: z.string(),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, responseFormat}) => {
                const [tab] = await chrome.tabs.query({
                    active: true,
                    currentWindow: true,
                });
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: tab!.id!},
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
                                    },
                                };
                            });
                    },
                    args: [selector, responseFormat ?? "detailed"],
                });
                return result.result;
            },
        }),

        getPageText: tool({
            description:
                "Extract the visible text content of the current page (or a scoped section). " +
                "Returns the human-readable innerText — all scripts, styles, and hidden elements " +
                "are excluded automatically. Much faster and more token-efficient than " +
                "getPageStructure when you only need the text, not the DOM tree.",
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
                    .optional()
                    .default(10000)
                    .describe(
                        "Maximum character length of returned text (default: 10000)."
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, maxLength, responseFormat}) => {
                const effectiveMax = responseFormat === "concise" && !maxLength ? 3000 : (maxLength ?? 10000);
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId},
                    func: (sel: string | null, max: number, format: string) => {
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
                        const truncated = text.length > max;

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
                            truncated,
                            text: truncated
                                ? text.slice(0, max) + "\n\n[...truncated]"
                                : text,
                            ...(truncated && availableSections && {
                                availableSections,
                                hint: "Content was truncated. Use the selector parameter to scope to a specific section.",
                            }),
                        };
                    },
                    args: [selector ?? null, effectiveMax, responseFormat ?? "detailed"],
                });
                return result.result;
            },
        }),

        takeScreenshot: tool({
            description:
                "Take a screenshot of the current page. Returns an image of the visible viewport.",
            inputSchema: z.object({}),
            execute: async () => {
                const response = await chrome.runtime.sendMessage({
                    type: "TAKE_SCREENSHOT",
                    tabId,
                });
                if (response?.error) throw new Error(response.error);
                return {screenshot: response.dataUrl as string};
            },
            toModelOutput: ({output}) => {
                const base64 = output.screenshot.split(",")[1];
                return {
                    type: "content",
                    value: [
                        {
                            type: "image-data" as const,
                            data: base64,
                            mediaType: "image/jpeg",
                        },
                    ],
                };
            },
        }),

        // ═══════════════════════════════════════════════
        //  PAGE STATE (storage, cookies)
        // ═══════════════════════════════════════════════

        getLocalStorage: tool({
            description:
                "Read the contents of localStorage and/or sessionStorage for the current page origin. " +
                "Returns key-value pairs as a JSON object. Useful for inspecting auth tokens, user " +
                "preferences, feature flags, or cached data. Only reads — never modifies.",
            inputSchema: z.object({
                storageType: z
                    .enum(["local", "session", "both"])
                    .optional()
                    .default("both")
                    .describe(
                        'Which storage to read: "local", "session", or "both" (default: "both")'
                    ),
                keyPrefix: z
                    .string()
                    .optional()
                    .describe(
                        'Only return keys starting with this prefix (e.g. "auth_", "user_").'
                    ),
                maxKeys: z
                    .number()
                    .optional()
                    .default(100)
                    .describe(
                        "Maximum number of keys to return per storage type (default: 100)"
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
                                if (value.length > 1000)
                                    value = value.slice(0, 1000) + "...[truncated]";
                                entries[key] = value;
                                count++;
                            }
                            return {name, count, total: storage.length, entries};
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
                    args: [storageType ?? "both", keyPrefix ?? null, maxKeys ?? 100],
                });
                return result.result;
            },
        }),

        getCookies: tool({
            description:
                "Read cookies for the current page's domain using the Chrome cookies API. " +
                "Returns cookie name, value, domain, path, expiration, and flags. " +
                "Reads ALL cookies including httpOnly cookies invisible to document.cookie. " +
                "Only reads — never creates or modifies cookies.",
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
                "Run a JavaScript function on the current page to manipulate the DOM. " +
                'Provide a named function definition that will be immediately invoked. ' +
                "If your function returns a value and you get null, the function failed.",
            inputSchema: z.object({
                code: z
                    .string()
                    .describe(
                        'A named JavaScript function definition (e.g. "function doSomething() { ... }").'
                    ),
            }),
            execute: async ({code}) => {
                const fnMatch = code.match(
                    /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/
                );
                if (!fnMatch) {
                    throw new Error(
                        "code must be a named function definition, e.g. function myFn() { ... }"
                    );
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
                "Save a JavaScript script to run persistently in the background on web pages. " +
                "Always ask the user about scope before calling this. " +
                "Choose runAt based on when the script needs to execute relative to page load.",
            inputSchema: z.object({
                code: z
                    .string()
                    .describe("The JavaScript code to execute persistently"),
                name: z.string().describe("Short descriptive name for the script"),
                description: z.string().describe("What this script does"),
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
            execute: async ({code, name, description, urlMatchPattern, runAt}) => {
                if (urlMatchPattern && !isValidMatchPattern(urlMatchPattern)) {
                    return {
                        success: false,
                        error:
                            `Invalid URL match pattern: "${urlMatchPattern}". ` +
                            "Must follow Chrome match pattern format: <scheme>://<host>/<path>.",
                    };
                }

                const script: BackgroundScript = {
                    id: crypto.randomUUID(),
                    conversationId: context.conversationId,
                    name,
                    description,
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
                    urlMatchPattern: script.urlMatchPattern,
                    status: "active",
                    runAt: script.runAt,
                };
            },
        }),

        listScripts: tool({
            description:
                "List all saved background scripts. Optionally filter to scripts from the current conversation only.",
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
                        ? {name: s.name, status: s.status}
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
            description: "Pause or resume a specific background script.",
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
            description: "Delete a specific background script permanently.",
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
                "Navigate the current tab to a new URL and wait for the page to fully load before returning. " +
                "Returns the final URL (after any redirects), page title, and load timing. " +
                "Use this instead of setting location.href inside executeContentScript, which gives you " +
                "no way to know when the new page is ready. Supports optional wait-for-selector to delay " +
                "resolution until a specific element appears on the loaded page (useful for SPAs that " +
                "render asynchronously after the load event). " +
                "Handles redirects, hash navigations, and SPA client-side routing transparently.",
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
                "Navigate the current tab back or forward one step in its browsing history. " +
                "Waits for the page to fully load before returning. Returns the URL and title " +
                "of the page navigated to.",
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
                "Reload the current tab's page. Optionally bypass the browser cache to force a fresh " +
                "load from the server. Waits for the page to fully load before returning.",
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
                "Click on a DOM element identified by a CSS selector. Scrolls the element into view " +
                "first if needed. Clicks the first matching element by default. Returns info about " +
                "the clicked element and whether it triggered a navigation.",
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
                    args: [selector, index ?? 0, waitAfter ?? 500, responseFormat ?? "detailed"],
                });

                const afterTab = await chrome.tabs.get(tabId);
                const navigated = afterTab.url !== beforeTab.url;

                return {
                    ...result.result,
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
                "Type text into an input field, textarea, or contenteditable element identified by a " +
                "CSS selector. Clears the existing value first by default. Dispatches realistic input " +
                "and change events so that frameworks (React, Vue, etc.) detect the update.",
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
                        responseFormat ?? "detailed",
                    ],
                });
                return result.result;
            },
        }),

        selectOption: tool({
            description:
                "Select an option from a <select> dropdown element. Can select by value, by visible " +
                "text label, or by index. Dispatches change events for framework compatibility.",
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
                    args: [selector, value ?? null, label ?? null, index ?? null, responseFormat ?? "detailed"],
                });
                return result.result;
            },
        }),

        scrollPage: tool({
            description:
                "Scroll the page or a specific scrollable container. Supports scrolling by pixels, " +
                "by pages (viewport heights), to a specific element, or to the top/bottom of the page.",
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
                        responseFormat ?? "detailed",
                    ],
                });
                return result.result;
            },
        }),

        submitForm: tool({
            description:
                "Submit a form element identified by a CSS selector. Triggers the submit event " +
                "and optionally waits for navigation or dynamic content changes. Use after filling " +
                "in form fields with typeText and selectOption.",
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
                            form.requestSubmit();
                        } catch {
                            form.submit();
                        }

                        return {submitted: true, ...(formInfo && {form: formInfo})};
                    },
                    args: [selector, responseFormat ?? "detailed"],
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
                "Wait for a DOM element matching a CSS selector to appear on the page. " +
                "Uses a MutationObserver to efficiently detect newly added or changed elements. " +
                "Returns immediately if the element already exists. Use after navigations, " +
                "form submissions, AJAX loads, or any async operation.",
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

        // ═══════════════════════════════════════════════
        //  DEBUGGING (network, console)
        // ═══════════════════════════════════════════════

        getDebugInfo: tool({
            description:
                "Capture debugging information from the current page. Supports two sources: " +
                '"console" captures console output (logs, warnings, errors, exceptions) via the Chrome Debugger API, ' +
                'and "network" intercepts fetch, XHR, WebSocket, EventSource, and sendBeacon requests. ' +
                "Request both sources together to get a complete debugging picture. " +
                "Network interceptors are installed on first call; subsequent calls return new requests since last retrieval. " +
                "Note: console capture shows a debugger warning bar at the top of the tab.",
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
                        result.console = {
                            logs,
                            count: logs.length,
                            ...(logs.length > 50 && {
                                hint: "Many console entries captured. Errors and warnings are typically most relevant for debugging.",
                            }),
                        };
                    }
                }

                if (sources.includes("network")) {
                    const [netResult] = await chrome.scripting.executeScript({
                        target: {tabId},
                        world: "MAIN",
                        func: (shouldClear: boolean, filter: string | null) => {
                            const MAX_ENTRIES = 200;
                            const MAX_BODY = 2000;
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
                                        entry.responseHeaders = Object.fromEntries(
                                            response.headers.entries()
                                        );

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
                        const failed = (netData.requests ?? []).filter((r: any) => r.status && (r.status >= 400 || r.error));
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
    };
}