import {useCallback, useEffect, useRef, useState} from "react";
import {type ModelMessage, isStepCount, streamText, type UserContent} from "ai";
import {getModel, MODELPROVIDERS, type ProviderId} from "../lib/provider.ts";
import {createAgentTools} from "../lib/tools.ts";
import {saveConversation, type StoredConversation} from "../lib/storage.ts";
import {createConversationSaver} from '../lib/conversationSaver';
import SYSTEM_PROMPT from "../lib/prompt.ts";
import type {PendingAttachment} from "../components/AttachmentChip.tsx";
import {createToolRuntime} from "../lib/toolRuntime";
import {clip, createStepMessagePreparer, isFailed, serialize, summarizeSelectedElement, sumUsage, usageRecord, type RunMetrics, type UsageRecord} from "../lib/efficiency";
import {createGuidanceGuard, GUIDANCE_RESUME_NOTE} from "../lib/guidanceGuard";
import {loadAgentSettings, runStopReason} from "../lib/agentSettings";
import {agentProviderOptions} from "../lib/providerCompatibility";
import {createReasoningNormalizer, type NormalizedEvent, type ThinkingContent} from "../lib/reasoning";
import {partialReason} from "../lib/toolReason";

export interface StoredAttachment {
    kind: "image" | "file";
    name: string;
    size: string;
    ext?: string;
    url?: string | null;
    mediaType?: string;
}

async function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

export interface ToolCall {
    id: string;
    name: string;
    /** Model arguments; `reason` is the call's displayed title. */
    args: { reason?: string; [key: string]: unknown };
    result: unknown;
    status: "calling" | "done" | "error";
    startedAt?: number;
    endedAt?: number;
}

export type ContentBlock =
    | { type: "text"; text: string }
    | ({ type: "thinking" } & ThinkingContent)
    | { type: "tool_call"; toolCall: ToolCall };

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls: ToolCall[];
    blocks: ContentBlock[];
    pickedElements?: string[];
    attachments?: StoredAttachment[];
    taskState?: string;
    runMetrics?: RunMetrics;
}

// Streaming produces a new `messages` array on every delta. Writing the whole
// conversation store on each one means a full read + serialize + write of every
// conversation per token, with hundreds of those overlapping in flight — so
// saves are coalesced onto a timer and run one at a time.
const SAVE_THROTTLE_MS = 700;

// Anthropic is the only provider here that needs explicit cache breakpoints —
// OpenAI, DeepSeek and Gemini cache automatically server-side. providerOptions
// are namespaced per provider, so this is inert for the other three.
const ANTHROPIC_CACHE_BREAKPOINT = {
    anthropic: {cacheControl: {type: "ephemeral" as const}},
} as const;

/**
 * Rolling cache breakpoint at the tail of each step's message list.
 *
 * Anthropic only re-reads a cached prefix up to a breakpoint. The one on the
 * system message covers tools + system, but without a second one at the tail
 * every tool result accumulated so far is re-billed at full input rate on each
 * of the up-to-200 steps. With it, each step reads the whole prior prefix from
 * cache and only writes the delta.
 */
function markCachePrefix({messages}: { messages: ModelMessage[] }) {
    if (messages.length === 0) return {};
    const last = messages[messages.length - 1];
    return {
        messages: [
            ...messages.slice(0, -1),
            {
                ...last,
                providerOptions: {...last.providerOptions, ...ANTHROPIC_CACHE_BREAKPOINT},
            } as ModelMessage,
        ],
    };
}

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
function closeThinking(blocks: ContentBlock[], at: number): ContentBlock[] {
    return blocks.some(block => block.type === "thinking" && block.endedAt === undefined)
        ? blocks.map(block => block.type === "thinking" && block.endedAt === undefined ? {...block, endedAt: at} : block)
        : blocks;
}

function deriveTitle(messages: ChatMessage[]): string {
    const first = messages.find((m) => m.role === "user");
    if (!first) return "New conversation";
    const text = first.content.trim();
    return text.length > 60 ? text.slice(0, 57) + "..." : text;
}

