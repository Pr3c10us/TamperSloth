import type {ProviderId} from "@/agent/models/provider";
import {isChromeExtension} from "./isChromeExtension";

const SELECTED_MODEL_KEY = "ts_selected_model";

export interface SelectedModel {
    providerId: ProviderId;
    modelId: string;
}

export async function loadSelectedModel(): Promise<SelectedModel | null> {
    if (isChromeExtension) {
        const result = await chrome.storage.local.get(SELECTED_MODEL_KEY);
        return (result[SELECTED_MODEL_KEY] as SelectedModel) ?? null;
    }
    const raw = localStorage.getItem(SELECTED_MODEL_KEY);
    return raw ? JSON.parse(raw) : null;
}

export async function saveSelectedModel(providerId: ProviderId, modelId: string): Promise<void> {
    const data: SelectedModel = { providerId, modelId };
    if (isChromeExtension) {
        await chrome.storage.local.set({ [SELECTED_MODEL_KEY]: data });
    } else {
        localStorage.setItem(SELECTED_MODEL_KEY, JSON.stringify(data));
    }
}

export async function clearSelectedModel(): Promise<void> {
    if (isChromeExtension) {
        await chrome.storage.local.remove(SELECTED_MODEL_KEY);
    } else {
        localStorage.removeItem(SELECTED_MODEL_KEY);
    }
}

/** Calls `listener` whenever the selection changes, including from Settings or another panel. */
export function subscribeSelectedModel(listener: () => void): () => void {
    if (!isChromeExtension) return () => {};
    const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === "local" && SELECTED_MODEL_KEY in changes) listener();
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
}
