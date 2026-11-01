import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { DictationStatus } from "../hooks/useDictation";

interface DictationButtonProps {
    status: DictationStatus;
    onToggle: () => void;
}

/** The mic toggle beside Send. */
export function DictationButton({ status, onToggle }: DictationButtonProps) {
    const active = status !== "idle";
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={onToggle}
                    aria-pressed={active}
                    aria-label={active ? "Stop dictation" : "Dictate"}
                    className={cn(
                        "shrink-0 text-muted-foreground hover:text-foreground",
                        active && "bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground",
                    )}
                >
                    {status === "permission"
                        ? <MicOff className="size-[18px]" strokeWidth={1.75} />
                        : <Mic className="size-[18px]" strokeWidth={1.75} />}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{active ? "Stop dictation" : "Dictate"}</TooltipContent>
        </Tooltip>
    );
}
