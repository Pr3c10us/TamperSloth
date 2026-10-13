import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAgent } from "./hooks/useAgent";
import { ChatHeader } from "./components/ChatHeader";
import { MessageList } from "./components/MessageList";
import { Composer, makeAttachmentFromFile } from "./components/Composer";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { UserScriptsBanner } from "./components/UserScriptsBanner";
import {
    loadInitialSelectedModel,
    type SelectedModelEntry,
} from "./components/ModelSelector";
import { getApiKeys as loadApiKeys } from "../settings/lib/storage";
import { MAX_ATTACHMENTS, type PendingAttachment } from "./components/AttachmentChip";
import { clearPickedMarkers } from "./hooks/useElementPicker";
import type { PickedElement } from "./components/PickedElementChip";

const tabId = Number(new URLSearchParams(window.location.search).get("tabId")) || 0;

function Chat() {
    const navigate = useNavigate();
    const {
        messages,
        title,
        isLoading,
        error,
        conversationId,
        sendMessage,
        cancel,
        clear,
        loadConversation,
    } = useAgent();

    const [draft, setDraft] = useState("");
    const [pickedElements, setPickedElements] = useState<PickedElement[]>([]);
    const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState<SelectedModelEntry | null>(null);

    useEffect(() => {
        loadInitialSelectedModel().then(setSelectedModel);
    }, []);


    const handleSend = async () => {
        if (!selectedModel) return;
        const keys = await loadApiKeys();
        const apiKey = keys[selectedModel.providerId];
        if (!apiKey) return;

        const text = draft.trim();
        const elementsForMsg = [...pickedElements];
        const filesForMsg = [...pendingFiles];

        setDraft("");
        setPickedElements([]);
        setPendingFiles([]);
        if (elementsForMsg.length > 0) clearPickedMarkers(tabId);

        void sendMessage(
            text,
            selectedModel.providerId,
            apiKey,
            selectedModel.modelId,
            elementsForMsg.length > 0 ? elementsForMsg : undefined,
            filesForMsg.length > 0 ? filesForMsg : undefined,
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

    const handleNewChat = () => {
        clear();
        setDraft("");
        setPickedElements([]);
        clearPickedMarkers(tabId);
        setPendingFiles([]);
    };

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
                historyOpen={historyOpen}
                onToggleHistory={() => setHistoryOpen((o) => !o)}
            />

            <UserScriptsBanner />

            <MessageList
                messages={messages}
                isLoading={isLoading}
                error={error}
            />

            <Composer
                draft={draft}
                setDraft={setDraft}
                pickedElements={pickedElements}
                setPickedElements={setPickedElements}
                pendingFiles={pendingFiles}
                addFiles={addFiles}
                removeFile={removeFile}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                isLoading={isLoading}
                onSend={handleSend}
                onCancel={cancel}
                tabId={tabId}
            />

            <HistoryDrawer
                open={historyOpen}
                onOpenChange={setHistoryOpen}
                activeId={conversationId}
                onSelect={loadConversation}
                onNewChat={handleNewChat}
                onOpenSettings={() => navigate("/settings")}
            />
        </div>
    );
}

export default Chat;
