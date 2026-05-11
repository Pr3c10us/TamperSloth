import { ArrowLeft, PanelRightOpen, Settings, SquarePen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
    onBack: () => void;
    onToggleHistory: () => void;
    historyOpen: boolean;
    onNewChat: () => void;
    onOpenSettings: () => void;
}

export function ChatHeader({
    onBack,
    onToggleHistory,
    historyOpen,
    onNewChat,
    onOpenSettings,
}: ChatHeaderProps) {
    return (
        <header className="fixed top-0 inset-x-0 flex shrink-0 items-center justify-between border-b border-muted bg-background px-3.5 py-3">
            <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 px-1.5">
                <ArrowLeft strokeWidth={1.5} className="text-foreground" />
                <img src="favicon.svg" className="h-5 w-5" alt="" />
                <span className="font-heading text-lg italic leading-none tracking-[-0.02em] text-accent">
                    gallery
                </span>
            </Button>
            <div className="flex items-center gap-0.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={onToggleHistory}
                            aria-pressed={historyOpen}
                            aria-label="Conversation history"
                            className={cn(historyOpen && "bg-muted")}
                        >
                            <PanelRightOpen strokeWidth={1.5} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Conversation history</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={onNewChat}
                            aria-label="New chat"
                        >
                            <SquarePen strokeWidth={1.5} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">New chat</TooltipContent>
                </Tooltip>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={onOpenSettings}
                            aria-label="Settings"
                        >
                            <Settings strokeWidth={1.5} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Settings</TooltipContent>
                </Tooltip>
            </div>
        </header>
    );
}
