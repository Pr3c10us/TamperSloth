/**
 * Provider-agnostic reasoning layer.
 *
 * Providers expose model reasoning in different shapes:
 * - Anthropic `thinking` / `redacted_thinking` blocks, OpenAI reasoning summaries,
 *   DeepSeek `reasoning_content` and Gemini thought parts all reach us as AI SDK
 *   `reasoning-start` / `reasoning-delta` / `reasoning-end` stream parts.
 * - Open models served through OpenAI-compatible endpoints often inline it in the
 *   answer text as `<think>…</think>` (also `<thinking>` / `<reasoning>`).
 *
 * The normalizer folds both into one event stream — thinking start/delta/end with
 * wall-clock timing, plus clean answer text — so the UI never has to know which
 * provider produced a block.
 */

export type NormalizedEvent =
    | {type: "thinking-start"; at: number; redacted?: boolean}
    | {type: "thinking-delta"; text: string}
    | {type: "thinking-end"; at: number}
    | {type: "text-delta"; text: string};

/** The subset of AI SDK full-stream parts the normalizer understands. */
export type StreamPartLike = {type: string; text?: string; delta?: string; providerMetadata?: unknown};

const TAG_NAMES = ["think", "thinking", "reasoning"];
const OPEN_TAG = new RegExp(`^<(${TAG_NAMES.join("|")})>`, "i");
// Longest possible tag, used to decide how much trailing text might be a split tag.
const MAX_TAG = Math.max(...TAG_NAMES.map(name => name.length)) + 3;

/** Parts that mean the model has moved on from reasoning to visible output. */
const CLOSING_PARTS = new Set(["tool-input-start", "tool-call", "finish-step", "finish", "abort", "error"]);

function isRedacted(part: StreamPartLike) {
    const metadata = part.providerMetadata as {anthropic?: {redactedData?: unknown}} | undefined;
    return metadata?.anthropic?.redactedData != null;
}

/** True when `text` could be the beginning of `tag` (case-insensitive). */
function couldStartTag(text: string, tag: string) {
    return text.length < tag.length && tag.toLowerCase().startsWith(text.toLowerCase());
}

export function createReasoningNormalizer({now = Date.now}: {now?: () => number} = {}) {
    let open = false;
    // Set when a native reasoning part ended but nothing else has arrived yet.
    // OpenAI streams each summary paragraph as its own reasoning item; they are
    // merged into one block until visible output proves the reasoning is over.
    let pendingEnd: number | null = null;
    let hasText = false;
    let separator = false;

    // Inline-tag state for the current text segment (one per step).
    let segmentStart = true;
    let closeTag: string | null = null;
    let trimLeading = false;
    let buffer = "";

    const start = (events: NormalizedEvent[], redacted = false) => {
        if (pendingEnd !== null) {
            pendingEnd = null;
            separator = hasText;
            return;
        }
        if (open) return;
        open = true;
        hasText = false;
        separator = false;
        events.push({type: "thinking-start", at: now(), ...(redacted ? {redacted: true} : {})});
    };
    const delta = (events: NormalizedEvent[], text: string) => {
        if (!text) return;
        if (separator) {
            events.push({type: "thinking-delta", text: "\n\n"});
            separator = false;
        }
        hasText = true;
        events.push({type: "thinking-delta", text});
    };
    const end = (events: NormalizedEvent[], at = now()) => {
        if (!open) return;
        open = false;
        pendingEnd = null;
        events.push({type: "thinking-end", at});
    };
    const settle = (events: NormalizedEvent[]) => {
        if (pendingEnd !== null) end(events, pendingEnd);
    };

    /** Splits answer text into thinking and visible text, holding back split tags. */
    const parseText = (events: NormalizedEvent[], chunk: string, final = false) => {
        buffer += chunk;
        while (buffer) {
            if (trimLeading) {
                // Tags are usually followed by a newline, often in its own chunk.
                buffer = buffer.replace(/^\s+/, "");
                if (!buffer) return;
                trimLeading = false;
            }
            if (closeTag) {
                const index = buffer.toLowerCase().indexOf(closeTag);
                if (index >= 0) {
                    delta(events, buffer.slice(0, index));
                    buffer = buffer.slice(index + closeTag.length);
                    closeTag = null;
                    trimLeading = true;
                    end(events);
                    continue;
                }
                // Keep a possible partial closing tag for the next chunk.
                let keep = 0;
                if (!final) for (let n = Math.min(closeTag.length - 1, buffer.length); n > 0; n--) {
                    if (closeTag.startsWith(buffer.slice(-n).toLowerCase())) { keep = n; break; }
                }
                delta(events, buffer.slice(0, buffer.length - keep));
                buffer = buffer.slice(buffer.length - keep);
                return;
            }
            if (segmentStart) {
                // Only a tag at the very start of a segment is reasoning; the same
                // text later in an answer (e.g. explaining HTML) stays visible.
                const trimmed = buffer.replace(/^\s+/, "");
                if (!trimmed) {
                    if (final) buffer = "";
                    return;
                }
                const match = trimmed.match(OPEN_TAG);
                if (match) {
                    segmentStart = false;
                    settle(events);
                    start(events);
                    closeTag = `</${match[1].toLowerCase()}>`;
                    buffer = trimmed.slice(match[0].length);
                    trimLeading = true;
                    continue;
                }
                if (!final && trimmed.length < MAX_TAG && TAG_NAMES.some(name => couldStartTag(trimmed, `<${name}>`))) return;
                segmentStart = false;
            }
            if (/\S/.test(buffer)) {
                settle(events);
                end(events);
            }
            events.push({type: "text-delta", text: buffer});
            buffer = "";
        }
    };

    return {
        push(part: StreamPartLike): NormalizedEvent[] {
            const events: NormalizedEvent[] = [];
            switch (part.type) {
                case "reasoning-start":
                    start(events, isRedacted(part));
                    break;
                case "reasoning-delta":
                    start(events);
                    delta(events, part.text ?? part.delta ?? "");
                    break;
                case "reasoning-end":
                    if (open) pendingEnd = now();
                    break;
                case "text-delta":
                    parseText(events, part.text ?? part.delta ?? "");
                    break;
                case "start-step":
                    segmentStart = true;
                    break;
                default:
                    if (CLOSING_PARTS.has(part.type)) {
                        if (buffer || closeTag) parseText(events, "", true);
                        settle(events);
                        end(events);
                        if (part.type === "finish-step") {
                            segmentStart = true;
                            closeTag = null;
                            trimLeading = false;
                        }
                    }
            }
            return events;
        },
        /** Releases held text and closes any open block (end of stream or abort). */
        flush(): NormalizedEvent[] {
            const events: NormalizedEvent[] = [];
            if (buffer || closeTag) parseText(events, "", true);
            settle(events);
            end(events);
            return events;
        },
    };
}

/** Thinking content as stored on a message block. */
export interface ThinkingContent {
    text: string;
    startedAt?: number;
    endedAt?: number;
    redacted?: boolean;
}

export function thinkingDuration(block: ThinkingContent, nowMs = Date.now()): number | undefined {
    if (block.startedAt === undefined) return undefined;
    return Math.max(0, (block.endedAt ?? nowMs) - block.startedAt);
}
