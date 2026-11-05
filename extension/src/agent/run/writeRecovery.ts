import type {ModelMessage} from "ai";
import {appendChunk, lineCount} from "@/agent/tools/codeFileText";

/**
 * Keeps what a reply was writing when the model's output limit cuts it off.
 *
 * The SDK runs no tools on a step that hit the limit and reports a half-written
 * call as invalid input, so without this the code streamed so far is simply
 * gone and the next step writes it all again, into the same limit. Here the
 * finished lines go to the file, and the model is told where to carry on.
 */

/** Cut-offs one run recovers from on its own before it asks the user. */
export const MAX_CUTOFF_RESUMES = 8;
/** Cut-offs in a row that saved nothing, such as thinking until the limit, before it stops trying. */
export const MAX_FRUITLESS_CUTOFFS = 2;

const WRITE_FIELDS: Record<string, string> = {createFileTool: "file_text", appendToFile: "text"};

/** One top-level string from partially streamed JSON arguments, decoded up to the last whole character. */
export function partialStringField(json: string, key: string): {value: string; complete: boolean} | undefined {
    // A quote inside a JSON string is always escaped, so `"key":` can't match inside another field's value.
    const head = new RegExp(`"${key}"\\s*:\\s*"`).exec(json);
    if (!head) return undefined;
    const start = head.index + head[0].length;
    let index = start;
    let end = start;
    let complete = false;
    while (index < json.length) {
        const char = json[index];
        if (char === '"') {
            complete = true;
            break;
        }
        const width = char !== "\\" ? 1 : json[index + 1] === "u" ? 6 : 2;
        if (index + width > json.length) break;
        index += width;
        end = index;
    }
    try {
        return {value: JSON.parse(`"${json.slice(start, end)}"`) as string, complete};
    } catch {
        return undefined;
    }
}

export type WriteReport = {id: string; name: string; path?: string; args: Record<string, unknown>} & (
    /** `complete` is false when only the whole lines of a cut-off call were kept. */
    | {kind: "saved"; savedLines: number; totalLines: number; complete: boolean; tail: string}
    /** A create for a file that already exists; nothing was overwritten. */
    | {kind: "exists"}
    /** Nothing usable arrived, or the tool never ran. */
    | {kind: "not-run"}
);

export interface WriteFiles {
    read: (path: string) => Promise<string | null>;
    write: (path: string, content: string) => Promise<void>;
}

interface PendingCall {
    name: string;
    raw: string;
    /** Parsed arguments of a call that arrived whole. */
    input?: Record<string, unknown>;
    invalid?: boolean;
}

function tailOf(text: string): string {
    return text.split("\n").slice(-5).map(line => line.length > 200 ? `${line.slice(0, 200)}…` : line).join("\n");
}

/** Follows the calls a reply is streaming, and on a cut-off saves the ones that were writing a file. */
export function createWriteTracker(files: WriteFiles) {
    const pending = new Map<string, PendingCall>();

    const entry = (id: string, name = ""): PendingCall => {
        let call = pending.get(id);
        if (!call) pending.set(id, call = {name, raw: ""});
        return call;
    };

    async function saveWrite(id: string, call: PendingCall, args: Record<string, unknown>): Promise<WriteReport> {
        const field = WRITE_FIELDS[call.name];
        const whole = call.input && typeof call.input[field] === "string" ? call.input[field] as string : undefined;
        const partial = whole === undefined ? partialStringField(call.raw, field) : undefined;
        const path = args.path as string | undefined;
        // A half-finished line could be anything, and the next piece starts on a fresh one.
        const finished = whole !== undefined || partial?.complete;
        const text = whole ?? (finished ? partial?.value : partial?.value.slice(0, Math.max(0, partial.value.lastIndexOf("\n"))));
        if (!path || !text) return {id, name: call.name, path, args, kind: "not-run"};
        const existing = await files.read(path);
        if (call.name === "createFileTool" && existing !== null) return {id, name: call.name, path, args, kind: "exists"};
        const content = appendChunk(existing, text);
        await files.write(path, content);
        return {id, name: call.name, path, args, kind: "saved", savedLines: lineCount(text),
            totalLines: lineCount(content), complete: Boolean(finished), tail: tailOf(content)};
    }

    return {
        start: (id: string, name: string) => { entry(id, name); },
        /** Adds streamed arguments and returns them so far. */
        delta(id: string, delta: string): string {
            const call = entry(id);
            call.raw += delta;
            return call.raw;
        },
        call(id: string, name: string, input: unknown, invalid?: boolean) {
            const call = entry(id, name);
            call.name = name;
            call.invalid = invalid;
            if (invalid) {
                // A call the SDK could not parse carries its raw text as the input.
                if (!call.raw && typeof input === "string") call.raw = input;
            } else {
                call.input = input && typeof input === "object" ? input as Record<string, unknown> : {};
            }
        },
        resolved: (id: string) => { pending.delete(id); },
        /** A failed call that ran is over; one that couldn't be parsed may still be a cut-off write. */
        failed(id: string) {
            if (!pending.get(id)?.invalid) pending.delete(id);
        },
        /** A new step means every call of the previous one is over. */
        stepStart: () => { pending.clear(); },
        /**
         * Saves and reports the calls still open. `cutOff` says the step hit the
         * output limit, where the SDK ran none of its tools. Otherwise a whole
         * call may already have run, so only half-written ones are saved.
         */
        async settle({cutOff}: {cutOff: boolean}): Promise<WriteReport[]> {
            const calls = [...pending];
            pending.clear();
            const reports: WriteReport[] = [];
            for (const [id, call] of calls) {
                if (call.input && !cutOff) continue;
                const reason = call.input?.reason ?? partialStringField(call.raw, "reason")?.value;
                const path = (call.input?.path ?? partialStringField(call.raw, "path")?.value) as string | undefined;
                const args = {...(reason ? {reason} : {}), ...(path ? {path} : {})};
                const report: WriteReport = call.name in WRITE_FIELDS
                    ? await saveWrite(id, call, args)
                    : {id, name: call.name, path, args, kind: "not-run"};
                // Outside a cut-off, an unparsed call with nothing to keep has already shown its own error.
                if (cutOff || !call.invalid || report.kind !== "not-run") reports.push(report);
            }
            return reports;
        },
    };
}

