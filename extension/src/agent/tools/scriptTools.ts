import {tool} from "ai";
import {z} from "zod";
import {readFile, writeFile} from "@/storage/codeFiles";
import {deleteScript, loadScripts, loadScriptsByConversation, saveScript, updateScriptStatus} from "@/storage/scripts";
import {DEFAULT_VIEW_LINES, findLines, lineCount, numberedWindow, outlineCode, scriptFilePath} from "./codeFileText";
import {isValidMatchPattern} from "@/shared/url";
import type {BackgroundScript} from "@/userscripts/types";
import {codeFingerprint, compareWorkingFile, linkedHere, linkWorkingFile, syncWorkingFile} from "@/userscripts/workingFile";
import {type ToolContext, responseFormatSchema} from "./toolContext";
import {scriptTargets} from "@/userscripts/userscript";
import {reloadAndWait} from "./navigationTools";
import {compactToolOutput, serialize} from "./toolOutput";

const NAMED_FUNCTION = /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/;

const UNSAVED_NOTE = "This working copy has edits the saved script does not. Pass reset to start again from the saved code.";
const DIVERGED_NOTE = "The saved script changed elsewhere (a hand edit, an update or another chat) and this file has edits of its own. "
    + "Pass reset to start again from the saved code, or saveScript with overwrite to keep this file's version over that change, only if the user agrees.";

/** The line a syntax error is on, counted in the file, with the code around it, when the parser can find it. */
async function syntaxLocation(code: string) {
    const {findSyntaxProblem} = await import("@/userscripts/scriptSyntax");
    const problem = findSyntaxProblem(code);
    return problem ? {line: problem.line, around: numberedWindow(code, problem.line - 3, problem.line + 3, 1500).text} : undefined;
}

/** openScript's result for the model: a header and the code, outline or matches as plain text. */
function openScriptText(output: Record<string, any>): string | undefined {
    if (!output?.success) return undefined;
    const lines = [`Opened "${output.name}" (scriptId ${output.scriptId}) as ${output.path}: ${output.totalLines} lines, `
        + `${output.urlMatchPattern || "no URL pattern"}, ${output.runAt}, ${output.status}.`];
    for (const note of [output.installedUserscript, output.differsFromSaved, output.diverged]) if (note) lines.push(note);
    if (output.content !== undefined) lines.push(`Code:\n${output.content}`);
    else if (output.query !== undefined) {
        const shown = output.shownMatches < output.matches ? `, showing ${output.shownMatches}` : "";
        lines.push(`${output.matches} ${output.matches === 1 ? "match" : "matches"} for ${JSON.stringify(output.query)}${shown}:${output.found ? `\n${output.found}` : ""}`);
    } else lines.push(`Outline (read the rest with viewCodeFiles query or start_line):\n${output.outline}`);
    return lines.join("\n");
}