export function useAgent() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [conversationId, setConversationId] = useState<string>(crypto.randomUUID());
    const [conversationCreatedAt, setConversationCreatedAt] = useState<number>(Date.now());
    const assistantIdRef = useRef("");
    const messagesRef = useRef<ChatMessage[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSaveRef = useRef<StoredConversation | null>(null);
    const saveRef = useRef<ReturnType<typeof createConversationSaver> | null>(null);
    if (!saveRef.current) saveRef.current = createConversationSaver(saveConversation, error => {
        setError(`Could not save chat: ${error instanceof Error ? error.message : String(error)}`);
    });
    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Keep one latest pending snapshot per chat while a write is in flight.
    const flushSave = useCallback(() => {
        const pending = pendingSaveRef.current;
        if (!pending) return;
        pendingSaveRef.current = null;
        saveRef.current!(pending);
    }, []);

    useEffect(() => {
        if (messages.length === 0) return;
        pendingSaveRef.current = {
            id: conversationId,
            title: deriveTitle(messages),
            messages,
            createdAt: conversationCreatedAt,
            updatedAt: Date.now(),
        };
        // A timer already scheduled will pick up this snapshot when it fires.
        if (saveTimerRef.current) return;
        saveTimerRef.current = setTimeout(() => {
            saveTimerRef.current = null;
            flushSave();
        }, SAVE_THROTTLE_MS);
    }, [messages, conversationId, conversationCreatedAt, flushSave]);

    useEffect(
        () => () => {
            if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
            flushSave();
        },
        [flushSave],
    );

    const updateAssistant = useCallback(
        (updater: (msg: ChatMessage) => ChatMessage) => {
            setMessages((prev) =>
                prev.map((m) => (m.id === assistantIdRef.current ? updater(m) : m)),
            );
        },
        [],
    );

    const sendMessage = useCallback(
        async (
            text: string,
            providerId: ProviderId,
            apiKey: string,
            modelId?: string,
            elementContext?: string[],
            attachments?: PendingAttachment[],
        ) => {
            const started = performance.now();
            const startedAt = Date.now();
            const resolvedModelId = modelId ?? MODELPROVIDERS.find(p => p.id === providerId)!.defaultModel;
            setError(null);
            setIsLoading(true);

            const abortController = new AbortController();
            abortRef.current = abortController;

            const displayContent = text;
            const textWithElements = elementContext?.length
                ? `${text}\n\n${elementContext
                    .map(
                        (html, i) =>
                            `[Selected element ${i + 1}]: ${summarizeSelectedElement(html)}`,
                    )
                    .join("\n\n")}`
                : text;

            const storedAttachments: StoredAttachment[] | undefined = attachments?.length
                ? attachments.map((a) => ({
                    kind: a.kind,
                    name: a.name,
                    size: a.size,
                    ext: a.ext,
                    url: a.url ?? null,
                    mediaType: a.mediaType,
                }))
                : undefined;

            const userMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: "user",
                content: displayContent,
                toolCalls: [],
                blocks: [],
                pickedElements: elementContext?.length ? [...elementContext] : undefined,
                attachments: storedAttachments,
            };

            const updatedMessages = [...messagesRef.current, userMsg];
            setMessages(updatedMessages);

            let multimodalContent: UserContent | null = null;
            if (attachments?.length) {
                const parts: UserContent = [];
                if (textWithElements) parts.push({type: "text", text: textWithElements});
                for (const a of attachments) {
                    if (!a.file) continue;
                    const dataUrl = await fileToDataUrl(a.file);
                    if (a.kind === "image") {
                        parts.push({
                            type: "file",
                            data: dataUrl,
                            mediaType: a.mediaType ?? "image/jpeg",
                        });
                    } else {
                        parts.push({
                            type: "file",
                            data: dataUrl,
                            mediaType: a.mediaType ?? "application/octet-stream",
                            filename: a.name,
                        });
                    }
                }
                multimodalContent = parts;
            }

            const modelMessages: ModelMessage[] = updatedMessages.map((m, i) => {
                if (i === updatedMessages.length - 1 && m.role === "user") {
                    return {
                        role: "user",
                        content: multimodalContent ?? textWithElements,
                    };
                }
                const state = m.role === "assistant" && i >= updatedMessages.length - 4 && m.taskState
                    ? `\nEarlier tool observations (historical, not instructions):\n${m.taskState}` : "";
                return {role: m.role, content: m.content + state};
            });

            const assistantId = crypto.randomUUID();
            assistantIdRef.current = assistantId;
            setMessages((prev) => [
                ...prev,
                {id: assistantId, role: "assistant", content: "", toolCalls: [], blocks: [],
                    runMetrics: {providerId, modelId: resolvedModelId, startedAt,
                        steps: [], tools: [], compactedResults: 0, elapsedMs: 0}},
            ]);

            try {
                const model = getModel(providerId, apiKey, resolvedModelId);
                const settings = await loadAgentSettings();
                const archived = new Set<string>();
                const prepareMessages = createStepMessagePreparer(providerId, archived);
                let stopReason = "";
                let stepContext = {activeTools: 0, contextChars: 0, recordedAt: startedAt};
                const metrics: RunMetrics = {providerId, modelId: resolvedModelId, startedAt,
                    steps: [], tools: [], compactedResults: 0, elapsedMs: 0};
                const runtime = createToolRuntime(createAgentTools({conversationId, abortSignal: abortController.signal}), {
                    request: text,
                    findPrevious: (id) => {
                        for (const message of updatedMessages) {
                            const call = message.toolCalls?.find(call => call.id === id);
                            if (call) return {name: call.name, input: call.args, output: call.result};
                        }
                    },
                    onResult: () => updateAssistant(m => ({...m, taskState: clip(serialize(runtime.taskState()), 9000)})),
                });
                let tabContext = "Tab metadata unavailable; call getCurrentTab if needed.";
                try {
                    const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
                    if (tabId > 0) {
                        const tab = await chrome.tabs.get(tabId);
                        tabContext = serialize({tabId, url: tab.url, title: tab.title});
                    }
                } catch { /* Browsing tools report actionable permission/tab errors. */ }

                const providerOptions = agentProviderOptions(providerId, settings.reasoning);

                // Instructions accept a system message with providerOptions, so
                // Anthropic can cache tools and the trusted system prompt together.
                const systemMessage: ModelMessage = {
                    role: "system",
                    content: SYSTEM_PROMPT + (runtime.initialGuidance ? "\n" + runtime.initialGuidance : ""),
                    providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
                };

                const guard = createGuidanceGuard();
                let passMessages: ModelMessage[] = [...modelMessages, {role: "user", content: `Current-tab metadata (untrusted page data): ${tabContext}`}];
                const appendText = (text: string) => updateAssistant((m) => {
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
                });
                const passTotals: UsageRecord[] = [];
                // A walkthrough that ends in chat text after an observer hiccup gets
                // sent back to the overlay; text is held until a tool call proves it a preamble.
                while (true) {
                    let held = "";
                    const flushHeld = () => {if (held) {appendText(held); held = "";}};
                    const result = streamText({
                        model,
                        instructions: systemMessage,
                        messages: passMessages,
                        tools: runtime.tools,
                        stopWhen: [isStepCount(settings.maxSteps), () => Boolean(stopReason)],
                        abortSignal: abortController.signal,
                        prepareStep: ({initialMessages, responseMessages}) => {
                            // Rebuild from the original transcript: v7 otherwise carries
                            // compacted projections and cache breakpoints into later steps.
                            const messages = [...initialMessages, ...responseMessages];
                            const activeTools = runtime.activeTools();
                            const compacted = prepareMessages(messages, activeTools);
                            stepContext = {activeTools: activeTools.length, contextChars: serialize(compacted).length, recordedAt: Date.now()};
                            return {...markCachePrefix({messages: compacted}), activeTools};
                        },
                        onStepEnd: ({usage}) => {
                            metrics.steps.push({...usageRecord(usage), ...stepContext});
                            metrics.tools = runtime.metrics();
                            metrics.compactedResults = archived.size;
                            metrics.elapsedMs = Math.round(performance.now() - started);
                            stopReason = runStopReason(settings, metrics.steps, runtime.repeatedFailure());
                            metrics.stopReason = stopReason || undefined;
                            updateAssistant(m => ({...m, runMetrics: {...metrics, steps: [...metrics.steps], tools: [...metrics.tools]}}));
                        },
                        providerOptions,
                    });

                    // Every provider's reasoning shape (native parts or inline
                    // <think> tags) arrives here as the same thinking events.
                    const reasoning = createReasoningNormalizer();
                    const handleNormalized = (events: NormalizedEvent[]) => {
                        for (const event of events) {
                            if (event.type === "text-delta") {
                                if (guard.holding()) held += event.text;
                                else {flushHeld(); appendText(event.text);}
                            } else {
                                updateAssistant(m => ({...m, blocks: applyThinkingEvent(m.blocks, event)}));
                            }
                        }
                    };
                    // Streamed argument JSON per call, so the reason can title the call early.
                    const inputText = new Map<string, string>();
                    for await (const part of result.stream) {
                        handleNormalized(reasoning.push(part));
                        if (part.type === "tool-input-start") {
                            flushHeld();
                            const tc: ToolCall = {
                                id: part.id,
                                name: part.toolName,
                                args: {},
                                result: null,
                                status: "calling",
                                startedAt: Date.now(),
                            };
                            updateAssistant((m) => ({
                                ...m,
                                toolCalls: [...m.toolCalls, tc],
                                blocks: [...m.blocks, {type: "tool_call", toolCall: tc}],
                            }));
                        } else if (part.type === "tool-input-delta") {
                            const text = (inputText.get(part.id) ?? "") + part.delta;
                            inputText.set(part.id, text);
                            const reason = partialReason(text);
                            if (reason) updateAssistant((m) => {
                                const current = m.toolCalls.find(tc => tc.id === part.id);
                                if (!current || current.args.reason === reason) return m;
                                const updatedTc = (tc: ToolCall): ToolCall =>
                                    tc.id === part.id ? {...tc, args: {...tc.args, reason}} : tc;
                                return {
                                    ...m,
                                    toolCalls: m.toolCalls.map(updatedTc),
                                    blocks: m.blocks.map((b) =>
                                        b.type === "tool_call"
                                            ? {type: "tool_call" as const, toolCall: updatedTc(b.toolCall)}
                                            : b,
                                    ),
                                };
                            });
                        } else if (part.type === "tool-call") {
                            flushHeld();
                            inputText.delete(part.toolCallId);
                            updateAssistant((m) => {
                                const input = (part.input ?? {}) as Record<string, unknown>;
                                // Providers that send whole calls skip tool-input-start.
                                const known = m.toolCalls.some(tc => tc.id === part.toolCallId);
                                const updatedTc = (tc: ToolCall): ToolCall =>
                                    tc.id === part.toolCallId ? {...tc, args: input} : tc;
                                if (!known) {
                                    const tc: ToolCall = {id: part.toolCallId, name: part.toolName, args: input,
                                        result: null, status: "calling", startedAt: Date.now()};
                                    return {...m, toolCalls: [...m.toolCalls, tc], blocks: [...m.blocks, {type: "tool_call", toolCall: tc}]};
                                }
                                return {
                                    ...m,
                                    toolCalls: m.toolCalls.map(updatedTc),
                                    blocks: m.blocks.map((b) =>
                                        b.type === "tool_call"
                                            ? {type: "tool_call" as const, toolCall: updatedTc(b.toolCall)}
                                            : b,
                                    ),
                                };
                            });
                        } else if (part.type === "tool-result") {
                            guard.observe(part.toolName, part.output);
                            updateAssistant((m) => {
                                const updatedTc = (tc: ToolCall): ToolCall =>
                                    tc.id === part.toolCallId
                                        ? {...tc, result: part.output, status: isFailed(part.output) ? "error" as const : "done" as const, endedAt: Date.now()}
                                        : tc;
                                return {
                                    ...m,
                                    toolCalls: m.toolCalls.map(updatedTc),
                                    blocks: m.blocks.map((b) =>
                                        b.type === "tool_call"
                                            ? {type: "tool_call" as const, toolCall: updatedTc(b.toolCall)}
                                            : b,
                                    ),
                                };
                            });
                        } else if (part.type === "error") {
                            const rawErr: any = part.error;
                            let errMsg: string = "Something went wrong";
                            if (typeof rawErr === "string") {
                                errMsg = rawErr;
                            } else if (rawErr instanceof Error) {
                                errMsg = rawErr.message || rawErr.name || errMsg;
                            } else if (rawErr && typeof rawErr === "object") {
                                errMsg =
                                    rawErr.message ||
                                    rawErr.error?.message ||
                                    rawErr.error ||
                                    (() => {
                                        try {
                                            return JSON.stringify(rawErr);
                                        } catch {
                                            return errMsg;
                                        }
                                    })();
                                if (typeof errMsg !== "string") errMsg = "Something went wrong";
                            }
                            setError(errMsg);
                        } else if (part.type === "finish") {
                            // Token accounting for the run. cachedInputTokens near the
                            // total input count means the prefix cache is working; near
                            // zero means breakpoints aren't landing.
                            const usage = part.totalUsage;
                            if (usage) {
                                passTotals.push(usageRecord(usage));
                                metrics.total = sumUsage(passTotals);
                                metrics.elapsedMs = Math.round(performance.now() - started);
                                metrics.tools = runtime.metrics();
                                updateAssistant(m => ({...m, runMetrics: {...metrics, steps: [...metrics.steps], tools: [...metrics.tools]}}));
                                console.info("[Tampersloth] run metrics", metrics);
                            }
                            // Anything but "stop" means the run was cut short. Without
                            // this the message just ends mid-task and looks finished.
                            if (part.finishReason === "tool-calls") {
                                setError(
                                    `${stopReason || `Reached the ${settings.maxSteps}-step limit.`} Work may be incomplete. Send another message to continue.`,
                                );
                            } else if (part.finishReason === "length") {
                                setError("Stopped — the model hit its output token limit mid-response.");
                            } else if (part.finishReason === "content-filter") {
                                setError("Stopped — the response was blocked by a content filter.");
                            }
                        } else if (part.type === "tool-error") {
                            updateAssistant((m) => {
                                const updatedTc = (tc: ToolCall): ToolCall =>
                                    tc.id === part.toolCallId
                                        ? {...tc, result: (part as any).error, status: "error" as const, endedAt: Date.now()}
                                        : tc;
                                return {
                                    ...m,
                                    toolCalls: m.toolCalls.map(updatedTc),
                                    blocks: m.blocks.map((b) =>
                                        b.type === "tool_call"
                                            ? {type: "tool_call" as const, toolCall: updatedTc(b.toolCall)}
                                            : b,
                                    ),
                                };
                            });
                        }
                    }
                    handleNormalized(reasoning.flush());
                    if (held && !abortController.signal.aborted && !stopReason && guard.resume()) {
                        passMessages = [...passMessages, ...(await result.response).messages, {role: "user", content: GUIDANCE_RESUME_NOTE}];
                        continue;
                    }
                    flushHeld();
                    break;
                }
            } catch (err: any) {
                if (err.name === "AbortError" || abortController.signal.aborted) {
                    // intentionally ignored
                } else {
                    setError(err.message ?? "Something went wrong");
                }
            } finally {
                // Keep the cursor through idle tool pauses, then remove all run decorations.
                await chrome.runtime.sendMessage({type:'BROWSER_RUN_END'}).catch(()=>{});
                // A stopped run never receives "finish", so total it from completed steps,
                // and any reasoning it was in the middle of is over.
                const endedAt = Date.now();
                updateAssistant(m => ({...m, blocks: closeThinking(m.blocks, endedAt), runMetrics: m.runMetrics
                    ? {...m.runMetrics, total: m.runMetrics.total ?? sumUsage(m.runMetrics.steps),
                        elapsedMs: Math.round(performance.now() - started)} : undefined}));
                abortRef.current = null;
                setIsLoading(false);
            }
        },
        [updateAssistant, conversationId],
    );

    const cancel = useCallback(() => {
        abortRef.current?.abort();
    }, []);

    const clear = useCallback(() => {
        setMessages([]);
        setError(null);
        setConversationId(crypto.randomUUID());
        setConversationCreatedAt(Date.now());
    }, []);

    const loadConversation = useCallback((conversation: StoredConversation) => {
        setConversationId(conversation.id);
        setConversationCreatedAt(conversation.createdAt);
        const migrated = (conversation.messages as ChatMessage[]).map((msg) => {
            if (msg.blocks && msg.blocks.length > 0) return msg;
            const blocks: ContentBlock[] = [
                ...(msg.toolCalls || []).map((tc) => ({type: "tool_call" as const, toolCall: tc})),
                ...(msg.content ? [{type: "text" as const, text: msg.content}] : []),
            ];
            return {...msg, blocks};
        });
        setMessages(migrated);
        setError(null);
    }, []);

    return {messages, isLoading, error, conversationId, sendMessage, cancel, clear, loadConversation};
}
