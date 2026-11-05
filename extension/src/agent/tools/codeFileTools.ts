import {tool} from "ai";
import {z} from "zod";
import {appendChunk, codeResultText, DEFAULT_VIEW_LINES, findLines, lineCount, nearMisses, numberedWindow, occurrenceLines, replaceLineRange} from "./codeFileText";
import {deleteFile, fileExists, listFiles, readFile, writeFile} from "@/storage/codeFiles";
import {compactToolOutput, serialize} from "./toolOutput";
import type {ToolContext} from "./toolContext";

/** Code reaches the model as plain text; any other result as the runtime would send it. */
export function codeProjection({toolCallId, output}: {toolCallId: string; output: unknown}) {
    return {type: "text" as const, value: codeResultText(output) ?? serialize(compactToolOutput(output, toolCallId))};
}

/**
 * Calls in one reply run together, but each write reads the file and then
 * replaces it: writes to the same file go one at a time, in the order sent.
 */
function writesInOrder<T extends Record<string, {execute?: (input: any, options: any) => any}>>(tools: T, names: (keyof T)[]): T {
    const queues = new Map<string, Promise<unknown>>();
    const wrapped = {...tools};
    for (const name of names) {
        const execute = tools[name].execute!;
        wrapped[name] = {...tools[name], execute: (input: {path: string}, options: unknown) => {
            const run = (queues.get(input.path) ?? Promise.resolve()).catch(() => {}).then(() => execute(input, options));
            queues.set(input.path, run);
            return run;
        }};
    }
    return wrapped;
}

export function createCodeFileTools(context: ToolContext) {
    return writesInOrder({
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
            toModelOutput: codeProjection,
        }),

        createFileTool: tool({
            description:
                "Create a virtual file with its whole content in one call. Fails if it exists; edit existing files with strReplaceTool or replaceLines.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path where the new file should live'),
                file_text: z.string().describe("The file's whole content"),
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
                "Add code to the end of a virtual file, on a new line, e.g. to carry on after a reply was cut off. Send only the new code, never what is already saved.",
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
                "Replace exact strings in a virtual file, each matching once (replace_all, or all per edit: every match). Use old_str/new_str or an ordered edits array, committed atomically. Empty replacement deletes. For a large block, replaceLines avoids retyping it.",
            inputSchema: z.object({
                path: z.string().describe('Virtual path to edit'),
                old_str: z.string().min(1).optional().describe('Exact string. Omit when using edits.'),
                new_str: z.string().default('').describe('Replacement string (empty deletes old_str)'),
                replace_all: z.boolean().optional(),
                edits: z.array(z.object({old_str: z.string().min(1), new_str: z.string(), all: z.boolean().optional()})).min(1).max(20).optional()
                    .describe('Ordered replacements, all or none. Alternative to old_str/new_str.'),
            }),
            execute: async ({path, old_str, new_str, replace_all, edits}) => {
                try {
                    const content = await readFile(context.conversationId, path);
                    if (content === null) {
                        return {error: `No file at ${path}`};
                    }

                    if ((old_str !== undefined) === (edits !== undefined)) {
                        return {error: 'Provide either old_str/new_str or edits, not both.'};
                    }
                    const replacements = edits ?? [{old_str: old_str!, new_str, all: replace_all}];
                    let updated = content;
                    let replaced = 0;
                    for (const [index, edit] of replacements.entries()) {
                        const label = edits ? `Edit ${index + 1}: ` : '';
                        const occurrences = updated.split(edit.old_str).length - 1;
                        if (occurrences === 0) {
                            // Usually right but for its spacing: show where, so the retry needs no view.
                            const similarLines = nearMisses(updated, edit.old_str);
                            return {error: `${label}old_str was not found. No changes written.`,
                                ...(similarLines && {similarLines, hint: 'Copy the exact text from these lines, indentation included.'})};
                        }
                        if (occurrences > 1 && !edit.all) {
                            const lines = occurrenceLines(updated, edit.old_str).join(', ') + (occurrences > 8 ? ', …' : '');
                            return {error: `${label}old_str matches ${occurrences} times (lines ${lines}); add surrounding text to pick one, or set ${edits ? 'all' : 'replace_all'} to change every one. No changes written.`};
                        }
                        updated = edit.all ? updated.split(edit.old_str).join(edit.new_str) : updated.replace(edit.old_str, () => edit.new_str);
                        replaced += edit.all ? occurrences : 1;
                    }
                    await writeFile(context.conversationId, path, updated);

                    return {
                        success: true as const,
                        path,
                        replaced,
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
            toModelOutput: codeProjection,
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
    }, ["createFileTool", "appendToFile", "strReplaceTool", "replaceLines", "deleteFileTool"]);
}
