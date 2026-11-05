import {deleteAttachments, loadAttachment} from "@/storage/conversations";
import {fileToDataUrl, makeAttachmentFromFile, type PendingAttachment} from "./attachments";
import {getDraft, updateDraft} from "./drafts";
import {buildEditNote} from "./editNote";
import {beforeMessage} from "./historyMessages";
import {getSession, patchSession, updateSession} from "./sessions";
import type {PickedElement} from "./types";

/**
 * Hides a sent message and everything after it, and puts the message back in
 * the composer to change and resend. Nothing is dropped until that send, so the
 * edit can be cancelled. What the agent already did in the browser stays done.
 */
export async function editMessage(conversationId: string, messageId: string) {
    const session = getSession(conversationId);
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
    const current = getSession(conversationId);
    if (!current || current.isLoading) return;
    patchSession(conversationId, {
        error: null,
        editing: {messageId, previousDraft: current.editing?.previousDraft ?? getDraft(conversationId)},
    });
    updateDraft(conversationId, () => ({text: message.content, pickedElements, files, quotes: message.quotes ?? []}));
}

/** Ends an edit without sending: the hidden messages return and the composer gets back what it held. */
export function cancelEdit(conversationId: string) {
    const editing = getSession(conversationId)?.editing;
    if (!editing) return;
    patchSession(conversationId, {editing: undefined});
    updateDraft(conversationId, () => editing.previousDraft);
}

/**
 * On send, drops the message being edited and everything after it, with their
 * stored files. Returns the note telling the model what the new message replaces.
 */
export function commitEdit(conversationId: string): string | undefined {
    const session = getSession(conversationId);
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
