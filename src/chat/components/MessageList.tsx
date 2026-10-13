import {forwardRef, useEffect, useLayoutEffect, useRef, useState} from "react";
import { AlertCircle } from "lucide-react";
import type { ChatMessage } from "../hooks/useAgent";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { EmptyState } from "./EmptyState";
import {DEFAULT_AGENT_SETTINGS, loadAgentSettings, onAgentSettingsChange} from "../lib/agentSettings";

interface MessageListProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
    function MessageList({ messages, isLoading, error }, forwardedRef) {

        const scrollRef = useRef<HTMLDivElement>(null);
        const [settings, setSettings] = useState(DEFAULT_AGENT_SETTINGS);

        useEffect(() => {
            let active = true;
            void loadAgentSettings().then(value => { if (active) setSettings(value); });
            const unsubscribe = onAgentSettingsChange(setSettings);
            return () => { active = false; unsubscribe(); };
        }, []);

        useLayoutEffect(() => {
            const el = scrollRef.current;
            if (el) el.scrollTop = el.scrollHeight;
        }, [messages, isLoading]);

        return (
            <div
                ref={(node) => {
                    scrollRef.current = node!;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-4 pt-5 pb-[40vh]"
            >
                {messages.length === 0 && <EmptyState />}
                {messages.map((m, i) =>
                    m.role === "user" ? (
                        <UserMessage key={m.id} msg={m} />
                    ) : (
                        <AssistantMessage
                            key={m.id}
                            msg={m}
                            isLoading={isLoading}
                            isLast={i === messages.length - 1}
                            showRunTokens={settings.showRunTokens}
                            showToolTokens={settings.showToolTokens}
                        />
                    )
                )}
                {error && !isLoading && (
                    <div className="flex items-center gap-2 px-1 text-sm text-destructive">
                        <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.5} />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        );
    }
);