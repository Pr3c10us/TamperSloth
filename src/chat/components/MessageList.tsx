import { forwardRef } from "react";
import { AlertCircle } from "lucide-react";
import type { ChatMessage } from "../hooks/useAgent";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { EmptyState } from "./EmptyState";

interface MessageListProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
}

export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(function MessageList(
    { messages, isLoading, error },
    ref,
) {
    return (
        <div
            ref={ref}
            className="flex flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden px-4 pb-3.5 pt-5 pb-[40vh]"
        >
            {messages.length === 0 && <EmptyState />}
            {messages.map((m, i) => {
                if (m.role === "user") {
                    return <UserMessage key={m.id} msg={m} />;
                }
                return (
                    <AssistantMessage
                        key={m.id}
                        msg={m}
                        isLoading={isLoading}
                        isLast={i === messages.length - 1}
                    />
                );
            })}
            {error && !isLoading && (
                <div className="flex items-center gap-2 px-1 text-sm text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" strokeWidth={1.5} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
});
