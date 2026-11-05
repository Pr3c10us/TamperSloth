import type {ModelMessage} from "ai";
import {vertexProtocol} from "@/agent/models/vertexModels";
import {resultReceipt, serialize} from "@/agent/tools/toolOutput";

const CONTEXT_CHARS = 48000;

/** File writes whose code the file now holds, and the input fields carrying it. */
const WRITE_FIELDS: Record<string, string[]> = {
    createFileTool: ["file_text"], appendToFile: ["text"], strReplaceTool: ["old_str", "new_str", "edits"], replaceLines: ["new_text"],
};
const WRITTEN_CODE_CHARS = 600;

/** Gemini signs a call part itself; its arguments must reach it as they were. */
const isSigned = (part: {providerOptions?: unknown}) => Object.values((part.providerOptions ?? {}) as Record<string, unknown>)
    .some(options => Boolean(options) && typeof options === "object" && "thoughtSignature" in (options as object));

/** A write's input with its code replaced by a note: the code is in the file, where a view or search reads it fresh. */
function withoutWrittenCode(toolName: string, input: unknown): Record<string, unknown> | undefined {
    const fields = WRITE_FIELDS[toolName];
    if (!fields || !input || typeof input !== "object") return undefined;
    const record = input as Record<string, unknown>;
    if (serialize(fields.map(field => record[field] ?? "")).length < WRITTEN_CODE_CHARS) return undefined;
    const note = (text: string) => `[${text.split("\n").length} lines, applied; the file holds the current code]`;
    const stubbed = {...record};
    for (const field of fields) {
        const value = record[field];
        if (typeof value === "string") stubbed[field] = note(value);
        else if (Array.isArray(value)) stubbed[field] = value.map(edit => ({old_str: "[applied]", new_str: "[applied]", ...((edit as {all?: boolean})?.all ? {all: true} : {})}));
    }
    return stubbed;
}

/** Deterministic, sticky compaction: never edits reasoning/signatures, user messages,
 * call/result IDs, or tool inputs other than the code of applied file writes.
 * Recent observations, writes and approvals stay exact. Compacted items stay
 * compacted on later steps to avoid oscillating the cached prefix. */
export function compactMessages(messages: ModelMessage[], archived: Set<string>): ModelMessage[] {
    const toolMessages = messages.filter(m => m.role === "tool");
    const recentIds = new Set(toolMessages.slice(-3).flatMap(m => m.content.map(p => "toolCallId" in p ? p.toolCallId : "")));
    const overBudget = serialize(messages).length > CONTEXT_CHARS;
    return messages.map(message => {
        if (message.role === "assistant" && typeof message.content !== "string") {
            let changed = false;
            const content = message.content.map(part => {
                if (part.type !== "tool-call" || !WRITE_FIELDS[part.toolName] || isSigned(part)) return part;
                const key = `input:${part.toolCallId}`;
                if (!archived.has(key) && (!overBudget || recentIds.has(part.toolCallId))) return part;
                const input = withoutWrittenCode(part.toolName, part.input);
                if (!input) return part;
                archived.add(key);
                changed = true;
                return {...part, input};
            });
            return changed ? {...message, content} : message;
        }
        if (message.role !== "tool") return message;
        return {...message, content: message.content.map(part => {
            if (part.type !== "tool-result" || ["getSkill", "loadPlaybook", "askUser", "enableTools"].includes(part.toolName)) return part;
            if (!archived.has(part.toolCallId) && (!overBudget || recentIds.has(part.toolCallId) || serialize(part.output).length < 1200)) return part;
            archived.add(part.toolCallId);
            const output = part.output;
            let value: unknown = output.type === "json" || output.type === "text" ? output.value : {note: "Earlier image or tool content"};
            if (output.type === "text") { try { value = JSON.parse(output.value); } catch { /* Plain text result. */ } }
            return {...part, output: {type: "text" as const, value: serialize(resultReceipt(value, part.toolCallId))}};
        })};
    });
}

/** Per-run preparation. Claude thinking is bound to the tools and history that
 * produced it. After either changes, remove earlier reasoning permanently from
 * outgoing requests; the SDK still keeps the original blocks in its transcript.
 * New reasoning can be replayed until the next change. Other providers retain it.
 */
export function createStepMessagePreparer(providerId: string, archived: Set<string>, modelId?: string) {
    // Sloth models are Claude-backed today, so their reasoning follows the same rule.
    const claude = providerId === "anthropic" || providerId === "tampersloth"
        || (providerId === "vertex" && vertexProtocol(modelId) === "anthropic");
    let previousTools: string | undefined;
    let discardReasoningBefore = 0;
    return (messages: ModelMessage[], activeTools: string[]): ModelMessage[] => {
        const archivedBefore = archived.size;
        const compacted = compactMessages(messages, archived);
        const tools = serialize(activeTools);
        if (claude && (
            (previousTools !== undefined && previousTools !== tools) || archived.size > archivedBefore
        )) {
            discardReasoningBefore = messages.length;
        }
        previousTools = tools;
        if (discardReasoningBefore === 0) return compacted;
        return compacted.flatMap((message, index) => {
            if (index >= discardReasoningBefore || message.role !== "assistant" || typeof message.content === "string") {
                return [message];
            }
            // Signed and redacted Claude thinking both use the SDK's reasoning part.
            const content = message.content.filter(part => part.type !== "reasoning");
            if (content.length === message.content.length) return [message];
            return content.length ? [{...message, content}] : [];
        });
    };
}
