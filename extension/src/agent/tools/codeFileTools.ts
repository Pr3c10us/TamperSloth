import {tool} from "ai";
import {z} from "zod";
import {appendChunk, DEFAULT_VIEW_LINES, findLines, lineCount, numberedWindow, replaceLineRange} from "./codeFileText";
import {deleteFile, fileExists, listFiles, readFile, writeFile} from "@/storage/codeFiles";
import type {ToolContext} from "./toolContext";

export function createCodeFileTools(context: ToolContext) {
    return {
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
    };
}
