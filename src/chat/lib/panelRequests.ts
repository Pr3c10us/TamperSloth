/** Text the user chose to quote from a page, shown above the input and sent with the message. */
export interface Quote {
    text: string;
    url?: string;
    title?: string;
}

/**
 * Work handed from outside the panel (the page's context menu, the drawing
 * overlay) to the chat open for a tab.
 */
export type PanelRequest =
    | { kind: "pick" }
    | { kind: "draw" }
    | { kind: "dictate" }
    | ({ kind: "quote" } & Quote)
    | { kind: "image"; dataUrl: string; name: string };

/**
 * Requests wait in session storage, one key each, so they survive the panel
 * still opening (or showing another page) and are never dropped by a racing
 * write. Keys sort in the order they were made.
 */
export function panelRequestPrefix(tabId: number) {
    return `ts_panel_request_${tabId}_`;
}

export async function queuePanelRequest(tabId: number, request: PanelRequest) {
    const key = `${panelRequestPrefix(tabId)}${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await chrome.storage.session.set({[key]: request});
}

/** Removes and returns a tab's waiting requests, oldest first. */
export async function takePanelRequests(tabId: number): Promise<PanelRequest[]> {
    const prefix = panelRequestPrefix(tabId);
    const stored = await chrome.storage.session.get(null);
    const keys = Object.keys(stored).filter(key => key.startsWith(prefix)).sort();
    if (!keys.length) return [];
    await chrome.storage.session.remove(keys);
    return keys.map(key => stored[key] as PanelRequest);
}

/** Whether a storage change added a request for this tab. */
export function hasNewPanelRequest(changes: Record<string, chrome.storage.StorageChange>, tabId: number) {
    const prefix = panelRequestPrefix(tabId);
    return Object.entries(changes).some(([key, change]) => key.startsWith(prefix) && change.newValue !== undefined);
}
