import {useCallback, useMemo, useSyncExternalStore} from "react";
import {beforeMessage} from "@/agent/conversation/historyMessages";
import {cancelEdit, editMessage} from "@/agent/conversation/messageEditing";
import {unqueueMessage} from "@/agent/conversation/messageQueue";
import {cancelActiveRun, getActiveSession, getRunningIds, getSession, openConversation, setThinkingLevel, startNewChat, subscribeSessions} from "@/agent/conversation/sessions";
import {sendMessage} from "@/agent/run/sendMessage";

export function useChatTitle(id: string | null): string | null {
    return useSyncExternalStore(subscribeSessions, () => (id ? getSession(id)?.title ?? null : null));
}

export function useRunningChats(): string[] {
    return useSyncExternalStore(subscribeSessions, getRunningIds);
}

type SendArgs = Parameters<typeof sendMessage> extends [string, ...infer Rest] ? Rest : never;

export function useAgent() {
    const session = useSyncExternalStore(subscribeSessions, getActiveSession);
    const send = useCallback((...args: SendArgs) => sendMessage(session.id, ...args), [session.id]);
    // While a message is being edited, it and everything after it are hidden.
    const messages = useMemo(() => beforeMessage(session.messages, session.editing?.messageId),
        [session.messages, session.editing?.messageId]);
    const edit = useCallback((messageId: string) => editMessage(session.id, messageId), [session.id]);
    return {
        messages,
        queued: session.queued,
        /** A sent message is back in the composer, hiding it and everything after it. */
        editing: Boolean(session.editing),
        editMessage: edit,
        cancelEdit: () => cancelEdit(session.id),
        unqueueMessage: (id: string, edit?: boolean) => unqueueMessage(session.id, id, edit),
        title: session.title,
        isLoading: session.isLoading,
        error: session.error,
        thinkingLevel: session.thinkingLevel,
        setThinkingLevel,
        conversationId: session.id,
        sendMessage: send,
        cancel: cancelActiveRun,
        clear: startNewChat,
        loadConversation: openConversation,
    };
}
