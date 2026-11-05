import {answerPendingAsk, getPendingAsk} from "@/agent/tools/askUserBus";
import {MAX_ATTACHMENTS} from "./attachments";
import {updateDraft} from "./drafts";
import {getSession, updateSession} from "./sessions";
import type {QueuedMessage} from "./types";

/**
 * Holds a message sent while the chat is working, for the run to read before its
 * next step. A plain reply while the agent waits on its own question answers it.
 */
export function queueMessage(conversationId: string, message: Omit<QueuedMessage, "id">) {
    const plainReply = message.text && !message.pickedElements?.length && !message.attachments?.length && !message.quotes?.length;
    if (plainReply && getPendingAsk(conversationId)) {
        answerPendingAsk(conversationId, {label: message.text, custom: true});
        return;
    }
    updateSession(conversationId, (s) => ({...s, queued: [...s.queued, {...message, id: crypto.randomUUID()}]}));
}

/** Puts queued messages back in the composer, ahead of anything typed since. */
export function draftFromQueued(conversationId: string, items: QueuedMessage[]) {
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
    const item = getSession(conversationId)?.queued.find(q => q.id === id);
    if (!item) return;
    updateSession(conversationId, (s) => ({...s, queued: s.queued.filter(q => q.id !== id)}));
    if (edit) draftFromQueued(conversationId, [item]);
}
