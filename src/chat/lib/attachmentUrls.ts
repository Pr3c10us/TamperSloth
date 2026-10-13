import {loadAttachment} from "./storage";

// Object URLs only live as long as the panel document, so transcripts store an
// attachment id and the URL is minted from IndexedDB each time the panel loads.
const urls = new Map<string, Promise<string | null>>();

/** Reuse the composer's preview URL for a just-sent attachment instead of re-reading it. */
export function seedAttachmentUrl(id: string, url: string) {
    urls.set(id, Promise.resolve(url));
}

export function attachmentUrl(id: string): Promise<string | null> {
    let url = urls.get(id);
    if (!url) {
        url = loadAttachment(id)
            .then(blob => (blob ? URL.createObjectURL(blob) : null))
            .catch(() => null);
        urls.set(id, url);
    }
    return url;
}
