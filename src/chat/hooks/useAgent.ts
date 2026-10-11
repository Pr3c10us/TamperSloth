import {useCallback, useEffect, useRef, useState} from "react";
import {type ModelMessage, stepCountIs, streamText, type UserContent} from "ai";
import {getModel, type ProviderId} from "../lib/provider.ts";
import {createAgentTools} from "../lib/tools.ts";
import {saveConversation, type StoredConversation} from "../lib/storage.ts";
import SYSTEM_PROMPT from "../lib/prompt.ts";
import type {PendingAttachment} from "../components/AttachmentChip.tsx";

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
    args: { description: string; [key: string]: unknown };
    result: unknown;
    status: "calling" | "done" | "error";
}

export type ContentBlock =
    | { type: "text"; text: string }
    | { type: "thinking"; text: string }
    | { type: "tool_call"; toolCall: ToolCall };

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls: ToolCall[];
    blocks: ContentBlock[];
    pickedElements?: string[];
    attachments?: StoredAttachment[];
}

// Streaming produces a new `messages` array on every delta. Writing the whole
// conversation store on each one means a full read + serialize + write of every
// conversation per token, with hundreds of those overlapping in flight — so
// saves are coalesced onto a timer and run one at a time.
const SAVE_THROTTLE_MS = 700;

// One step = one model generation plus the tools it calls. Tools requested
// together in a single generation cost one step, not one each.
const MAX_AGENT_STEPS = 200;

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
    const saveChainRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        messagesRef.current = messages;
    }, [messages]);

    // Writes whatever snapshot is pending, chained behind any in-flight write so
    // concurrent read-modify-writes can't drop each other's updates.
    const flushSave = useCallback(() => {
        const pending = pendingSaveRef.current;
        if (!pending) return;
        pendingSaveRef.current = null;
        saveChainRef.current = saveChainRef.current
            .then(() => saveConversation(pending))
            .catch(() => {});
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
            setError(null);
            setIsLoading(true);

            const abortController = new AbortController();
            abortRef.current = abortController;

            const displayContent = text;
            const textWithElements = elementContext?.length
                ? `${text}\n\n${elementContext
                    .map(
                        (html, i) =>
                            `[Selected element ${elementContext.length > 1 ? i + 1 : ""} outerHTML]:\n\`\`\`html\n${html}\n\`\`\``,
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
                            type: "image",
                            image: dataUrl,
                            mediaType: a.mediaType,
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
                return {role: m.role, content: m.content};
            });

            const assistantId = crypto.randomUUID();
            assistantIdRef.current = assistantId;
            setMessages((prev) => [
                ...prev,
                {id: assistantId, role: "assistant", content: "", toolCalls: [], blocks: []},
            ]);

            try {
                const model = getModel(providerId, apiKey, modelId);

                const providerOptions: any = {}
                if (providerId === "anthropic") {
                    // Adaptive, not a fixed budget: budgetTokens is rejected with a
                    // 400 on Opus 5 / Sonnet 5 / Opus 4.8 / Fable 5.
                    providerOptions.anthropic = {thinking: {type: "adaptive" as const}}
                } else if (providerId === "deepseek") {
                    providerOptions.deepseek = {
                        thinking: {type: 'enabled'},
                        reasoningEffort: 'max',
                    }
                }

                // The system prompt goes in `messages` rather than the top-level
                // `system` param because only a message can carry providerOptions,
                // and it needs the cache breakpoint. Tools are serialized ahead of
                // system in the Anthropic request, so this one breakpoint covers
                // the whole ~6.7k-token preamble.
                const systemMessage: ModelMessage = {
                    role: "system",
                    content: SYSTEM_PROMPT,
                    providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
                };

                const result = streamText({
                    model,
                    messages: [systemMessage, ...modelMessages],
                    allowSystemInMessages: true,
                    tools: createAgentTools({conversationId}),
                    stopWhen: stepCountIs(MAX_AGENT_STEPS),
                    abortSignal: abortController.signal,
                    prepareStep: markCachePrefix,
                    ...(providerOptions ? {providerOptions} : {}),
                });

                for await (const part of result.fullStream) {
                    if (part.type === "text-delta") {
                        updateAssistant((m) => {
                            const blocks = [...m.blocks];
                            const last = blocks[blocks.length - 1];
                            if (last && last.type === "text") {
                                blocks[blocks.length - 1] = {...last, text: last.text + part.text};
                            } else {
                                blocks.push({type: "text", text: part.text});
                            }
                            const content = blocks
                                .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
                                .map((b) => b.text)
                                .join("");
                            return {...m, blocks, content};
                        });
                    } else if (part.type === "reasoning-delta") {
                        const chunk = (part as any).textDelta ?? "";
                        if (chunk) {
                            updateAssistant((m) => {
                                const blocks = [...m.blocks];
                                const last = blocks[blocks.length - 1];
                                if (last?.type === "thinking") {
                                    blocks[blocks.length - 1] = {type: "thinking", text: last.text + chunk};
                                } else {
                                    blocks.push({type: "thinking", text: chunk});
                                }
                                return {...m, blocks};
                            });
                        }
                    } else if (part.type === "tool-input-start") {
                        const tc: ToolCall = {
                            id: part.id,
                            name: part.toolName,
                            args: {description: ""},
                            result: null,
                            status: "calling",
                        };
                        updateAssistant((m) => ({
                            ...m,
                            toolCalls: [...m.toolCalls, tc],
                            blocks: [...m.blocks, {type: "tool_call", toolCall: tc}],
                        }));
                    } else if (part.type === "tool-call") {
                        updateAssistant((m) => {
                            const input = part.input as Record<string, unknown>;
                            const mergedArgs = {description: "", ...input} as {
                                description: string;
                                [key: string]: unknown;
                            };
                            const updatedTc = (tc: ToolCall): ToolCall =>
                                tc.id === part.toolCallId ? {...tc, args: mergedArgs} : tc;
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
                        updateAssistant((m) => {
                            const updatedTc = (tc: ToolCall): ToolCall =>
                                tc.id === part.toolCallId
                                    ? {...tc, result: part.output, status: "done" as const}
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
                        const rawErr: any = (part as any).error;
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
                        const usage = (part as any).totalUsage ?? (part as any).usage;
                        if (usage) {
                            console.info("[Tampersloth] tokens", {
                                input: usage.inputTokens,
                                output: usage.outputTokens,
                                cached: usage.cachedInputTokens,
                                reasoning: usage.reasoningTokens,
                            });
                        }
                        // Anything but "stop" means the run was cut short. Without
                        // this the message just ends mid-task and looks finished.
                        if (part.finishReason === "tool-calls") {
                            setError(
                                `Stopped at the ${MAX_AGENT_STEPS}-step limit with more tool calls pending. Send another message to continue.`,
                            );
                        } else if (part.finishReason === "length") {
                            setError("Stopped — the model hit its output token limit mid-response.");
                        } else if (part.finishReason === "content-filter") {
                            setError("Stopped — the response was blocked by a content filter.");
                        }
                    } else if (part.type === "tool-error") {
                        updateAssistant((m) => {
                            const updatedTc = (tc: ToolCall): ToolCall =>
                                tc.id === (part as any).toolCallId
                                    ? {...tc, result: (part as any).error, status: "error" as const}
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
            } catch (err: any) {
                if (err.name === "AbortError" || abortController.signal.aborted) {
                    // intentionally ignored
                } else {
                    setError(err.message ?? "Something went wrong");
                }
            } finally {
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
