import {readChat, readChatSummaries, writeChat, removeChat, writeAttachments, readAttachment, removeAttachments, type ConversationSummary, type StoredAttachmentData, type StoredConversation} from "./conversationDB";

export type {ConversationSummary, StoredConversation} from "./conversationDB";

export async function loadConversationHistory(): Promise<ConversationSummary[]> {
    return (await readChatSummaries()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadStoredConversation(id: string): Promise<StoredConversation | null> {
    return readChat(id);
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
    // One conversation per record; no chrome.storage.onChanged payloads and no
    // read/modify/write of other chats. Transcript and summary commit atomically.
    await writeChat(conversation);
}

/** Attachment bytes are written once, when the message is sent; transcripts reference them by id. */
export async function saveAttachments(records: StoredAttachmentData[]): Promise<void> {
    if (records.length) await writeAttachments(records);
}

export async function loadAttachment(id: string): Promise<Blob | null> {
    return readAttachment(id);
}

export async function deleteAttachments(ids: string[]): Promise<void> {
    if (ids.length) await removeAttachments(ids);
}

export async function deleteConversation(id: string): Promise<void> {
    await removeChat(id);
}
