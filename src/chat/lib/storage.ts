import type { ProviderId } from "./provider.ts";
import type { BackgroundScript } from "./types.ts";


const isChromeExtension = typeof chrome !== "undefined" && !!chrome?.storage?.local;

const SELECTED_MODEL_KEY = "ts_selected_model";
const CONVERSATIONS_KEY = "ts_conversations";
const SCRIPTS_KEY = "ts_background_scripts";

// ── Selected model ──────────────────────────────────────────

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

// ── Conversations ───────────────────────────────────────────

export interface StoredConversation {
    id: string;
    title: string;
    messages: unknown[];
    createdAt: number;
    updatedAt: number;
}

export async function loadConversations(): Promise<StoredConversation[]> {
    if (isChromeExtension) {
        const result = await chrome.storage.local.get(CONVERSATIONS_KEY);
        const stored = result[CONVERSATIONS_KEY];
        return Array.isArray(stored) ? (stored as StoredConversation[]) : [];
    }
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    return raw ? JSON.parse(raw) : [];
}

async function saveConversations(conversations: StoredConversation[]): Promise<void> {
    if (isChromeExtension) {
        await chrome.storage.local.set({ [CONVERSATIONS_KEY]: conversations });
    } else {
        localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
    }
}

export async function saveConversation(conversation: StoredConversation): Promise<void> {
    const all = await loadConversations();
    const idx = all.findIndex((c) => c.id === conversation.id);
    if (idx >= 0) {
        all[idx] = conversation;
    } else {
        all.unshift(conversation);
    }
    await saveConversations(all);
}

export async function deleteConversation(id: string): Promise<void> {
    const all = await loadConversations();
    await saveConversations(all.filter((c) => c.id !== id));
}

// ── Scripts ─────────────────────────────────────────────────

export async function loadScripts(): Promise<BackgroundScript[]> {
    if (!isChromeExtension) return [];
    const result = await chrome.storage.local.get(SCRIPTS_KEY);
    return (result[SCRIPTS_KEY] as BackgroundScript[]) ?? [];
}

export async function loadScriptsByConversation(conversationId: string): Promise<BackgroundScript[]> {
    const all = await loadScripts();
    return all.filter((s) => s.conversationId === conversationId);
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

// ── Per-script value storage ────────────────────────────────

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

export async function clearScriptStorage(scriptId: string): Promise<void> {
    if (!isChromeExtension) return;
    await chrome.storage.local.remove(`scriptData_${scriptId}`);
}

// ── Import/export ───────────────────────────────────────────

function downloadJson(json: string, filename: string): void {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export function exportScript(script: BackgroundScript): void {
    downloadJson(JSON.stringify(script, null, 2), `${script.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`);
}

export async function exportAllScripts(): Promise<void> {
    const scripts = await loadScripts();
    downloadJson(
        JSON.stringify(scripts, null, 2),
        `tampersloth-scripts-${new Date().toISOString().slice(0, 10)}.json`,
    );
}

function isBackgroundScript(obj: unknown): obj is BackgroundScript {
    return !!obj && typeof obj === "object" && "name" in obj && "code" in obj && "urlMatchPattern" in obj;
}

export async function importScriptsFromJson(json: string): Promise<number> {
    const parsed: unknown = JSON.parse(json);
    const items: BackgroundScript[] = Array.isArray(parsed)
        ? parsed.filter(isBackgroundScript)
        : isBackgroundScript(parsed)
            ? [parsed]
            : [];
    if (items.length === 0) throw new Error("No valid scripts found");
    for (const s of items) {
        s.id = crypto.randomUUID();
        await saveScript(s);
    }
    return items.length;
}

// ── Code Files ───────────────────────────────────────────

const FILE_PREFIX = 'ts_file:';

function key(conversationId: string, path: string ): string {
    return FILE_PREFIX + conversationId + "/" + path;
}

export async function readFile(conversationId: string,path: string): Promise<string | null> {
    const k = key(conversationId,path);
    const result = await chrome.storage.local.get(k);
    const v = result[k];
    return typeof v === 'string' ? v : null;
}

export async function writeFile(conversationId: string,path: string, content: string): Promise<void> {
    await chrome.storage.local.set({ [key(conversationId,path)]: content });
}

export async function deleteFile(conversationId: string,path: string): Promise<void> {
    await chrome.storage.local.remove(key(conversationId,path));
}

export async function fileExists(conversationId: string,path: string): Promise<boolean> {
    return (await readFile(conversationId,path)) !== null;
}

export async function listFiles(conversationId: string,prefix = ''): Promise<string[]> {
    const all = await chrome.storage.local.get(null);
    const wanted = FILE_PREFIX + conversationId + "/" + prefix;
    return Object.keys(all)
        .filter((k) => k.startsWith(wanted))
        .map((k) => k.slice(FILE_PREFIX.length))
        .sort();
}

// ── Todos ───────────────────────────────────────────────────

export type TodoStatus = "pending" | "in_progress" | "completed";
export type TodoPriority = "high" | "medium" | "low";

export interface TodoItem {
    id: string;
    content: string;
    status: TodoStatus;
    priority: TodoPriority;
}

const TODO_PREFIX = "ts_todos:";

function todoKey(conversationId: string): string {
    return TODO_PREFIX + conversationId;
}

export async function loadTodos(conversationId: string): Promise<TodoItem[]> {
    const k = todoKey(conversationId);
    if (isChromeExtension) {
        const result = await chrome.storage.local.get(k);
        const v = result[k];
        return Array.isArray(v) ? (v as TodoItem[]) : [];
    }
    const raw = localStorage.getItem(k);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as TodoItem[]) : [];
    } catch {
        return [];
    }
}

export async function saveTodos(conversationId: string, todos: TodoItem[]): Promise<void> {
    const k = todoKey(conversationId);
    if (isChromeExtension) {
        await chrome.storage.local.set({ [k]: todos });
    } else {
        localStorage.setItem(k, JSON.stringify(todos));
    }
}

export async function clearTodos(conversationId: string): Promise<void> {
    const k = todoKey(conversationId);
    if (isChromeExtension) {
        await chrome.storage.local.remove(k);
    } else {
        localStorage.removeItem(k);
    }
}

export function subscribeTodos(
    conversationId: string,
    listener: (todos: TodoItem[]) => void,
): () => void {
    const k = todoKey(conversationId);
    if (isChromeExtension) {
        const handler = (
            changes: Record<string, chrome.storage.StorageChange>,
            area: chrome.storage.AreaName,
        ) => {
            if (area !== "local" || !(k in changes)) return;
            const next = changes[k].newValue;
            listener(Array.isArray(next) ? (next as TodoItem[]) : []);
        };
        chrome.storage.onChanged.addListener(handler);
        return () => chrome.storage.onChanged.removeListener(handler);
    }
    const handler = (e: StorageEvent) => {
        if (e.key !== k) return;
        if (!e.newValue) return listener([]);
        try {
            const parsed = JSON.parse(e.newValue);
            listener(Array.isArray(parsed) ? (parsed as TodoItem[]) : []);
        } catch {
            listener([]);
        }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
}

