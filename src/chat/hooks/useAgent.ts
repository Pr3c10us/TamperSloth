import {useCallback, useSyncExternalStore} from "react";
import {type ModelMessage, isStepCount, streamText} from "ai";
import {formatModelName, getModel, MODELPROVIDERS, type ProviderId} from "../lib/provider.ts";
import {withRateLimits} from "../lib/rateLimit";
import {createAgentTools} from "../lib/tools.ts";
import {loadAttachment, loadStoredConversation, saveAttachments, saveConversation, type StoredConversation} from "../lib/storage.ts";
import {seedAttachmentUrl} from "../lib/attachmentUrls";
import {buildModelMessages} from "../lib/historyMessages";
import {createConversationSaver} from '../lib/conversationSaver';
import SYSTEM_PROMPT from "../lib/prompt.ts";
import type {PendingAttachment} from "../components/AttachmentChip.tsx";
import type {PickedElement} from "../components/PickedElementChip.tsx";
import type {Quote} from "../lib/panelRequests";
import {createToolRuntime} from "../lib/toolRuntime";
import {clip, createStepMessagePreparer, isFailed, serialize, summarizeSelectedElement, sumUsage, usageRecord, type RunMetrics, type UsageRecord} from "../lib/efficiency";
import {createGuidanceGuard, GUIDANCE_RESUME_NOTE} from "../lib/guidanceGuard";
import {loadAgentSettings, runStopReason} from "../lib/agentSettings";
import {agentProviderOptions} from "../lib/providerCompatibility";
import {createReasoningNormalizer, type NormalizedEvent, type ThinkingContent} from "../lib/reasoning";
import {partialReason} from "../lib/toolReason";
import {generateChatTitle, requestTitle} from "../lib/chatTitle";
import {clearDraft} from "../lib/drafts";
import {holdsTab, othersHoldTabs, releaseTabs, tabHolder} from "../lib/tabLease";

export interface StoredAttachment {
    /** Key of the attachment's bytes in IndexedDB; absent on chats saved before attachments were stored. */
    id?: string;
    kind: "image" | "file";
    name: string;
    size: string;
    ext?: string;
    mediaType?: string;
}

async function fileToDataUrl(file: Blob): Promise<string> {
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
    /** Picked elements' HTML: what the model receives. */
    pickedElements?: string[];
    /** Attachment ids of the picked elements' screenshots, by index; shown in the chat only. */
    pickedElementShots?: (string | null)[];
    attachments?: StoredAttachment[];
    /** Page text quoted with "Ask Sloth"; sent ahead of the message's own text. */
    quotes?: Quote[];
    taskState?: string;
    runMetrics?: RunMetrics;
}

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

/** One chat's state. Replaced, never mutated, so it can be a React snapshot. */
export interface ChatSession {
    id: string;
    createdAt: number;
    /** Model-written title; `null` until the first request has been named. */
    title: string | null;
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
}

// Chats live in this module rather than in a component, so a run keeps
// streaming, saving and driving the tab while the user starts another chat,
// opens one from history, or visits another page. They last as long as the
// panel document does.
const sessions = new Map<string, ChatSession>();
const runs = new Map<string, AbortController>();
const listeners = new Set<() => void>();
let activeId = blankSession().id;

/** Chats whose latest messages or title have not been written yet. */
const dirty = new Set<string>();
const pendingSaves = new Map<string, StoredConversation>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const save = createConversationSaver(async (conversation) => {
    await saveConversation(conversation);
    const session = sessions.get(conversation.id);
    if (session && session.messages === conversation.messages && (session.title ?? "") === conversation.title
        && !pendingSaves.has(conversation.id)) {
        dirty.delete(conversation.id);
        evictIfSettled(conversation.id);
    }
}, (error, conversation) => {
    patchSession(conversation.id, {error: `Could not save chat: ${error instanceof Error ? error.message : String(error)}`});
});

