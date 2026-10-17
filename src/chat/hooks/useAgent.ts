import {useCallback, useMemo, useSyncExternalStore} from "react";
import {type ModelMessage, generateText, isStepCount, streamText} from "ai";
import {formatModelName, getModel, MODELPROVIDERS, type ModelOptions, type ProviderId} from "../lib/provider.ts";
import {getApiKeys, VERTEX_PROJECT_KEY} from "../../settings/lib/storage";
import {withRateLimits} from "../lib/rateLimit";
import {createAgentTools} from "../lib/tools.ts";
import {browserCall, setTaskStatus} from "../lib/browserTools";
import {deleteAttachments, loadAttachment, loadStoredConversation, readFile, saveAttachments, saveConversation, type StoredConversation} from "../lib/storage.ts";
import {seedAttachmentUrl} from "../lib/attachmentUrls";
import {buildEditNote} from "../lib/editNote";
import {asMidRun, beforeMessage, buildModelMessages, withInjected, type InjectedMessages} from "../lib/historyMessages";
import {createConversationSaver} from '../lib/conversationSaver';
import SYSTEM_PROMPT from "../lib/prompt.ts";
import {makeAttachmentFromFile, MAX_ATTACHMENTS, type PendingAttachment} from "../components/AttachmentChip.tsx";
import type {PickedElement} from "../components/PickedElementChip.tsx";
import type {Quote} from "../lib/panelRequests";
import {createToolRuntime} from "../lib/toolRuntime";
import {clip, createStepMessagePreparer, isFailed, serialize, summarizeSelectedElement, sumUsage, usageRecord, type RunMetrics, type UsageRecord} from "../lib/efficiency";
import {createGuidanceGuard, GUIDANCE_RESUME_NOTE} from "../lib/guidanceGuard";
import {loadAgentSettings, runStopReason, saveLastThinkingLevel} from "../lib/agentSettings";
import {isThinkingLevel, type ThinkingLevel} from "../lib/thinkingLevel";
import {agentProviderOptions} from "../lib/providerCompatibility";
import {createReasoningNormalizer, type NormalizedEvent, type ThinkingContent} from "../lib/reasoning";
import {partialReason} from "../lib/toolReason";
import {generateChatTitle, requestTitle, titleProviderOptions} from "../lib/chatTitle";
import type {ToolSafety} from "../lib/safetyGate";
import {clearDraft, getDraft, updateDraft, type Draft} from "../lib/drafts";
import {answerPendingAsk, getPendingAsk} from "../lib/askUserBus";
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
    /** Safety screening around this call: flagged content, approvals and blocks. */
    safety?: ToolSafety;
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
    /** The user stopped this reply before it finished. */
    stopped?: boolean;
    /** Not shown: tells the model this message replaced an edited one, and what the dropped turns did. */
    editNote?: string;
}

/** A message sent while the chat's run was working; the run reads it before its next step. */
export interface QueuedMessage {
    id: string;
    text: string;
    pickedElements?: PickedElement[];
    attachments?: PendingAttachment[];
    quotes?: Quote[];
    /** The model chosen when it was sent, for when it has to start a run of its own. */
    model: { providerId: ProviderId; apiKey: string; modelId?: string };
}

const SAVE_THROTTLE_MS = 700;

