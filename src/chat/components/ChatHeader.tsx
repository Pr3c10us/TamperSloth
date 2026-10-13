import { GalleryVerticalEnd, PanelLeft, SquarePen } from "lucide-react";
import {
    PageHeader,
    PageHeaderAction,
    PageHeaderTitle,
} from "@/components/page-header";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
    /** Model-written title; `null` until the first request has been named. */
    title: string | null;
    /** Whether the conversation has any messages yet. */
    started: boolean;
    isLoading: boolean;
    onNewChat: () => void;
    onBack: () => void;
    onToggleHistory: () => void;
    historyOpen: boolean;
}

export function ChatHeader({
    title,
    started,
    isLoading,
    onNewChat,
    onBack,
    onToggleHistory,
    historyOpen,
}: ChatHeaderProps) {
    return (
        <PageHeader>
            <PageHeaderAction
                label="Conversation history"
                onClick={onToggleHistory}
                aria-pressed={historyOpen}
                className={cn(historyOpen && "bg-muted text-foreground")}
            >
                <PanelLeft />
            </PageHeaderAction>

            <div className="flex min-w-0 flex-1 items-center gap-1">
                {isLoading && (
                    <span className="relative ml-1 flex size-1.5 shrink-0" aria-label="Working" role="status">
                        <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                        <span className="relative size-1.5 rounded-full bg-accent" />
                    </span>
                )}
                <PageHeaderTitle
                    title={title ?? undefined}
                    className={title ? "text-foreground" : "italic text-muted-foreground"}
                >
                    {title ?? "New chat"}
                </PageHeaderTitle>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
                <PageHeaderAction label="New chat" onClick={onNewChat} disabled={!started}>
                    <SquarePen />
                </PageHeaderAction>
                <PageHeaderAction label="Gallery" onClick={onBack}>
                    <GalleryVerticalEnd />
                </PageHeaderAction>
            </div>
        </PageHeader>
    );
}
