const API_KEYS_NAMESPACE = "ts_api_keys";

type ApiKeyMap = Record<string, string>;

/** Vertex project ID or number, kept beside the keys; models served only from `global` need it. */
export const VERTEX_PROJECT_KEY = "vertex_project";

function hasChromeStorage(): boolean {
    return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

const LEGACY_ID_MAP: Record<string, string> = { gemini: "google" };

function migrateLegacyIds(map: ApiKeyMap): { map: ApiKeyMap; changed: boolean } {
    let changed = false;
    const next = { ...map };
    for (const [oldId, newId] of Object.entries(LEGACY_ID_MAP)) {
        if (next[oldId] && !next[newId]) {
            next[newId] = next[oldId];
            delete next[oldId];
            changed = true;
        } else if (next[oldId]) {
            delete next[oldId];
            changed = true;
        }
    }
    return { map: next, changed };
}

async function readAll(): Promise<ApiKeyMap> {
    let raw: ApiKeyMap;
    if (hasChromeStorage()) {
        const result = await chrome.storage.local.get(API_KEYS_NAMESPACE);
        raw = (result[API_KEYS_NAMESPACE] as ApiKeyMap) ?? {};
    } else {
        const stored = localStorage.getItem(API_KEYS_NAMESPACE);
        raw = stored ? (JSON.parse(stored) as ApiKeyMap) : {};
    }
    const { map, changed } = migrateLegacyIds(raw);
    if (changed) await writeAll(map);
    return map;
}

async function writeAll(map: ApiKeyMap): Promise<void> {
    if (hasChromeStorage()) {
        await chrome.storage.local.set({[API_KEYS_NAMESPACE]: map});
        return;
    }
    localStorage.setItem(API_KEYS_NAMESPACE, JSON.stringify(map));
}

export async function getApiKeys(): Promise<ApiKeyMap> {
    return readAll();
}

export async function setApiKey(providerId: string, key: string): Promise<void> {
    const all = await readAll();
    all[providerId] = key;
    await writeAll(all);
}

export async function deleteApiKey(providerId: string): Promise<void> {
    const all = await readAll();
    delete all[providerId];
    if (providerId === "vertex") delete all[VERTEX_PROJECT_KEY];
    await writeAll(all);
}

export function subscribeApiKeys(listener: (map: ApiKeyMap) => void): () => void {
    if (hasChromeStorage()) {
        const handler = (
            changes: Record<string, chrome.storage.StorageChange>,
            area: chrome.storage.AreaName,
        ) => {
            if (area !== "local" || !(API_KEYS_NAMESPACE in changes)) return;
            listener((changes[API_KEYS_NAMESPACE].newValue as ApiKeyMap) ?? {});
        };
        chrome.storage.onChanged.addListener(handler);
        return () => chrome.storage.onChanged.removeListener(handler);
    }
    const handler = (e: StorageEvent) => {
        if (e.key !== API_KEYS_NAMESPACE) return;
        listener(e.newValue ? (JSON.parse(e.newValue) as ApiKeyMap) : {});
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
}
