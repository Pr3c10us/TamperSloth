import type {BackgroundScript} from "@/src/chat/lib/types";

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
 * Reloads every open tab covered by any of the scripts' URL patterns, so a
 * pause, delete or import takes effect wherever it applies. The background
 * re-registers scripts before reloading. Resolves to how many tabs reloaded.
 */
export async function reloadTabsForScripts(scripts: BackgroundScript[]): Promise<number> {
    const patterns = [...new Set(scripts.map((s) => s.urlMatchPattern).filter(Boolean))];
    if (patterns.length === 0) return 0;
    try {
        const res = await chrome.runtime.sendMessage({type: "RELOAD_SCRIPT_TABS", patterns});
        return typeof res?.count === "number" ? res.count : 0;
    } catch {
        return 0;
    }
}

export const reloadTabsForScript = (script: BackgroundScript) => reloadTabsForScripts([script]);

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

/** Toast copy for how many tabs a change reloaded. */
export const reloadedNote = (count: number) =>
    count > 0 ? `Reloaded ${plural(count, "matching tab")} to apply it.` : "Matching pages pick it up on their next load.";
