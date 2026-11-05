import type {NormalizedEvent} from "@/agent/models/reasoning";
import {updateMessages} from "@/agent/conversation/sessions";
import type {ChatMessage, ContentBlock, ToolCall} from "@/agent/conversation/types";
import type {ToolSafety} from "@/agent/safety/safetyGate";

/** Applies one normalized reasoning event to a message's blocks. */
function applyThinkingEvent(blocks: ContentBlock[], event: Exclude<NormalizedEvent, { type: "text-delta" }>): ContentBlock[] {
    const next = [...blocks];
    const lastIndex = next.length - 1;
    const last = next[lastIndex];
    const openThinking = last?.type === "thinking" && last.endedAt === undefined ? last : undefined;
    if (event.type === "thinking-start") {
        if (!openThinking) next.push({type: "thinking", text: "", startedAt: event.at, ...(event.redacted ? {redacted: true} : {})});
    } else if (event.type === "thinking-delta") {
        if (openThinking) next[lastIndex] = {...openThinking, text: openThinking.text + event.text};
        else next.push({type: "thinking", text: event.text, startedAt: Date.now()});
    } else if (openThinking) {
        next[lastIndex] = {...openThinking, endedAt: event.at};
    }
    return next;
}

/** Closes thinking blocks a stopped or failed run left open. */
export function closeThinking(blocks: ContentBlock[], at: number): ContentBlock[] {
    return blocks.some(block => block.type === "thinking" && block.endedAt === undefined)
        ? blocks.map(block => block.type === "thinking" && block.endedAt === undefined ? {...block, endedAt: at} : block)
        : blocks;
}

/** A call's state is held twice, in toolCalls and in the block that shows it. */
function withToolCall(message: ChatMessage, id: string, change: (call: ToolCall) => ToolCall): ChatMessage {
    return {
        ...message,
        toolCalls: message.toolCalls.map(call => call.id === id ? change(call) : call),
        blocks: message.blocks.map(block => block.type === "tool_call" && block.toolCall.id === id
            ? {type: "tool_call" as const, toolCall: change(block.toolCall)}
            : block),
    };
}

/** Writes a run's streamed reply into the chat's assistant message. */
export function createReplyWriter(conversationId: string) {
    // Changes when a message the user sends mid-run splits the reply on screen.
    let id: string = crypto.randomUUID();
    const update = (updater: (message: ChatMessage) => ChatMessage) =>
        updateMessages(conversationId, (messages) => messages.map((m) => (m.id === id ? updater(m) : m)));
    const updateToolCall = (callId: string, change: (call: ToolCall) => ToolCall) =>
        update(m => withToolCall(m, callId, change));

    // Screening reports can arrive before the call's own stream part; they wait here until it does.
    const safetyById = new Map<string, ToolSafety>();
    const withSafety = (call: ToolCall): ToolCall => {
        const safety = safetyById.get(call.id);
        return safety ? {...call, safety: {...call.safety, ...safety}} : call;
    };
    const addToolCall = (message: ChatMessage, call: ToolCall): ChatMessage =>
        ({...message, toolCalls: [...message.toolCalls, call], blocks: [...message.blocks, {type: "tool_call", toolCall: call}]});

    return {
        get id() { return id; },
        /** The next part of the reply goes to this message, after a mid-run message split it. */
        continueAs(nextId: string) { id = nextId; },
        update,
        updateToolCall,
        appendText: (text: string) => update((m) => {
            const blocks = [...m.blocks];
            const last = blocks[blocks.length - 1];
            if (last && last.type === "text") {
                blocks[blocks.length - 1] = {...last, text: last.text + text};
            } else {
                blocks.push({type: "text", text});
            }
            const content = blocks
                .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
                .map((b) => b.text)
                .join("");
            return {...m, blocks, content};
        }),
        applyThinking: (event: Exclude<NormalizedEvent, { type: "text-delta" }>) =>
            update(m => ({...m, blocks: applyThinkingEvent(m.blocks, event)})),
        startToolCall: (callId: string, name: string) => update(m => addToolCall(m, {
            id: callId,
            name,
            args: {},
            result: null,
            status: "calling",
            startedAt: Date.now(),
        })),
        /** Streamed argument JSON, so the reason can title the call early. */
        setToolReason: (callId: string, reason: string) => update((m) => {
            const current = m.toolCalls.find(call => call.id === callId);
            if (!current || current.args.reason === reason) return m;
            return withToolCall(m, callId, call => ({...call, args: {...call.args, reason}}));
        }),
        setToolInput: (callId: string, name: string, rawInput: unknown) => update((m) => {
            const input = (rawInput ?? {}) as Record<string, unknown>;
            // Providers that send whole calls skip tool-input-start.
            if (!m.toolCalls.some(call => call.id === callId)) {
                return addToolCall(m, withSafety({id: callId, name, args: input, result: null, status: "calling", startedAt: Date.now()}));
            }
            return withToolCall(m, callId, call => ({...call, args: input}));
        }),
        finishToolCall: (callId: string, result: unknown, status: "done" | "error") =>
            updateToolCall(callId, call => ({...call, result, status, endedAt: Date.now()})),
        reportSafety: (callId: string, safety: ToolSafety) => {
            safetyById.set(callId, {...safetyById.get(callId), ...safety});
            update(m => m.toolCalls.some(call => call.id === callId) ? withToolCall(m, callId, withSafety) : m);
        },
    };
}

export type ReplyWriter = ReturnType<typeof createReplyWriter>;