// Anthropic is the only provider here that needs explicit cache breakpoints —
// OpenAI, DeepSeek, Kimi, Grok and Gemini cache automatically server-side.
// providerOptions are namespaced per provider, so this is inert for the others.
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
    /** Chosen for this chat; `undefined` follows the default in settings. */
    thinkingLevel?: ThinkingLevel;
    isLoading: boolean;
    error: string | null;
    /** Sent while the run was working, waiting for its next step. */
    queued: QueuedMessage[];
    /**
     * Set while a sent message is being edited: it and everything after it are
     * hidden, and dropped for good on the next send. `previousDraft` is what the
     * composer held before, restored if the edit is cancelled.
     */
    editing?: { messageId: string; previousDraft: Draft };
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
        && session.thinkingLevel === conversation.thinkingLevel && !pendingSaves.has(conversation.id)) {
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
    const session: ChatSession = {id: crypto.randomUUID(), createdAt: Date.now(), title: null, messages: [], isLoading: false, error: null, queued: []};
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
        thinkingLevel: session.thinkingLevel,
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
    if (next.messages !== previous.messages || next.title !== previous.title
        || next.thinkingLevel !== previous.thinkingLevel) scheduleSave(next);
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
    // The blank chat has nothing on disk to come back from; queued messages and edits live only here.
    if (!session || id === activeId || session.isLoading || dirty.has(id) || session.messages.length === 0
        || session.queued.length || session.editing) return;
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
    // Unset, it follows the last level picked in any chat.
    patchSession(blank.id, {error: null, thinkingLevel: undefined});
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
            thinkingLevel: isThinkingLevel(conversation.thinkingLevel) ? conversation.thinkingLevel : undefined,
            isLoading: false,
            error: null,
            queued: [],
        });
    }
    activate(id);
}

/** Closes the tabs a chat's task opened, except retained ones. Never touches tabs the user already had. */
function finishTaskTabs(conversationId: string) {
    return browserCall('tabs', {action: 'finish', conversationId}).catch(() => {});
}

/** Stops a chat and drops it from memory before it is deleted, so nothing re-saves it. */
export function discardConversation(id: string) {
    runs.get(id)?.abort();
    void finishTaskTabs(id);
    pendingSaves.delete(id);
    dirty.delete(id);
    clearDraft(id);
    sessions.delete(id);
    if (id === activeId) activeId = blankSession().id;
    notify();
}

