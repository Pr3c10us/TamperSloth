import {tool} from "ai";
import {z} from "zod";
import {readFile, writeFile} from "@/storage/codeFiles";
import {deleteScript, loadScripts, loadScriptsByConversation, saveScript, updateScriptStatus} from "@/storage/scripts";
import {DEFAULT_VIEW_LINES, lineCount, numberedWindow, outlineCode, scriptFilePath} from "./codeFileText";
import {isValidMatchPattern} from "@/shared/url";
import type {BackgroundScript} from "@/userscripts/types";
import {type ToolContext, responseFormatSchema} from "./toolContext";
import {scriptTargets} from "@/userscripts/userscript";

export function createScriptTools(context: ToolContext) {
    const {chrome} = context;
    return {
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
                    tabId: context.tabId,
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
    };
}
