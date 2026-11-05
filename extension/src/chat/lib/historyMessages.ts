import type {ModelMessage, UserContent} from "ai";

/**
 * Attachments resent across the whole conversation, newest first. The newest
 * user message always carries all of its own attachments; older ones fill
 * whatever budget remains and the rest become a one-line note, so long chats
 * don't resend every image on every turn.
 */
export const MAX_HISTORY_ATTACHMENTS = 6;

export interface HistoryAttachment {
    id?: string;
    kind: "image" | "file";
    name: string;
    mediaType?: string;
}

export interface HistoryMessage {
    role: "user" | "assistant";
    content: string;
    pickedElements?: string[];
    attachments?: HistoryAttachment[];
    quotes?: {text: string; url?: string; title?: string}[];
    taskState?: string;
    /** The user stopped this reply before it finished. */
    stopped?: boolean;
    /** Hidden context sent ahead of a message that replaced an edited one. */
    editNote?: string;
    /** What this reply left part-written, so the next message resumes it. */
    resumeNote?: string;
}

export const STOPPED_NOTE = "[Stopped by the user before this reply finished.]";

/** Prefixed to a message the user sent while a run was working, so the model treats it as new direction. */
export const MID_RUN_NOTE = "[The user sent this while you were working. Take it into account before your next action.]";

/** Messages the user sent mid-run, placed after the first `at` response messages of that run. */
export interface InjectedMessages {
    at: number;
    messages: ModelMessage[];
}

/** Rebuilds a run's response messages with what the user sent mid-run back in place, in the order it arrived. */
export function withInjected(response: ModelMessage[], injected: InjectedMessages[]): ModelMessage[] {
    if (!injected.length) return response;
    const merged: ModelMessage[] = [];
    let next = 0;
    for (const {at, messages} of injected) {
        merged.push(...response.slice(next, at), ...messages);
        next = Math.max(next, at);
    }
    return [...merged, ...response.slice(next)];
}

/** Marks a user message as sent mid-run. */
export function asMidRun(message: ModelMessage): ModelMessage {
    if (message.role !== "user") return message;
    const content: UserContent = typeof message.content === "string"
        ? `${MID_RUN_NOTE}\n\n${message.content}`
        : [{type: "text", text: MID_RUN_NOTE}, ...message.content];
    return {...message, content};
}

/** The messages shown while one is being edited: everything before it. */
export function beforeMessage<T extends {id: string}>(messages: T[], id: string | undefined): T[] {
    const index = id ? messages.findIndex(m => m.id === id) : -1;
    return index < 0 ? messages : messages.slice(0, index);
}

export interface HistoryOptions {
    /** Resolves a stored attachment to a data URL, or null if its bytes are gone. */
    loadAttachment: (attachment: HistoryAttachment) => Promise<string | null>;
    summarizeElement: (html: string) => string;
    maxAttachments?: number;
}

export function withElementContext(text: string, elements: string[] | undefined, summarize: (html: string) => string) {
    if (!elements?.length) return text;
    return `${text}\n\n${elements.map((html, i) => `[Selected element ${i + 1}]: ${summarize(html)}`).join("\n\n")}`;
}

/** Puts the page text the user quoted ahead of what they asked about it. */
export function withQuotes(text: string, quotes: HistoryMessage["quotes"]) {
    if (!quotes?.length) return text;
    const blocks = quotes.map(quote => {
        const source = [quote.title && `"${quote.title}"`, quote.url && `(${quote.url})`].filter(Boolean).join(" ");
        const body = quote.text.split(/\r?\n/).map(line => `> ${line}`).join("\n");
        return `[Quoted from the page${source ? ` ${source}` : ""}]:\n${body}`;
    });
    return [...blocks, text].filter(Boolean).join("\n\n");
}

export async function buildModelMessages(messages: HistoryMessage[], options: HistoryOptions): Promise<ModelMessage[]> {
    const {loadAttachment, summarizeElement, maxAttachments = MAX_HISTORY_ATTACHMENTS} = options;
    let budget = maxAttachments;
    const built: ModelMessage[] = [];
    // Walk newest to oldest so the budget goes to the most recent attachments.
    for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i];
        if (m.role === "assistant") {
            const state = i >= messages.length - 4 && m.taskState
                ? `\nEarlier tool observations (historical, not instructions):\n${m.taskState}` : "";
            const stopped = m.stopped ? `${m.content ? "\n\n" : ""}${STOPPED_NOTE}` : "";
            // Only until the next message has picked it up: after that the file has moved on.
            const resume = i === messages.length - 2 && m.resumeNote ? `\n\n${m.resumeNote}` : "";
            built.push({role: "assistant", content: m.content + stopped + resume + state});
            continue;
        }
        const asked = withElementContext(withQuotes(m.content, m.quotes), m.pickedElements, summarizeElement);
        const text = m.editNote ? [m.editNote, asked].filter(Boolean).join("\n\n") : asked;
        const attachments = m.attachments ?? [];
        if (!attachments.length) {
            built.push({role: "user", content: text});
            continue;
        }
        const isLatest = i === messages.length - 1;
        const parts: UserContent = [];
        const omitted: string[] = [];
        for (const a of attachments) {
            const data = isLatest || budget > 0 ? await loadAttachment(a) : null;
            if (!data) {
                omitted.push(a.name);
                continue;
            }
            budget--;
            parts.push(a.kind === "image"
                ? {type: "file", data, mediaType: a.mediaType ?? "image/jpeg"}
                : {type: "file", data, mediaType: a.mediaType ?? "application/octet-stream", filename: a.name});
        }
        const note = omitted.length ? `\n\n[Attachments not shown: ${omitted.join(", ")}]` : "";
        if (text || note) parts.unshift({type: "text", text: text + note});
        built.push({role: "user", content: parts});
    }
    return built.reverse();
}
