import {isChromeExtension} from "./isChromeExtension";

export async function getScriptValue(scriptId: string, key: string): Promise<unknown> {
    if (!isChromeExtension) return null;
    const storageKey = `scriptData_${scriptId}`;
    const result = await chrome.storage.local.get(storageKey);
    const data = (result[storageKey] as Record<string, unknown>) ?? {};
    return data[key] ?? null;
}

export async function setScriptValue(scriptId: string, key: string, value: unknown): Promise<void> {
    if (!isChromeExtension) return;
    const storageKey = `scriptData_${scriptId}`;
    const result = await chrome.storage.local.get(storageKey);
    const data = (result[storageKey] as Record<string, unknown>) ?? {};
    data[key] = value;
    await chrome.storage.local.set({ [storageKey]: data });
}

export async function deleteScriptValue(scriptId: string, key: string): Promise<void> {
    if (!isChromeExtension) return;
    const storageKey = `scriptData_${scriptId}`;
    const result = await chrome.storage.local.get(storageKey);
    const data = (result[storageKey] as Record<string, unknown>) ?? {};
    delete data[key];
    await chrome.storage.local.set({ [storageKey]: data });
}

export async function listScriptValues(scriptId: string): Promise<Record<string, unknown>> {
    if (!isChromeExtension) return {};
    const storageKey = `scriptData_${scriptId}`;
    const result = await chrome.storage.local.get(storageKey);
    return (result[storageKey] as Record<string, unknown>) ?? {};
}

/** Adds several values at once, for a script arriving with data from another manager. */
export async function mergeScriptValues(scriptId: string, values: Record<string, unknown>): Promise<void> {
    if (!isChromeExtension) return;
    const storageKey = `scriptData_${scriptId}`;
    const result = await chrome.storage.local.get(storageKey);
    await chrome.storage.local.set({ [storageKey]: {...(result[storageKey] as Record<string, unknown>), ...values} });
}

export async function clearScriptStorage(scriptId: string): Promise<void> {
    if (!isChromeExtension) return;
    await chrome.storage.local.remove(`scriptData_${scriptId}`);
}