/** The tool call's result in the chat once it is settled. */
export function reportResult(report: WriteReport): unknown {
    if (report.kind === "saved") return {success: true, path: report.path, savedLines: report.savedLines, totalLines: report.totalLines,
        ...(report.complete ? {} : {cutOff: true, note: "Stopped part way; the finished lines were kept."})};
    if (report.kind === "exists") return {error: `Cut off, and ${report.path} already exists, so nothing was written.`};
    return {error: "Interrupted before it could run."};
}

function describeReport(report: WriteReport): string {
    if (report.kind === "saved") {
        return report.complete
            ? `- ${report.path}: this write was finished and is saved (${report.totalLines} lines).`
            : `- ${report.path}: ${report.totalLines} lines are saved and the file is incomplete. It ends with:\n${report.tail}\n  Call appendToFile with the code that comes next, starting on the very next line.`;
    }
    if (report.kind === "exists") return `- ${report.path}: not written, because the file already exists. Use appendToFile if this continues it, or edit it in place.`;
    const target = report.path ? ` on ${report.path}` : "";
    return `- ${report.name}${target}: changed nothing. Call it again if it is still needed, in smaller pieces if it was large.`;
}

/** Told to the model, as the run carries on after a cut-off. */
export function cutOffNote(reports: WriteReport[], {kept, reasoning}: {kept: boolean; reasoning: string}): string {
    const lines = ["[Automatic note, not from the user] Your last reply hit the model's output limit and was cut off. Do not start over, re-read what is saved, or plan again: carry on from where it stopped."];
    lines.push(...reports.map(describeReport));
    if (kept) lines.push("Your text so far is already shown to the user. Continue it from exactly where it stopped, without repeating any of it.");
    if (!reports.length && !kept) lines.push("Nothing was written yet, so your thinking used up the limit. Act now with little further thought.");
    if (reasoning) lines.push(`What you had worked out before the cut-off:\n${reasoning}`);
    lines.push("Keep each write to at most 150 lines, with appendToFile for what comes next.");
    return lines.join("\n");
}

/** Kept with a reply that ended part way, so the next message resumes it instead of redoing it. */
export function interruptedNote(reports: WriteReport[]): string | undefined {
    const unfinished = reports.filter(report => report.kind === "saved" && !report.complete);
    return unfinished.length ? `[This reply was interrupted while writing a file; do not start the file over.]\n${unfinished.map(describeReport).join("\n")}` : undefined;
}

const REASONING_KEPT = 3000;

/**
 * A run's messages without the step that was cut off, keeping its visible text.
 * Its tool calls have no results to pair with, and Claude rejects replayed
 * thinking from an incomplete turn. What that thinking concluded comes back
 * separately for the note, so it needn't be worked out again.
 */
export function withoutCutOffStep(response: ModelMessage[]): {messages: ModelMessage[]; kept: boolean; reasoning: string} {
    const index = response.map(message => message.role).lastIndexOf("assistant");
    if (index < 0) return {messages: response, kept: false, reasoning: ""};
    const {content} = response[index];
    const parts = typeof content === "string" ? [{type: "text" as const, text: content}] : content as {type: string; text?: string}[];
    const textOf = (type: string) => parts.flatMap(part => part.type === type && part.text ? [part.text] : []).join("\n");
    const text = textOf("text");
    return {
        messages: [...response.slice(0, index), ...(text ? [{role: "assistant" as const, content: text}] : [])],
        kept: Boolean(text),
        reasoning: textOf("reasoning").slice(-REASONING_KEPT),
    };
}

/** True when the last step added a piece to a file, so the next step has nothing new to think about. */
export function lastStepAppended(messages: ModelMessage[]): boolean {
    const last = messages[messages.length - 1];
    return last?.role === "tool" && last.content.some(part => part.type === "tool-result" && part.toolName === "appendToFile");
}
