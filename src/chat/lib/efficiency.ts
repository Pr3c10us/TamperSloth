import type {LanguageModelUsage, ModelMessage} from "ai";

export const RESULT_CHARS = 6000;
export const CONTEXT_CHARS = 48000;

export function formatElapsedTime(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
    if (milliseconds > 0 && milliseconds < 1000) return "<1s";
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${seconds % 60}s`;
}

export function serialize(value: unknown): string {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value) ?? "null"; }
    catch { return "[Result could not be serialized]"; }
}

export function clip(text: string, limit: number): string {
    return text.length <= limit ? text : text.slice(0, limit) + "…[truncated]";
}

function clipEncoded(text: string, budget: number): string {
    if (JSON.stringify(text).length <= budget) return text;
    let low = 0, high = Math.min(text.length, budget);
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (JSON.stringify(clip(text, mid)).length <= budget) low = mid;
        else high = mid - 1;
    }
    return clip(text, low);
}

export function summarizeSelectedElement(html: string): string {
    const element = new DOMParser().parseFromString(html, "text/html").body.firstElementChild;
    if (!element) return clip(html, 1500);
    return serialize({tag: element.tagName.toLowerCase(),
        attributes: Object.fromEntries(["id", "class", "role", "aria-label", "name", "href", "type"].filter(name => element.hasAttribute(name))
            .map(name => [name, clip(element.getAttribute(name)!, 160)])),
        text: clip(element.textContent?.trim() ?? "", 400),
        children: Array.from(element.children).slice(0, 6).map(child => child.tagName.toLowerCase()),
        hint: "Selected-element summary; inspect the live DOM for additional detail."});
}

// Keep identifiers and errors ahead of the preview, so compression never hides
// whether an action succeeded or how to retrieve the object it created.
export function resultReceipt(output: unknown, resultId: string, previewChars = 600) {
    const record = output && typeof output === "object" ? output as Record<string, unknown> : {};
    const facts: Record<string, unknown> = {};
    for (const key of ["error", "success", "ok", "url", "finalUrl", "newUrl", "title", "scriptId", "path", "sourcePath", "status", "urlMatchPattern", "runAt", "truncated"]) {
        if (record[key] !== undefined) facts[key] = typeof record[key] === "boolean" || typeof record[key] === "number"
            ? record[key] : clipEncoded(serialize(record[key]), 300);
    }
    return {resultId, ...facts, archived: true, preview: clip(serialize(output), previewChars),
        hint: "Use readToolResult(resultId, offset) for the original result. Archived page data may be stale."};
}

export function compactToolOutput(output: unknown, resultId: string): unknown {
    if (serialize(output).length <= RESULT_CHARS) return output ?? null;
    const receipt = resultReceipt(output, resultId, 0);
    receipt.preview = clipEncoded(serialize(output), Math.max(30, RESULT_CHARS - serialize(receipt).length - 100));
    return receipt;
}

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
            if (part.type !== "tool-result" || ["getSkill", "askUser", "enableTools"].includes(part.toolName)) return part;
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
export function createStepMessagePreparer(providerId: string, archived: Set<string>) {
    let previousTools: string | undefined;
    let discardReasoningBefore = 0;
    return (messages: ModelMessage[], activeTools: string[]): ModelMessage[] => {
        const archivedBefore = archived.size;
        const compacted = compactMessages(messages, archived);
        const tools = serialize(activeTools);
        if (providerId === "anthropic" && (
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

export interface UsageRecord {
    input?: number;
    output?: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
}

export function usageRecord(usage: LanguageModelUsage): UsageRecord {
    return {input: usage.inputTokens, output: usage.outputTokens,
        reasoning: usage.outputTokenDetails?.reasoningTokens,
        cacheRead: usage.inputTokenDetails?.cacheReadTokens,
        cacheWrite: usage.inputTokenDetails?.cacheWriteTokens};
}

/** Run total from completed steps, for runs that end without a finish event (e.g. stopped early). */
export function sumUsage(steps: UsageRecord[]): UsageRecord | undefined {
    if (!steps.length) return undefined;
    const add = (key: keyof UsageRecord) => steps.some(step => step[key] !== undefined)
        ? steps.reduce((sum, step) => sum + (step[key] ?? 0), 0) : undefined;
    return {input: add("input"), output: add("output"), reasoning: add("reasoning"),
        cacheRead: add("cacheRead"), cacheWrite: add("cacheWrite")};
}

export interface ToolMetric {
    /** Tool call ID; absent on records saved before per-call display. */
    id?: string;
    name: string;
    inputChars: number;
    outputChars: number;
    modelOutputChars: number;
    /** Estimated tokens of the arguments the model wrote. */
    inputTokens?: number;
    /** Estimated tokens the projected result adds to the model's context. */
    modelOutputTokens?: number;
    elapsedMs: number;
    failed: boolean;
    repeated: boolean;
}

export interface RunMetrics {
    providerId?: string;
    modelId?: string;
    startedAt?: number;
    steps: (UsageRecord & {activeTools: number; contextChars: number; recordedAt?: number})[];
    tools: ToolMetric[];
    total?: UsageRecord;
    compactedResults: number;
    elapsedMs: number;
    stopReason?: string;
}

// Providers report usage per request, not per tool, so per-tool counts are
// estimates: ~4 characters per text token, and Anthropic's (w*h)/750 image rule
// (images are downscaled to about 1,600 tokens). Other providers tile differently.
const CHARS_PER_TOKEN = 4;
const MAX_IMAGE_TOKENS = 1600;

export function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateImageTokens(pixels?: {width?: number; height?: number}): number {
    if (!pixels?.width || !pixels?.height) return MAX_IMAGE_TOKENS;
    return Math.min(MAX_IMAGE_TOKENS, Math.ceil(pixels.width * pixels.height / 750));
}

/** Older records only stored character counts. */
export function toolCallTokens(metric: ToolMetric): {input: number; output: number} {
    return {input: metric.inputTokens ?? Math.ceil(metric.inputChars / CHARS_PER_TOKEN),
        output: metric.modelOutputTokens ?? Math.ceil(metric.modelOutputChars / CHARS_PER_TOKEN)};
}

export function isFailed(output: unknown): boolean {
    if (!output || typeof output !== "object") return false;
    const value = output as Record<string, unknown>;
    return Boolean(value.error) || value.success === false || value.ok === false;
}
