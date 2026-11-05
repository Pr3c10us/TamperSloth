import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {useAgent} from "@/pages/chat/hooks/useAgent";
import { ChatHeader } from "@/pages/chat/header/ChatHeader";
import { MessageList } from "@/pages/chat/messages/MessageList";
import { Composer } from "@/pages/chat/composer/Composer";
import { HistoryDrawer } from "@/pages/chat/header/HistoryDrawer";
import { UserScriptsBanner } from "@/pages/chat/notices/UserScriptsBanner";
import { ImageLightbox } from "@/pages/chat/messages/ImageLightbox";
import {
    loadInitialSelectedModel,
    type SelectedModelEntry,
} from "@/pages/chat/composer/ModelSelector";
import { getApiKeys as loadApiKeys } from "@/storage/apiKeys";
import {subscribeSelectedModel} from "@/storage/selectedModel";
import { getAccessToken } from "@/account/account";
import {makeAttachmentFromFile, MAX_ATTACHMENTS, type PendingAttachment} from "@/agent/conversation/attachments";
import {showPickedMarkers} from "@/injected/pickerOverlay";
import type {PickedElement} from "@/agent/conversation/types";
import {clearDraft, updateDraft, useDraft} from "@/agent/conversation/drafts";
import type { Quote } from "@/shared/panelRequests";

const tabId = Number(new URLSearchParams(window.location.search).get("tabId")) || 0;

function ChatPage() {
    const navigate = useNavigate();
    const {
        messages,
        title,
        isLoading,
        error,
        thinkingLevel,
        setThinkingLevel,
        conversationId,
        sendMessage,
        cancel,
        clear,
        loadConversation,
        queued,
        editing,
        editMessage,
        cancelEdit,
        unqueueMessage,
    } = useAgent();

    // Unsent text, picks and files belong to the chat, and wait for it while the user is elsewhere.
    const { text: draft, pickedElements, files: pendingFiles, quotes } = useDraft(conversationId);
    const setDraft = (text: string) => updateDraft(conversationId, (d) => ({ ...d, text }));
    const setPickedElements = (updater: (prev: PickedElement[]) => PickedElement[]) =>
        updateDraft(conversationId, (d) => ({ ...d, pickedElements: updater(d.pickedElements) }));
    const setPendingFiles = (updater: (prev: PendingAttachment[]) => PendingAttachment[]) =>
        updateDraft(conversationId, (d) => ({ ...d, files: updater(d.files) }));
    const setQuotes = (updater: (prev: Quote[]) => Quote[]) =>
        updateDraft(conversationId, (d) => ({ ...d, quotes: updater(d.quotes) }));
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState<SelectedModelEntry | null>(null);

    useEffect(() => {
        const load = () => void loadInitialSelectedModel().then(setSelectedModel);
        load();
        // Removing a key or signing out in Settings can move the selection.
        return subscribeSelectedModel(load);
    }, []);

    useEffect(() => {
        showPickedMarkers(tabId, conversationId);
    }, [conversationId]);


    const handleSend = async () => {
        if (!selectedModel) return;
        // Sloth models sign requests with the account session; the token here only marks it as present.
        const apiKey = selectedModel.providerId === "tampersloth"
            ? await getAccessToken().catch(() => "")
            : (await loadApiKeys())[selectedModel.providerId];
        if (!apiKey) return;

        const text = draft.trim();
        const elementsForMsg = [...pickedElements];
        const filesForMsg = [...pendingFiles];
        const quotesForMsg = [...quotes];

        clearDraft(conversationId);

        void sendMessage(
            text,
            selectedModel.providerId,
            apiKey,
            selectedModel.modelId,
            elementsForMsg.length > 0 ? elementsForMsg : undefined,
            filesForMsg.length > 0 ? filesForMsg : undefined,
            quotesForMsg.length > 0 ? quotesForMsg : undefined,
        );
    };

    /** Adds files up to MAX_ATTACHMENTS; returns how many were left out. */
    const addFiles = (files: File[]) => {
        const room = Math.max(0, MAX_ATTACHMENTS - pendingFiles.length);
        const accepted = files.slice(0, room);
        if (accepted.length) setPendingFiles((p) => [...p, ...accepted.map(makeAttachmentFromFile)].slice(0, MAX_ATTACHMENTS));
        return files.length - accepted.length;
    };

    const removeFile = (i: number) =>
        setPendingFiles((p) => p.filter((_, idx) => idx !== i));

    const handleNewChat = () => clear();

    return (
        <div className="relative flex h-full w-full flex-col overflow-hidden border-l border-border bg-background font-sans text-foreground">
            <style>{`
                @keyframes slothPulse {
                    0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1); }
                }
                @keyframes slothPop {
                    from { opacity: 0; transform: translateY(4px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
            `}</style>

            <ChatHeader
                title={title}
                started={messages.length > 0}
                isLoading={isLoading}
                onNewChat={handleNewChat}
                onBack={() => navigate("/gallery")}
                onOpenSettings={() => navigate("/settings")}
                historyOpen={historyOpen}
                onToggleHistory={() => setHistoryOpen((o) => !o)}
            />

            <UserScriptsBanner />

            <MessageList
                messages={messages}
                isLoading={isLoading}
                error={error}
                onEditMessage={editMessage}
            />

            <Composer
                draft={draft}
                setDraft={setDraft}
                pickedElements={pickedElements}
                setPickedElements={setPickedElements}
                pendingFiles={pendingFiles}
                quotes={quotes}
                setQuotes={setQuotes}
                addFiles={addFiles}
                removeFile={removeFile}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                thinkingLevel={thinkingLevel}
                setThinkingLevel={setThinkingLevel}
                isLoading={isLoading}
                onSend={handleSend}
                onCancel={cancel}
                tabId={tabId}
                conversationId={conversationId}
                queued={queued}
                onUnqueue={unqueueMessage}
                editing={editing}
                onCancelEdit={cancelEdit}
            />

            <ImageLightbox />

            <HistoryDrawer
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                activeId={conversationId}
                onSelect={loadConversation}
                onNewChat={handleNewChat}
                onOpenGallery={() => navigate("/gallery")}
                onOpenSettings={() => navigate("/settings")}
            />
        </div>
    );
}

export default ChatPage;