function notify() {
    for (const fn of listeners) fn();
}

/**
 * The one chat with nothing sent yet. It is reused rather than replaced, so
 * "New chat" finds its unsent draft again.
 */
function blankSession(): ChatSession {
    for (const session of sessions.values()) {
        if (session.messages.length === 0 && !session.isLoading) return session;
    }
    const session: ChatSession = {id: crypto.randomUUID(), createdAt: Date.now(), title: null, messages: [], isLoading: false, error: null};
    sessions.set(session.id, session);
    return session;
}

function flushSaves() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const batch = [...pendingSaves.values()];
    pendingSaves.clear();
    for (const conversation of batch) save(conversation);
}

// Streaming produces new messages on every delta, so saves are coalesced onto a
// timer that keeps one latest snapshot per chat.
function scheduleSave(session: ChatSession) {
    if (session.messages.length === 0) return;
    dirty.add(session.id);
    pendingSaves.set(session.id, {
        id: session.id,
        title: session.title ?? "",
        messages: session.messages,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
    });
    // A timer already scheduled will pick up this snapshot when it fires.
    if (!saveTimer) saveTimer = setTimeout(flushSaves, SAVE_THROTTLE_MS);
}

window.addEventListener("pagehide", flushSaves);

function updateSession(id: string, updater: (session: ChatSession) => ChatSession) {
    const previous = sessions.get(id);
    // A discarded chat's run may still be winding down; its updates go nowhere.
    if (!previous) return;
    const next = updater(previous);
    sessions.set(id, next);
    if (next.messages !== previous.messages || next.title !== previous.title) scheduleSave(next);
    notify();
}

function patchSession(id: string, patch: Partial<Omit<ChatSession, "id">>) {
    updateSession(id, (session) => ({...session, ...patch}));
}

function updateMessages(id: string, updater: (messages: ChatMessage[]) => ChatMessage[]) {
    updateSession(id, (session) => ({...session, messages: updater(session.messages)}));
}

/** Frees a chat that is off screen, idle and written to disk; history reloads it. */
function evictIfSettled(id: string) {
    const session = sessions.get(id);
    // The blank chat has nothing on disk to come back from.
    if (!session || id === activeId || session.isLoading || dirty.has(id) || session.messages.length === 0) return;
    sessions.delete(id);
    notify();
}

function activate(id: string) {
    const previous = activeId;
    activeId = id;
    notify();
    evictIfSettled(previous);
}

/** Shows the blank chat; any running chat carries on off screen. */
export function startNewChat() {
    const blank = blankSession();
    patchSession(blank.id, {error: null});
    activate(blank.id);
}

/** Shows a chat from history, reusing the live one if it is still in memory. */
export async function openConversation(id: string) {
    if (sessions.has(id)) {
        activate(id);
        return;
    }
    const conversation = await loadStoredConversation(id);
    if (!conversation) throw new Error("This conversation is no longer available.");
    // It may have been opened again while loading.
    if (!sessions.has(id)) {
        const firstRequest = (conversation.messages as ChatMessage[]).find(m => m.role === "user");
        const migrated = (conversation.messages as ChatMessage[]).map((msg) => {
            if (msg.blocks && msg.blocks.length > 0) return msg;
            const blocks: ContentBlock[] = [
                ...(msg.toolCalls || []).map((tc) => ({type: "tool_call" as const, toolCall: tc})),
                ...(msg.content ? [{type: "text" as const, text: msg.content}] : []),
            ];
            return {...msg, blocks};
        });
        sessions.set(id, {
            id,
            createdAt: conversation.createdAt,
            // Chats closed before their title arrived are saved untitled.
            title: conversation.title || (firstRequest && requestTitle(firstRequest.content)) || null,
            messages: migrated,
            isLoading: false,
            error: null,
        });
    }
    activate(id);
}

