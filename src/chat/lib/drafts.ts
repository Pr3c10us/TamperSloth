import {useSyncExternalStore} from "react";
import type {PickedElement} from "../components/PickedElementChip";
import type {PendingAttachment} from "../components/AttachmentChip";
import {clearPickedMarkers} from "../hooks/useElementPicker";

/** What the composer holds for one chat before it is sent. */
export interface Draft {
    text: string;
    pickedElements: PickedElement[];
    files: PendingAttachment[];
}

const EMPTY: Draft = {text: "", pickedElements: [], files: []};

// Kept per chat for the panel's lifetime, so unsent work survives switching
// chats or pages. Keyed by conversation id, so a chat evicted from memory finds
// its draft again when reopened from history.
const drafts = new Map<string, Draft>();
const listeners = new Set<() => void>();
const tabId = Number(new URLSearchParams(window.location.search).get("tabId")) || 0;

function notify() {
    for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function getDraft(id: string): Draft {
    return drafts.get(id) ?? EMPTY;
}

export function updateDraft(id: string, updater: (draft: Draft) => Draft) {
    const next = updater(getDraft(id));
    if (!next.text && !next.pickedElements.length && !next.files.length) drafts.delete(id);
    else drafts.set(id, next);
    notify();
}

/** Empties a chat's draft, and its marks on the page, once it is sent or deleted. */
export function clearDraft(id: string) {
    const draft = drafts.get(id);
    if (!draft) return;
    drafts.delete(id);
    if (draft.pickedElements.length) clearPickedMarkers(tabId, id);
    notify();
}

export function useDraft(id: string): Draft {
    return useSyncExternalStore(subscribe, () => getDraft(id));
}
