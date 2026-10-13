import type {StoredConversation} from './storage';

export type ConversationSummary = Omit<StoredConversation, 'messages'>;
let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
    if (!database) {
        database = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('tampersloth-chats-v2', 1);
            request.onupgradeneeded = () => {
                request.result.createObjectStore('conversations', {keyPath: 'id'});
                request.result.createObjectStore('summaries', {keyPath: 'id'});
            };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); database = undefined; };
                resolve(db);
            };
            request.onerror = () => reject(request.error ?? new Error('Could not open chat storage'));
            request.onblocked = () => reject(new Error('Chat storage is blocked by another extension panel. Close the other panel and retry.'));
        }).catch(error => { database = undefined; throw error; });
    }
    return database;
}

async function read<T>(store: string, id?: string): Promise<T> {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(store, 'readonly');
        const request = id === undefined ? transaction.objectStore(store).getAll() : transaction.objectStore(store).get(id);
        transaction.oncomplete = () => resolve(request.result as T);
        transaction.onabort = () => reject(transaction.error ?? new Error('Could not read chat storage'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not read chat storage'));
    });
}

export function readChatSummaries() { return read<ConversationSummary[]>('summaries'); }
export async function readChat(id: string) { return (await read<StoredConversation | undefined>('conversations', id)) ?? null; }

async function write(update: (transaction: IDBTransaction) => void) {
    const db = await openDatabase();
    return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(['conversations', 'summaries'], 'readwrite');
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('Could not save chat'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Could not save chat'));
        try { update(transaction); }
        catch (error) { transaction.abort(); reject(error); }
    });
}

export function writeChat(conversation: StoredConversation) {
    const {id, title, createdAt, updatedAt} = conversation;
    return write(transaction => {
        transaction.objectStore('conversations').put(conversation);
        transaction.objectStore('summaries').put({id, title, createdAt, updatedAt});
    });
}

export function removeChat(id: string) {
    return write(transaction => {
        transaction.objectStore('conversations').delete(id);
        transaction.objectStore('summaries').delete(id);
    });
}
