import type {ModelMessage} from "ai";
import {vertexProtocol} from "@/agent/models/vertexModels";
import {resultReceipt, serialize} from "@/agent/tools/toolOutput";

const CONTEXT_CHARS = 48000;

/** Deterministic, sticky compaction: never edits tool inputs, reasoning/signatures,
 * user messages, or call/result IDs. Recent observations and approvals stay exact.
 * IDs remain compacted on later steps to avoid oscillating the cached prefix. */
export function compactMessages(messages: ModelMessage[], archived: Set<string>): ModelMessage[] {
    const toolMessages = messages.filter(m => m.role === "tool");
    const recentIds = new Set(toolMessages.slice(-3).flatMap(m => m.content.map(p => "toolCallId" in p ? p.toolCallId : "")));
    const overBudget = serialize(messages).length > CONTEXT_CHARS;
    return messages.map(message => {
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
