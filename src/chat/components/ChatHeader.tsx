import type { ReactNode } from "react";
import { GalleryVerticalEnd, PanelLeft, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
    /** Current conversation's title; `null` before the first message. */
    title: string | null;
    isLoading: boolean;
    onNewChat: () => void;
    onBack: () => void;
    onToggleHistory: () => void;
    historyOpen: boolean;
}

function HeaderAction({
    label,
    children,
    className,
    ...props
}: { label: string; children: ReactNode } & React.ComponentProps<typeof Button>) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={label}
                    className={cn("text-foreground/70 hover:text-foreground", className)}
                    {...props}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}

export function ChatHeader({
    title,
    isLoading,
    onNewChat,
    onBack,
    onToggleHistory,
    historyOpen,
}: ChatHeaderProps) {
    return (
        <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-muted bg-background px-2.5">
            <HeaderAction
                label="Conversation history"
                onClick={onToggleHistory}
                aria-pressed={historyOpen}
                className={cn(historyOpen && "bg-muted text-foreground")}
            >
                <PanelLeft strokeWidth={1.5} />
            </HeaderAction>

            <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
                {isLoading && (
                    <span className="relative flex size-1.5 shrink-0" aria-label="Working" role="status">
                        <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                        <span className="relative size-1.5 rounded-full bg-accent" />
                    </span>
                )}
                <h1
                    title={title ?? undefined}
                    className={cn(
                        "truncate pb-px font-heading text-[19px] leading-tight tracking-[-0.01em]",
                        title ? "text-foreground" : "italic text-muted-foreground",
                    )}
                >
                    {title ?? "New chat"}
                </h1>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
                <HeaderAction label="New chat" onClick={onNewChat} disabled={!title}>
                    <SquarePen strokeWidth={1.5} />
                </HeaderAction>
                <HeaderAction label="Gallery" onClick={onBack}>
                    <GalleryVerticalEnd strokeWidth={1.5} />
                </HeaderAction>
            </div>
        </header>
    );
}
