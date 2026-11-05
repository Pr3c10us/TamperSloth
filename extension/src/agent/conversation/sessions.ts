import {saveLastThinkingLevel} from "@/agent/agentSettings";
import {isThinkingLevel, type ThinkingLevel} from "@/agent/models/thinkingLevel";
import {browserCall} from "@/agent/tools/browserTools";
import {tabHolder} from "@/agent/tools/tabLease";
import {loadStoredConversation, saveConversation, type StoredConversation} from "@/storage/conversations";
import {requestTitle} from "./chatTitle";
import {createConversationSaver} from "./conversationSaver";
import {clearDraft} from "./drafts";
import type {ChatMessage, ChatSession, ContentBlock} from "./types";

const SAVE_THROTTLE_MS = 700;

// Chats live in this module rather than in a component, so a run keeps
// streaming, saving and driving the tab while the user starts another chat,
// opens one from history, or visits another page. They last as long as the
// panel document does.
const sessions = new Map<string, ChatSession>();
export const runs = new Map<string, AbortController>();
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

export function subscribeSessions(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getSession(id: string): ChatSession | undefined {
    return sessions.get(id);
}

export function getActiveSession(): ChatSession {
    return sessions.get(activeId)!;
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

export function updateSession(id: string, updater: (session: ChatSession) => ChatSession) {
    const previous = sessions.get(id);
    // A discarded chat's run may still be winding down; its updates go nowhere.
    if (!previous) return;
    const next = updater(previous);
    sessions.set(id, next);
    if (next.messages !== previous.messages || next.title !== previous.title
        || next.thinkingLevel !== previous.thinkingLevel) scheduleSave(next);
    notify();
}

export function patchSession(id: string, patch: Partial<Omit<ChatSession, "id">>) {
    updateSession(id, (session) => ({...session, ...patch}));
}

export function updateMessages(id: string, updater: (messages: ChatMessage[]) => ChatMessage[]) {
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
export function finishTaskTabs(conversationId: string) {
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
export function setThinkingLevel(level: ThinkingLevel) {
    patchSession(activeId, {thinkingLevel: level});
    void saveLastThinkingLevel(level).catch((error) => console.warn("[Tampersloth] Could not save thinking level:", error));
}

export function cancelActiveRun() {
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

/** Ids of chats with a run in progress; a new array only when that set changes. */
let runningIds: string[] = [];
export function getRunningIds() {
    const next = [...sessions.values()].filter(s => s.isLoading).map(s => s.id);
    if (next.length !== runningIds.length || next.some((id, i) => id !== runningIds[i])) runningIds = next;
    return runningIds;
}
