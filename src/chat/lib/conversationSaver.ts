import type {StoredConversation} from './storage';

/** A slow disk must not retain every streamed snapshot in a promise chain. */
export function createConversationSaver(write: (conversation: StoredConversation) => Promise<void>, onError: (error: unknown) => void) {
    const pending = new Map<string, StoredConversation>();
    let running = false;
    return (conversation: StoredConversation) => {
        pending.set(conversation.id, conversation);
        if (running) return;
        running = true;
        void (async () => {
            try {
                while (pending.size) {
                    const [id, next] = pending.entries().next().value!;
                    pending.delete(id);
                    try { await write(next); }
                    catch (error) { onError(error); }
                }
            } finally { running = false; }
        })();
    };
}
