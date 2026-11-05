import type {BackgroundScript} from "@/userscripts/types";
import {isChromeExtension} from "./isChromeExtension";
import {clearScriptStorage} from "./scriptValues";

const SCRIPTS_KEY = "ts_background_scripts";

export async function loadScripts(): Promise<BackgroundScript[]> {
    if (!isChromeExtension) return [];
    const result = await chrome.storage.local.get(SCRIPTS_KEY);
    return (result[SCRIPTS_KEY] as BackgroundScript[]) ?? [];
}

export async function loadScriptsByConversation(conversationId: string): Promise<BackgroundScript[]> {
    const all = await loadScripts();
    return all.filter((s) => s.conversationId === conversationId);
}

/** Calls back with the full list whenever saved scripts change, from any page. Returns an unsubscribe. */
export function subscribeToScripts(callback: (scripts: BackgroundScript[]) => void): () => void {
    if (!isChromeExtension) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === "local" && SCRIPTS_KEY in changes) {
            callback((changes[SCRIPTS_KEY].newValue as BackgroundScript[]) ?? []);
        }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}

async function saveScripts(scripts: BackgroundScript[]): Promise<void> {
    if (!isChromeExtension) return;
    await chrome.storage.local.set({ [SCRIPTS_KEY]: scripts });
}

export async function saveScript(script: BackgroundScript): Promise<void> {
    const all = await loadScripts();
    const idx = all.findIndex((s) => s.id === script.id);
    if (idx >= 0) {
        all[idx] = script;
    } else {
        all.unshift(script);
    }
    await saveScripts(all);
}

export async function deleteScript(id: string): Promise<void> {
    const all = await loadScripts();
    await saveScripts(all.filter((s) => s.id !== id));
    await clearScriptStorage(id);
}

export async function updateScriptStatus(id: string, status: "active" | "paused"): Promise<void> {
    const all = await loadScripts();
    const script = all.find((s) => s.id === id);
    if (script) {
        script.status = status;
        await saveScripts(all);
    }
}
