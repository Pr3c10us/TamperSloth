/** Reading and changing virtual code files by piece, so a large file never has to pass through the model whole. */

/**
 * Most of one tool result, measured as encoded JSON. Results past RESULT_CHARS
 * are archived behind a preview, which would turn every view into two calls.
 */
/** Lines one view shows when it names no range. */
export const DEFAULT_VIEW_LINES = 120;

const VIEW_BUDGET = 5000;

const encodedLength = (text: string) => JSON.stringify(text).length;
const numbered = (line: number, text: string) => `${String(line).padStart(5)}\t${text}`;

/** Lines start..end, numbered, stopping at the budget. A single overlong line (minified code) is clipped. */
export function numberedWindow(content: string, start: number, end: number, budget = VIEW_BUDGET): {text: string; lastLine: number} {
    const lines = content.split("\n");
    const shown: string[] = [];
    let used = 0;
    let lastLine = start - 1;
    for (let line = Math.max(1, start); line <= Math.min(end, lines.length); line++) {
        const text = numbered(line, lines[line - 1]);
        const cost = encodedLength(text) + 2;
        if (used + cost > budget) {
            if (!shown.length) {
                shown.push(`${numbered(line, lines[line - 1].slice(0, Math.floor(budget / 2)))}…[line clipped, ${lines[line - 1].length} chars]`);
                lastLine = line;
            }
            break;
        }
        shown.push(text);
        used += cost;
        lastLine = line;
    }
    return {text: shown.join("\n"), lastLine};
}

function lineMatcher(query: string): (line: string) => number {
    const pattern = /^\/(.+)\/([a-z]*)$/.exec(query);
    if (pattern) {
        try {
            const regex = new RegExp(pattern[1], pattern[2].replace(/[gy]/g, ""));
            return line => line.search(regex);
        } catch { /* Not a usable regex: search for it literally. */ }
    }
    const needle = query.toLowerCase();
    return line => line.toLowerCase().indexOf(needle);
}

const LINE_CLIP = 240;

/** A long line shown around its match, so one minified line can't fill the result. */
function clipAround(line: string, at: number): string {
    if (line.length <= LINE_CLIP) return line;
    const from = Math.max(0, (at < 0 ? 0 : at) - LINE_CLIP / 2);
    return `${from > 0 ? "…" : ""}${line.slice(from, from + LINE_CLIP)}${from + LINE_CLIP < line.length ? "…" : ""}`;
}

/** Numbered matching lines with context: literal and case-insensitive, or a /regex/flags. */
export function findLines(content: string, query: string, context = 2, budget = VIEW_BUDGET) {
    const match = lineMatcher(query);
    const lines = content.split("\n");
    const hits = lines.flatMap((line, index) => match(line) >= 0 ? [index] : []);
    const shown: string[] = [];
    let used = 0;
    let previous = -1;
    let shownHits = 0;
    for (const hit of hits) {
        const from = Math.max(hit - context, previous + 1);
        const to = Math.min(hit + context, lines.length - 1);
        const block = [];
        for (let index = from; index <= to; index++) block.push(numbered(index + 1, clipAround(lines[index], match(lines[index]))));
        if (from > previous + 1 && shown.length) block.unshift("  ...");
        const cost = encodedLength(block.join("\n")) + 2;
        if (used + cost > budget && shown.length) break;
        shown.push(...block);
        used += cost;
        previous = Math.max(previous, to);
        shownHits++;
    }
    return {matches: hits.length, shownMatches: shownHits, totalLines: lines.length, content: shown.join("\n")};
}

const OUTLINE_LINE = /^\s{0,8}(?:(?:export\s+)?(?:async\s+)?function\b|class\s+[\w$]|(?:const|let|var)\s+[\w$]+\s*=\s*(?:async\b|function\b|\(|[\w$]+\s*=>|class\b)|[\w$]+\s*:\s*(?:async\s*)?function\b|\/\/\s*(?:[-=─#*]{2,}|[A-Z][A-Z ]{3,})|\/\*+\s*[-=─#*]{2,})/;

/** Where the file's functions and sections start, as a map for jumping straight to the code to change. */
export function outlineCode(content: string, budget = 2500): string {
    const entries: string[] = [];
    let used = 0;
    const lines = content.split("\n");
    for (let index = 0; index < lines.length; index++) {
        if (!OUTLINE_LINE.test(lines[index])) continue;
        const entry = numbered(index + 1, lines[index].length > 80 ? `${lines[index].slice(0, 80)}…` : lines[index]);
        used += encodedLength(entry) + 2;
        if (used > budget) {
            entries.push("  ...[outline truncated; use a query to find the rest]");
            break;
        }
        entries.push(entry);
    }
    return entries.join("\n");
}

/** Adds a piece to the end of a file, on a new line. */
export function appendChunk(existing: string | null, text: string): string {
    if (!existing) return text;
    return existing.endsWith("\n") ? existing + text : `${existing}\n${text}`;
}

export const lineCount = (text: string) => text.split("\n").length;

type LineEdit =
    | {error: string}
    | {content: string; removed: number; added: number; totalLines: number};

/**
 * Replaces lines start..end; end = start - 1 inserts before start. `firstLine`
 * is the current text of the start line: numbers go stale after any edit, and a
 * stale range would quietly damage the file.
 */
export function replaceLineRange(content: string, start: number, end: number, firstLine: string, newText: string): LineEdit {
    const lines = content.split("\n");
    if (start < 1 || start > lines.length + 1) return {error: `start_line ${start} is outside the file (1-${lines.length + 1}). No changes written.`};
    if (end < start - 1 || end > lines.length) return {error: `end_line ${end} is outside the file for start_line ${start} (${start - 1}-${lines.length}). No changes written.`};
    if (start <= lines.length && lines[start - 1].trim() !== firstLine.replace(/^\s*\d+\t/, "").trim()) {
        return {error: `Line ${start} is ${JSON.stringify(lines[start - 1].trim().slice(0, 200))}, not first_line. The numbers may be stale; find the code again. No changes written.`};
    }
    const added = newText === "" ? [] : newText.split("\n");
    lines.splice(start - 1, end - start + 1, ...added);
    return {content: lines.join("\n"), removed: end - start + 1, added: added.length, totalLines: lines.length};
}

export function scriptFilePath(name: string, id: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
    return `scripts/${slug || id.slice(0, 8)}.js`;
}

/** What a run starts knowing about this chat's code, so an edit can go straight to it. */
export function codeContextNote(files: {path: string; lines: number}[], scripts: {id: string; name: string; lines: number; path?: string}[]): string {
    if (!files.length && !scripts.length) return "";
    const parts = ["\nCode from earlier in this chat; no need to list it or read it all."];
    if (files.length) parts.push(`Working files: ${JSON.stringify(files)}`);
    if (scripts.length) {
        parts.push(`Saved changes: ${JSON.stringify(scripts.map(s => ({scriptId: s.id, name: s.name, lines: s.lines, ...(s.path ? {path: s.path} : {})})))}`);
        parts.push("To change a saved one: openScript (skip it when its path is in Working files), viewCodeFiles with query to find the code, strReplaceTool or replaceLines to edit, then saveScript with scriptId. Never rewrite it from scratch.");
    }
    return parts.join("\n");
}
