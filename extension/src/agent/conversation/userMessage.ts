import {clip, serialize} from "@/agent/tools/toolOutput";
import type {Quote} from "@/shared/panelRequests";
import {loadAttachment, saveAttachments} from "@/storage/conversations";
import {seedAttachmentUrl} from "./attachmentUrls";
import {fileToDataUrl, type PendingAttachment} from "./attachments";
import {buildModelMessages} from "./historyMessages";
import {patchSession} from "./sessions";
import type {ChatMessage, PickedElement, StoredAttachment} from "./types";

export function summarizeSelectedElement(html: string): string {
    const element = new DOMParser().parseFromString(html, "text/html").body.firstElementChild;
    if (!element) return clip(html, 1500);
    return serialize({tag: element.tagName.toLowerCase(),
        attributes: Object.fromEntries(["id", "class", "role", "aria-label", "name", "href", "type"].filter(name => element.hasAttribute(name))
            .map(name => [name, clip(element.getAttribute(name)!, 160)])),
        text: clip(element.textContent?.trim() ?? "", 400),
        children: Array.from(element.children).slice(0, 6).map(child => child.tagName.toLowerCase()),
        hint: "Selected-element summary; inspect the live DOM for additional detail."});
}

/** Builds a user message and starts storing its files and picked-element screenshots. */
export async function prepareUserMessage(
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

export function toModelMessages(messages: ChatMessage[], files: Map<string, Blob>) {
    return buildModelMessages(messages, {
        summarizeElement: summarizeSelectedElement,
        loadAttachment: async (a) => {
            if (!a.id) return null;
            const blob = files.get(a.id) ?? await loadAttachment(a.id).catch(() => null);
            return blob ? fileToDataUrl(blob) : null;
        },
    });
}