/** Sets the thinking level the active chat's next runs use, and the one new chats start with. */
function setThinkingLevel(level: ThinkingLevel) {
    patchSession(activeId, {thinkingLevel: level});
    void saveLastThinkingLevel(level).catch((error) => console.warn("[Tampersloth] Could not save thinking level:", error));
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

/**
 * Holds a message sent while the chat is working, for the run to read before its
 * next step. A plain reply while the agent waits on its own question answers it.
 */
function queueMessage(conversationId: string, message: Omit<QueuedMessage, "id">) {
    const plainReply = message.text && !message.pickedElements?.length && !message.attachments?.length && !message.quotes?.length;
    if (plainReply && getPendingAsk(conversationId)) {
        answerPendingAsk(conversationId, {label: message.text, custom: true});
        return;
    }
    updateSession(conversationId, (s) => ({...s, queued: [...s.queued, {...message, id: crypto.randomUUID()}]}));
}

/** Puts queued messages back in the composer, ahead of anything typed since. */
function draftFromQueued(conversationId: string, items: QueuedMessage[]) {
    if (!items.length) return;
    updateDraft(conversationId, (d) => ({
        text: [...items.map(q => q.text), d.text].filter(Boolean).join("\n\n"),
        pickedElements: [...items.flatMap(q => q.pickedElements ?? []), ...d.pickedElements],
        files: [...items.flatMap(q => q.attachments ?? []), ...d.files].slice(0, MAX_ATTACHMENTS),
        quotes: [...items.flatMap(q => q.quotes ?? []), ...d.quotes],
    }));
}

/** Drops a queued message before the run reads it; `edit` moves it back to the composer instead. */
export function unqueueMessage(conversationId: string, id: string, edit = false) {
    const item = sessions.get(conversationId)?.queued.find(q => q.id === id);
    if (!item) return;
    updateSession(conversationId, (s) => ({...s, queued: s.queued.filter(q => q.id !== id)}));
    if (edit) draftFromQueued(conversationId, [item]);
}

/**
 * Hides a sent message and everything after it, and puts the message back in
 * the composer to change and resend. Nothing is dropped until that send, so the
 * edit can be cancelled. What the agent already did in the browser stays done.
 */
export async function editMessage(conversationId: string, messageId: string) {
    const session = sessions.get(conversationId);
    const message = session?.messages.find(m => m.id === messageId);
    if (!session || !message || message.role !== "user" || session.isLoading) return;
    // Files come back from storage as new Files, so the resend stores them under new ids.
    const files = (await Promise.all((message.attachments ?? []).map(async (a) => {
        const blob = a.id ? await loadAttachment(a.id).catch(() => null) : null;
        return blob ? makeAttachmentFromFile(new File([blob], a.name, {type: a.mediaType ?? blob.type})) : null;
    }))).filter((a): a is PendingAttachment => a !== null);
    const pickedElements: PickedElement[] = await Promise.all((message.pickedElements ?? []).map(async (html, i) => {
        const shotId = message.pickedElementShots?.[i];
        const shot = shotId ? await loadAttachment(shotId).catch(() => null) : null;
        return {html, screenshot: shot ? await fileToDataUrl(shot) : null};
    }));
    const current = sessions.get(conversationId);
    if (!current || current.isLoading) return;
    patchSession(conversationId, {
        error: null,
        editing: {messageId, previousDraft: current.editing?.previousDraft ?? getDraft(conversationId)},
    });
    updateDraft(conversationId, () => ({text: message.content, pickedElements, files, quotes: message.quotes ?? []}));
}

/** Ends an edit without sending: the hidden messages return and the composer gets back what it held. */
export function cancelEdit(conversationId: string) {
    const editing = sessions.get(conversationId)?.editing;
    if (!editing) return;
    patchSession(conversationId, {editing: undefined});
    updateDraft(conversationId, () => editing.previousDraft);
}

/**
 * On send, drops the message being edited and everything after it, with their
 * stored files. Returns the note telling the model what the new message replaces.
 */
function commitEdit(conversationId: string): string | undefined {
    const session = sessions.get(conversationId);
    if (!session?.editing) return undefined;
    const kept = beforeMessage(session.messages, session.editing.messageId);
    const dropped = session.messages.slice(kept.length);
    updateSession(conversationId, (s) => ({...s, messages: kept, editing: undefined}));
    const ids = dropped.flatMap(m => [...(m.attachments ?? []).map(a => a.id), ...(m.pickedElementShots ?? [])])
        .filter((id): id is string => Boolean(id));
    void deleteAttachments(ids).catch((error) => console.warn("[Tampersloth] Could not delete edited-out attachments:", error));
    const [original, ...after] = dropped;
    return original ? buildEditNote(original.content, after) : undefined;
}

/** Builds a user message and starts storing its files and picked-element screenshots. */
async function prepareUserMessage(
    conversationId: string,
    text: string,
    elementContext?: PickedElement[],
    attachments?: PendingAttachment[],
    quotes?: Quote[],
) {
    // In-memory files for this message; earlier messages read theirs back from IndexedDB.
    const sentFiles = new Map<string, Blob>();
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
    const saved = saveAttachments([...sentFiles, ...shotBlobs].map(([id, blob]) => ({id, conversationId, blob})))
        .catch((error) => patchSession(conversationId, {error: `Could not save attachments: ${error instanceof Error ? error.message : String(error)}`}));

    const message: ChatMessage = {
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
    return {message, files: sentFiles, saved};
}

function toModelMessages(messages: ChatMessage[], files: Map<string, Blob>) {
    return buildModelMessages(messages, {
        summarizeElement: summarizeSelectedElement,
        loadAttachment: async (a) => {
            if (!a.id) return null;
            const blob = files.get(a.id) ?? await loadAttachment(a.id).catch(() => null);
            return blob ? fileToDataUrl(blob) : null;
        },
    });
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
    // Mid-run, the message waits for the run's next step instead of starting another run.
    if (sessions.get(conversationId)?.isLoading) {
        queueMessage(conversationId, {text, pickedElements: elementContext, attachments, quotes, model: {providerId, apiKey, modelId}});
        return;
    }
    const started = performance.now();
    const startedAt = Date.now();
    const resolvedModelId = modelId ?? MODELPROVIDERS.find(p => p.id === providerId)!.defaultModel;
    const abortController = new AbortController();
    runs.set(conversationId, abortController);
    let failed = false;
    patchSession(conversationId, {error: null, isLoading: true});
    const editNote = commitEdit(conversationId);
    const modelOptions: ModelOptions = providerId === "vertex"
        ? {vertexProject: (await getApiKeys().catch((): Record<string, string> => ({})))[VERTEX_PROJECT_KEY]}
        : {};

    const {message: userMsg, files: sentFiles, saved: attachmentsSaved} =
        await prepareUserMessage(conversationId, text, elementContext, attachments, quotes);
    const storedAttachments = userMsg.attachments;
    if (editNote) userMsg.editNote = editNote;

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
                named = await generateChatTitle(getModel(providerId, apiKey, resolvedModelId, undefined, modelOptions), providerId, {
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

    const modelMessages = await toModelMessages(updatedMessages, sentFiles);

    // Changes when a message the user sends mid-run splits the reply on screen.
    let assistantId = crypto.randomUUID();
    const updateAssistant = (updater: (msg: ChatMessage) => ChatMessage) =>
        updateMessages(conversationId, (prev) => prev.map((m) => (m.id === assistantId ? updater(m) : m)));
    updateMessages(conversationId, (prev) => [
        ...prev,
        {id: assistantId, role: "assistant", content: "", toolCalls: [], blocks: [],
            runMetrics: {providerId, modelId: resolvedModelId, startedAt,
                steps: [], tools: [], compactedResults: 0, elapsedMs: 0}},
    ]);
    // Shows messages the user sent mid-run once the stream reaches their step; set up with the run.
    let showSent = () => {};
    // The part of the reply now being written: its first step and when it began.
    let segment = {step: 0, startedAt};

    try {
        const model = withRateLimits(getModel(providerId, apiKey, resolvedModelId, undefined, modelOptions),
            {conversationId, modelName: formatModelName(resolvedModelId)});
        const settings = await loadAgentSettings();
        const archived = new Set<string>();
        const prepareMessages = createStepMessagePreparer(providerId, archived);
        let stopReason = "";
        let stepContext = {activeTools: 0, contextChars: 0, recordedAt: startedAt};
        const metrics: RunMetrics = {providerId, modelId: resolvedModelId, startedAt,
            steps: [], tools: [], compactedResults: 0, elapsedMs: 0};
        // Each part of a reply split by mid-run messages shows the steps, tokens and time it covered.
        const metricsFor = (from: number, to: number | undefined, since: number, until = Date.now()): RunMetrics => {
            if (from === 0 && to === undefined) return {...metrics, steps: [...metrics.steps], tools: [...metrics.tools]};
            const steps = metrics.steps.slice(from, to);
            return {...metrics, startedAt: since, steps, tools: [...metrics.tools],
                total: steps.length ? sumUsage(steps) : undefined, elapsedMs: until - since};
        };
        const currentMetrics = () => metricsFor(segment.step, undefined, segment.startedAt);
        // Screening reports can arrive before the call's own stream part; they wait here until it does.
        const safetyById = new Map<string, ToolSafety>();
        const withSafety = (tc: ToolCall): ToolCall => {
            const safety = safetyById.get(tc.id);
            return safety ? {...tc, safety: {...tc.safety, ...safety}} : tc;
        };
        const reportSafety = (id: string, safety: ToolSafety) => {
            safetyById.set(id, {...safetyById.get(id), ...safety});
            updateAssistant(m => m.toolCalls.some(tc => tc.id === id) ? {
                ...m,
                toolCalls: m.toolCalls.map(tc => tc.id === id ? withSafety(tc) : tc),
                blocks: m.blocks.map(b => b.type === "tool_call" && b.toolCall.id === id ? {type: "tool_call" as const, toolCall: withSafety(b.toolCall)} : b),
            } : m);
        };
        // The screener judges actions against what the user asked for, including a request's earlier turns.
        let userRequest = [...updatedMessages.filter(m => m.role === "user").slice(-3, -1).map(m => `Earlier: ${clip(m.content, 600)}`),
            ...(quotes ?? []).map(q => `Quoted from the page: ${clip(q.text, 400)}`), text].filter(Boolean).join("\n");
        const runtime = createToolRuntime(createAgentTools({conversationId, abortSignal: abortController.signal}), {
            request: text,
            safety: {
                conversationId,
                request: () => userRequest,
                mode: settings.actionApproval,
                screen: async (instructions, prompt, signal) => (await generateText({
                    model, instructions, prompt, abortSignal: signal, maxRetries: 1,
                    providerOptions: titleProviderOptions(providerId),
                })).text,
                onSafety: reportSafety,
                readScript: (path) => readFile(conversationId, path),
            },
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
                tabContext = serialize({tabId, url: tab.url, title: tab.title}) + "\nThis is the working tab: make the user's requested result here (navigate it if the work belongs on another site), and keep other tabs for references.";
            }
        } catch { /* Browsing tools report actionable permission/tab errors. */ }
        // A task paused for the user's answer resumes with the tabs, group and notes it already had.
        const task = await browserCall('tabs', {action: 'list', conversationId}).then(r => r.task, () => undefined);
        if (task) void setTaskStatus(conversationId, 'working');
        if (task) tabContext += `
This task's tabs (open from earlier in this chat; reuse them, and finish when done): ${serialize(task)}`;

        const providerOptions = agentProviderOptions(providerId,
            sessions.get(conversationId)?.thinkingLevel ?? settings.thinkingLevel, resolvedModelId);

        // Instructions accept a system message with providerOptions, so
        // Anthropic can cache tools and the trusted system prompt together.
        const systemMessage: ModelMessage = {
            role: "system",
            content: SYSTEM_PROMPT + (runtime.initialGuidance ? "\n" + runtime.initialGuidance : ""),
            providerOptions: ANTHROPIC_CACHE_BREAKPOINT,
        };

        const guard = createGuidanceGuard();
        // Messages the user sent mid-run: the model gets them before its next step,
        // and the chat shows them once the stream reaches that step.
        const injected: InjectedMessages[] = [];
        // Each batch keeps how many steps had finished when the model read it: where the reply splits.
        const unshown: { step: number; messages: ChatMessage[] }[] = [];
        const readQueued = async (at: number) => {
            const queued = sessions.get(conversationId)?.queued ?? [];
            if (!queued.length || abortController.signal.aborted) return;
            patchSession(conversationId, {queued: []});
            const prepared = await Promise.all(queued.map(q =>
                prepareUserMessage(conversationId, q.text, q.pickedElements, q.attachments, q.quotes)));
            await Promise.all(prepared.map(p => p.saved));
            const messages = await Promise.all(prepared.map(p => toModelMessages([p.message], p.files)));
            injected.push({at, messages: messages.flat().map(asMidRun)});
            unshown.push({step: metrics.steps.length, messages: prepared.map(p => p.message)});
            userRequest += queued.map(q => `\nAdded while working: ${clip(q.text, 600)}`).join("");
        };
        // The reply so far ends where the user's messages arrived and resumes after them.
        showSent = () => {
            if (!unshown.length) return;
            const batches = unshown.splice(0);
            const sent = batches.flatMap(b => b.messages);
            const current = sessions.get(conversationId)?.messages.find(m => m.id === assistantId);
            if (!current?.blocks.length) {
                updateMessages(conversationId, (prev) => {
                    const index = prev.findIndex(m => m.id === assistantId);
                    return index < 0 ? [...prev, ...sent] : [...prev.slice(0, index), ...sent, ...prev.slice(index)];
                });
                return;
            }
            const nextId = crypto.randomUUID();
            const endedAt = Date.now();
            // Steps can finish before the stream shows the split, so both parts are measured from the boundary.
            const boundary = Math.max(segment.step, batches[0].step);
            const ended = metricsFor(segment.step, boundary, segment.startedAt, endedAt);
            segment = {step: boundary, startedAt: endedAt};
            updateMessages(conversationId, (prev) => prev.flatMap((m): ChatMessage[] => m.id !== assistantId ? [m] : [
                {...m, blocks: closeThinking(m.blocks, endedAt), runMetrics: ended},
                ...sent,
                {id: nextId, role: "assistant", content: "", toolCalls: [], blocks: [], runMetrics: currentMetrics(), taskState: m.taskState},
            ]));
            assistantId = nextId;
        };
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
                prepareStep: async ({initialMessages, responseMessages}) => {
                    await readQueued(responseMessages.length);
                    // Rebuild from the original transcript: v7 otherwise carries
                    // compacted projections and cache breakpoints into later steps.
                    const messages = [...initialMessages, ...withInjected(responseMessages, injected)];
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
                    updateAssistant(m => ({...m, runMetrics: currentMetrics()}));
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
                // Every part of the previous step has been shown by the time the next one starts.
                if (part.type === "start-step") showSent();
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
                            const tc: ToolCall = withSafety({id: part.toolCallId, name: part.toolName, args: input,
                                result: null, status: "calling", startedAt: Date.now()});
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
                        updateAssistant(m => ({...m, runMetrics: currentMetrics()}));
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
                passMessages = [...passMessages, ...withInjected((await result.response).messages, injected),
                    {role: "user", content: GUIDANCE_RESUME_NOTE}];
                injected.length = 0;
                continue;
            }
            flushHeld();
            break;
        }
    } catch (err: any) {
        failed = true;
        if (err.name === "AbortError" || abortController.signal.aborted) {
            // intentionally ignored
        } else {
            patchSession(conversationId, {error: err.message ?? "Something went wrong"});
        }
    } finally {
        // Read by the model but stopped before their step began.
        showSent();
        // A stopped or failed task can't finish its own tabs: close the disposable ones, keeping retained tabs.
        if (failed || abortController.signal.aborted) await finishTaskTabs(conversationId);
        // Tabs still open at a normal end mean the task waits on the user's reply.
        else await setTaskStatus(conversationId, 'waiting');
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
        const stopped = abortController.signal.aborted;
        updateAssistant(m => ({...m, ...(stopped ? {stopped: true} : {}), blocks: closeThinking(m.blocks, endedAt), runMetrics: m.runMetrics
            ? {...m.runMetrics, total: m.runMetrics.total ?? sumUsage(m.runMetrics.steps),
                elapsedMs: segment.step === 0 ? Math.round(performance.now() - started) : endedAt - segment.startedAt} : undefined}));
        patchSession(conversationId, {isLoading: false});
        const waiting = sessions.get(conversationId)?.queued ?? [];
        if (waiting.length) {
            patchSession(conversationId, {queued: []});
            if (failed || stopped) {
                // A stop means stop: what was waiting goes back to the composer instead of starting a run.
                draftFromQueued(conversationId, waiting);
            } else {
                // The run ended without another step to read them: the first starts the next run, which reads the rest at once.
                const [first, ...rest] = waiting;
                void sendMessage(conversationId, first.text, first.model.providerId, first.model.apiKey, first.model.modelId,
                    first.pickedElements, first.attachments, first.quotes);
                if (rest.length) updateSession(conversationId, (s) => ({...s, queued: [...rest, ...s.queued]}));
            }
        }
    }
}

type SendArgs = Parameters<typeof sendMessage> extends [string, ...infer Rest] ? Rest : never;

export function useAgent() {
    const session = useSyncExternalStore(subscribe, () => sessions.get(activeId)!);
    const send = useCallback((...args: SendArgs) => sendMessage(session.id, ...args), [session.id]);
    // While a message is being edited, it and everything after it are hidden.
    const messages = useMemo(() => beforeMessage(session.messages, session.editing?.messageId),
        [session.messages, session.editing?.messageId]);
    const edit = useCallback((messageId: string) => editMessage(session.id, messageId), [session.id]);
    return {
        messages,
        queued: session.queued,
        /** A sent message is back in the composer, hiding it and everything after it. */
        editing: Boolean(session.editing),
        editMessage: edit,
        cancelEdit: () => cancelEdit(session.id),
        unqueueMessage: (id: string, edit?: boolean) => unqueueMessage(session.id, id, edit),
        title: session.title,
        isLoading: session.isLoading,
        error: session.error,
        thinkingLevel: session.thinkingLevel,
        setThinkingLevel,
        conversationId: session.id,
        sendMessage: send,
        cancel,
        clear: startNewChat,
        loadConversation: openConversation,
    };
}
