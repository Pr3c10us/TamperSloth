import {plural} from "@/shared/plural";
import type {BackgroundScript} from "./types";
import {queuePanelRequest} from "@/shared/panelRequests";
import {scriptReloadPatterns} from "./userscript";

export const RUN_AT_LABELS: Record<BackgroundScript["runAt"], string> = {
    document_start: "Before the page loads",
    document_end: "When the HTML is ready",
    document_idle: "After the page loads",
};

/** Opens a saved script's source in a full browser tab, where it has room to be read. */
export function openScriptViewer(id: string): void {
    void chrome.tabs.create({url: chrome.runtime.getURL(`index.html#/scripts/${encodeURIComponent(id)}`)});
}

/**
 * Opens this tab's side panel on the chat a script was made in, beside its code.
 * Call it straight from the click: sidePanel.open needs the user gesture, so
 * nothing is awaited before it, as with the toolbar button.
 */
export function openChatInPanel(tab: chrome.tabs.Tab, conversationId: string): void {
    if (tab.id === undefined) return;
    void chrome.sidePanel.setOptions({tabId: tab.id, path: `index.html?tabId=${tab.id}`, enabled: true});
    void chrome.sidePanel.open({tabId: tab.id, windowId: tab.windowId});
    void queuePanelRequest(tab.id, {kind: "chat", conversationId});
}

/**
 * Reloads every open tab covered by any of the scripts' URL patterns, so a
 * pause, delete or import takes effect wherever it applies. The background
 * re-registers scripts before reloading. Resolves to how many tabs reloaded.
 */
export async function reloadTabsForScripts(scripts: BackgroundScript[]): Promise<number> {
    const patterns = [...new Set(scripts.flatMap(scriptReloadPatterns))];
    if (patterns.length === 0) return 0;
    try {
        const res = await chrome.runtime.sendMessage({type: "RELOAD_SCRIPT_TABS", patterns});
        return typeof res?.count === "number" ? res.count : 0;
    } catch {
        return 0;
    }
}

export const reloadTabsForScript = (script: BackgroundScript) => reloadTabsForScripts([script]);

/** Toast copy for how many tabs a change reloaded. */
export const reloadedNote = (count: number) =>
    count > 0 ? `Reloaded ${plural(count, "matching tab")} to apply it.` : "Matching pages pick it up on their next load.";
