import {isChromeExtension} from "./isChromeExtension";

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
    const keys = await chrome.storage.local.getKeys();
    const wanted = FILE_PREFIX + conversationId + "/" + prefix;
    return keys
        .filter((k) => k.startsWith(wanted))
        .map((k) => k.slice((FILE_PREFIX + conversationId + "/").length))
        .sort();
}

export interface CodeFileEntry {
    conversationId: string;
    path: string;
}

export async function listAllCodeFiles(): Promise<CodeFileEntry[]> {
    if (!isChromeExtension) return [];
    const keys = await chrome.storage.local.getKeys();
    return keys
        .filter((k) => k.startsWith(FILE_PREFIX))
        .map((k) => {
            const withoutPrefix = k.slice(FILE_PREFIX.length);
            const slashIdx = withoutPrefix.indexOf('/');
            return {
                conversationId: withoutPrefix.slice(0, slashIdx),
                path: withoutPrefix.slice(slashIdx + 1),
            };
        })
        .sort((a, b) => a.path.localeCompare(b.path));
}

export async function deleteAllFilesForConversation(conversationId: string): Promise<void> {
    if (!isChromeExtension) return;
    const allKeys = await chrome.storage.local.getKeys();
    const keys = allKeys.filter(
        (k) => k.startsWith(FILE_PREFIX + conversationId + '/'),
    );
    if (keys.length > 0) await chrome.storage.local.remove(keys);
}