export function createScriptTools(context: ToolContext) {
    const {chrome} = context;
    const conversationId = context.conversationId;

    /** Waits until the background has registered what storage now holds, so a reload runs the new version. */
    const registered = () => chrome.runtime.sendMessage({type: "SYNC_SCRIPTS"}).catch(() => undefined);

    /**
     * Puts a saved script's code in a working file here and links the script to it.
     * A file this chat already holds is synced instead, keeping any edits of its own.
     */
    async function openWorkingFile(script: BackgroundScript, reset: boolean) {
        if (linkedHere(script, conversationId)) {
            if (reset) {
                await writeFile(conversationId, script.sourcePath, script.code);
                const linked = await linkWorkingFile(script, conversationId, script.sourcePath);
                return {path: script.sourcePath, code: script.code, state: "saved" as const, script: linked};
            }
            return syncWorkingFile(script, conversationId);
        }
        // Another chat's file, or none. A file here under that name is another script's or an old copy: keep it.
        let path = script.sourcePath ?? scriptFilePath(script.name, script.id);
        let existing = await readFile(conversationId, path);
        if (existing !== null && existing !== script.code) {
            path = scriptFilePath(`${script.name}-${script.id.slice(0, 6)}`, script.id);
            existing = await readFile(conversationId, path);
        }
        if (existing !== script.code) await writeFile(conversationId, path, script.code);
        return {path, code: script.code, state: "saved" as const, script: await linkWorkingFile(script, conversationId, path)};
    }

    return {
        executeContentScript: tool({
            description:
                "Run the named function in a virtual file on the attached page. Create the file first. Returns what it returns; a failure returns error.",
            inputSchema: z.object({
                path: z.string().describe('Working file with a named function, e.g. "scripts/highlight.js"'),
            }),
            execute: async ({path}) => {
                const code = await readFile(conversationId, path);
                if (code === null) {
                    return {
                        success: false,
                        error: `No file at ${path}. Create it with createFileTool first.`,
                    };
                }

                if (!NAMED_FUNCTION.test(code)) {
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
                    const error = String(response.error);
                    const permission = /userScripts|Developer Mode|Allow User Scripts/.test(error);
                    // The browser's line numbers count the wrapper around the file; the parser's count the file.
                    const syntax = !permission && /SyntaxError/i.test(error) ? await syntaxLocation(code) : undefined;
                    return {
                        success: false,
                        error,
                        ...(syntax && {line: syntax.line, around: syntax.around}),
                        ...(permission && {
                            suggestion: 'Go to chrome://extensions, click Tampersloth details, and enable "Allow User Scripts" (or "Allow in Developer Mode"). Then reload the extension.',
                        }),
                    };
                }
                return response?.result ?? {success: true, result: null};
            },
        }),

        openScript: tool({
            description:
                "Open a saved script for editing in a working file here. Returns the path and an outline with line numbers (the code itself when short), or the lines matching query. Edit with strReplaceTool or replaceLines, then saveScript with scriptId.",
            inputSchema: z.object({
                scriptId: z.string().describe("The ID of the saved script"),
                query: z.string().min(1).optional().describe("Find this text or /regex/ instead of the outline"),
                reset: z.boolean().optional().describe("Discard a working copy that differs from the saved code, and start again from the saved code."),
            }),
            execute: async ({scriptId, query, reset}) => {
                const stored = (await loadScripts()).find((s) => s.id === scriptId);
                if (!stored) {
                    return {error: `No saved script with ID ${scriptId}. Use listScripts to find it.`};
                }
                const {path, code, state, script} = await openWorkingFile(stored, Boolean(reset));
                const totalLines = lineCount(code);
                const short = !query && totalLines <= DEFAULT_VIEW_LINES ? numberedWindow(code, 1, totalLines) : undefined;
                const found = query ? findLines(code, query) : undefined;
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
                    ...(state === "unsaved" && {differsFromSaved: UNSAVED_NOTE}),
                    ...(state === "diverged" && {diverged: DIVERGED_NOTE}),
                    ...(found
                        ? {query, matches: found.matches, shownMatches: found.shownMatches, found: found.content}
                        : short?.lastLine === totalLines
                            ? {content: short.text}
                            : {outline: outlineCode(code), hint: "Use viewCodeFiles with query or start_line to read only the part you need."}),
                };
            },
            toModelOutput: ({toolCallId, output}) => ({
                type: "text",
                value: openScriptText(output as Record<string, any>) ?? serialize(compactToolOutput(output, toolCallId)),
            }),
        }),

        saveScript: tool({
            description:
                "Save a tested virtual file as a persistent browser script, or with scriptId update a saved one in place, keeping its settings and data. The working file stays for later edits. Confirm URL scope with the user first when adding a script or changing its scope.",
            inputSchema: z.object({
                path: z.string().describe("The tested working file"),
                scriptId: z.string().optional().describe("The saved script to update in place. Omit to add a new one."),
                name: z.string().optional().describe("Short descriptive name for the script. Required for a new script."),
                scriptDescription: z.string().optional().describe("What it does. Required for a new script."),
                urlMatchPattern: z
                    .string()
                    .optional()
                    .describe(
                        "Chrome-style URL match pattern. Format: <scheme>://<host>/<path>. " +
                        "Examples: https://*.example.com/*, *://example.com/api/*, <all_urls>"
                    ),
                runAt: z.enum(['document_start', 'document_end', 'document_idle']).optional().describe("When to inject; default document_idle"),
                reload: z.boolean().optional().describe("Then reload the tab, running the saved version"),
                overwrite: z.boolean().optional().describe("After a refusal, only if the user agrees"),
            }),
            execute: async ({path, scriptId, name, scriptDescription, urlMatchPattern, runAt, reload, overwrite}) => {
                if (urlMatchPattern && !isValidMatchPattern(urlMatchPattern)) {
                    return {
                        success: false,
                        error:
                            `Invalid URL match pattern: "${urlMatchPattern}". ` +
                            "Must follow Chrome match pattern format: <scheme>://<host>/<path>.",
                    };
                }

                const code = await readFile(conversationId, path);
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
                    : saved.find((s) => linkedHere(s, conversationId) && s.sourcePath === path);
                if (scriptId && !previous) {
                    return {success: false, error: `No saved script with ID ${scriptId}. Use listScripts to find it.`};
                }
                if (!previous && !name) {
                    return {success: false, error: "A new script needs a name. Pass scriptId to update a saved one."};
                }
                // The file it was saved from, behind a change made elsewhere: saving would undo that change.
                const fromItsFile = previous && linkedHere(previous, conversationId) && previous.sourcePath === path;
                const standing = fromItsFile ? compareWorkingFile(previous, code) : "unsaved";
                if (!overwrite && (standing === "stale" || standing === "diverged")) {
                    return {
                        success: false,
                        error: standing === "stale"
                            ? "The saved script changed elsewhere (a hand edit, an update or another chat) after this file matched it, and this file has no edits of its own, so saving it would undo that change. openScript brings the file up to date."
                            : `Not saved. ${DIVERGED_NOTE}`,
                    };
                }

                const link = {sourcePath: path, sourceConversationId: conversationId, sourceBase: codeFingerprint(code)};
                const script: BackgroundScript = previous
                    ? {
                        ...previous,
                        ...link,
                        code,
                        name: name ?? previous.name,
                        description: scriptDescription ?? previous.description,
                        urlMatchPattern: urlMatchPattern ?? previous.urlMatchPattern,
                        runAt: runAt ?? previous.runAt,
                    }
                    : {
                        id: crypto.randomUUID(),
                        conversationId,
                        ...link,
                        name: name!,
                        description: scriptDescription ?? "",
                        code,
                        urlMatchPattern: urlMatchPattern ?? "",
                        status: "active",
                        runAt: runAt ?? 'document_idle',
                    };

                await saveScript(script);
                await registered();
                let reloaded: {url?: string; title?: string} | {error: string} | undefined;
                if (reload) {
                    reloaded = await reloadAndWait(chrome, context.tabId)
                        .then(({url, title}) => ({url, title}), (error: unknown) => ({error: error instanceof Error ? error.message : String(error)}));
                }

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
                    ...(reloaded && {reloaded}),
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
                    ? await loadScriptsByConversation(conversationId)
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
                            // Only this chat's file: another chat's path names nothing here.
                            ...(linkedHere(s, conversationId) ? {path: s.sourcePath} : {}),
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
                await registered();
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
                await registered();
                return {success: true, scriptId};
            },
        }),
    };
}