/** Stops a chat and drops it from memory before it is deleted, so nothing re-saves it. */
export function discardConversation(id: string) {
    runs.get(id)?.abort();
    pendingSaves.delete(id);
    dirty.delete(id);
    clearDraft(id);
    sessions.delete(id);
    if (id === activeId) activeId = blankSession().id;
    notify();
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

function cancel() {
    runs.get(activeId)?.abort();
}

/** Stops a chat's run, whether or not it is on screen. */
export function stopConversation(id: string) {
    runs.get(id)?.abort();
}

// The on-page Stop button, sent from our isolated-world overlay, stops whichever chat drives that tab.
chrome.runtime?.onMessage?.addListener((message, sender) => {
    if (message?.type !== "AGENT_STOP_REQUESTED" || sender.id !== chrome.runtime.id || sender.tab?.id === undefined) return false;
    const holder = tabHolder(sender.tab.id);
    if (holder) stopConversation(holder);
    return false;
});

export function useChatTitle(id: string | null): string | null {
    return useSyncExternalStore(subscribe, () => (id ? sessions.get(id)?.title ?? null : null));
}

/** Ids of chats with a run in progress; a new array only when that set changes. */
let runningIds: string[] = [];
function getRunningIds() {
    const next = [...sessions.values()].filter(s => s.isLoading).map(s => s.id);
    if (next.length !== runningIds.length || next.some((id, i) => id !== runningIds[i])) runningIds = next;
    return runningIds;
}

export function useRunningChats(): string[] {
    return useSyncExternalStore(subscribe, getRunningIds);
}

async function sendMessage(
    conversationId: string,
    text: string,
    providerId: ProviderId,
    apiKey: string,
    modelId?: string,
    elementContext?: PickedElement[],
    attachments?: PendingAttachment[],
    quotes?: Quote[],
) {
    const started = performance.now();
    const startedAt = Date.now();
    const resolvedModelId = modelId ?? MODELPROVIDERS.find(p => p.id === providerId)!.defaultModel;
    const abortController = new AbortController();
    runs.set(conversationId, abortController);
    patchSession(conversationId, {error: null, isLoading: true});

    // In-memory files for this message; earlier messages read theirs back from IndexedDB.
    const sentFiles = new Map<string, File>();
    const storedAttachments: StoredAttachment[] | undefined = attachments?.length
        ? attachments.map((a) => {
            const id = crypto.randomUUID();
            if (a.file) sentFiles.set(id, a.file);
            if (a.url) seedAttachmentUrl(id, a.url);
            return {id, kind: a.kind, name: a.name, size: a.size, ext: a.ext, mediaType: a.mediaType};
        })
        : undefined;
    const shotBlobs = new Map<string, Blob>();
    const pickedElementShots = elementContext?.some(p => p.screenshot)
        ? await Promise.all(elementContext.map(async (p) => {
            if (!p.screenshot) return null;
            const blob = await fetch(p.screenshot).then(r => r.blob()).catch(() => null);
            if (!blob) return null;
            const id = crypto.randomUUID();
            shotBlobs.set(id, blob);
            seedAttachmentUrl(id, p.screenshot);
            return id;
        }))
        : undefined;
    const attachmentsSaved = saveAttachments([...sentFiles, ...shotBlobs].map(([id, blob]) => ({id, conversationId, blob})))
        .catch((error) => patchSession(conversationId, {error: `Could not save attachments: ${error instanceof Error ? error.message : String(error)}`}));

    const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        toolCalls: [],
        blocks: [],
        pickedElements: elementContext?.length ? elementContext.map(p => p.html) : undefined,
        pickedElementShots,
        attachments: storedAttachments,
        quotes: quotes?.length ? quotes : undefined,
    };

    const previous = sessions.get(conversationId)?.messages ?? [];
    const isFirstMessage = !previous.some(m => m.role === "user");
    const updatedMessages = [...previous, userMsg];
    updateMessages(conversationId, () => updatedMessages);

    // Named alongside the run, whichever chat is on screen when it arrives.
    if (isFirstMessage) {
        const fallback = requestTitle(text) || requestTitle(quotes?.[0]?.text ?? "") || storedAttachments?.[0]?.name || "Untitled";
        void (async () => {
            let named = "";
            try {
                named = await generateChatTitle(getModel(providerId, apiKey, resolvedModelId), providerId, {
                    text,
                    attachmentNames: storedAttachments?.map(a => a.name),
                    pickedElements: elementContext?.length,
                    quotes: quotes?.map(q => q.text),
                });
            } catch (error) {
                console.warn("[Tampersloth] chat title failed", error);
            }
            patchSession(conversationId, {title: named || fallback});
        })();
    }
    await attachmentsSaved;

    const modelMessages = await buildModelMessages(updatedMessages, {
        summarizeElement: summarizeSelectedElement,
        loadAttachment: async (a) => {
            if (!a.id) return null;
            const blob = sentFiles.get(a.id) ?? await loadAttachment(a.id).catch(() => null);
            return blob ? fileToDataUrl(blob) : null;
        },
    });

    const assistantId = crypto.randomUUID();
    const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) =>
        updateMessages(conversationId, (prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));
    updateMessages(conversationId, (prev) => [
        ...prev,
        {id: assistantId, role: "assistant", content: "", toolCalls: [], blocks: [],
            runMetrics: {providerId, modelId: resolvedModelId, startedAt,
                steps: [], tools: [], compactedResults: 0, elapsedMs: 0}},
    ]);

    try {
        const model = withRateLimits(getModel(providerId, apiKey, resolvedModelId),
            {conversationId, modelName: formatModelName(resolvedModelId)});
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
                    patchSession(conversationId, {error: errMsg});
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
                        patchSession(conversationId, {
                            error: `${stopReason || `Reached the ${settings.maxSteps}-step limit.`} Work may be incomplete. Send another message to continue.`,
                        });
                    } else if (part.finishReason === "length") {
                        patchSession(conversationId, {error: "Stopped — the model hit its output token limit mid-response."});
                    } else if (part.finishReason === "content-filter") {
                        patchSession(conversationId, {error: "Stopped — the response was blocked by a content filter."});
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
            patchSession(conversationId, {error: err.message ?? "Something went wrong"});
        }
    } finally {
        // Keep the cursor through idle tool pauses, then remove the run's decorations
        // before handing the tab to the next waiting chat. Cleanup is browser-wide,
        // so it is skipped while another chat still holds a tab.
        runs.delete(conversationId);
        if (holdsTab(conversationId) && !othersHoldTabs(conversationId)) {
            await chrome.runtime.sendMessage({type:'BROWSER_RUN_END'}).catch(()=>{});
        }
        releaseTabs(conversationId);
        // A stopped run never receives "finish", so total it from completed steps,
        // and any reasoning it was in the middle of is over.
        const endedAt = Date.now();
        updateAssistant(m => ({...m, blocks: closeThinking(m.blocks, endedAt), runMetrics: m.runMetrics
            ? {...m.runMetrics, total: m.runMetrics.total ?? sumUsage(m.runMetrics.steps),
                elapsedMs: Math.round(performance.now() - started)} : undefined}));
        patchSession(conversationId, {isLoading: false});
    }
}

type SendArgs = Parameters<typeof sendMessage> extends [string, ...infer Rest] ? Rest : never;

export function useAgent() {
    const session = useSyncExternalStore(subscribe, () => sessions.get(activeId)!);
    const send = useCallback((...args: SendArgs) => sendMessage(session.id, ...args), [session.id]);
    return {
        messages: session.messages,
        title: session.title,
        isLoading: session.isLoading,
        error: session.error,
        conversationId: session.id,
        sendMessage: send,
        cancel,
        clear: startNewChat,
        loadConversation: openConversation,
    };
}
