import {GalleryVerticalEnd, PanelLeft} from "lucide-react";
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
}

export function ChatHeader({
    onBack,
    onToggleHistory,
    historyOpen,
}: ChatHeaderProps) {
    return (
        <header className="fixed top-0 inset-x-0 flex shrink-0 items-center justify-between border-b border-muted bg-background px-3.5 py-3">
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
                            <PanelLeft strokeWidth={1.5} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Conversation history</TooltipContent>
                </Tooltip>

            </div>
            <div className="flex items-center gap-0.5">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={onBack}
                            aria-label="Gallery"
                        >
                            <GalleryVerticalEnd strokeWidth={1.5} />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Gallery</TooltipContent>
                </Tooltip>
            </div>

        </header>
    );
}
