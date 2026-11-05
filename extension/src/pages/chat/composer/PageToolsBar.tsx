import type { ReactNode } from "react";
import { MousePointerSquareDashed, PencilLine } from "lucide-react";
import type { DictationStatus } from "@/pages/chat/hooks/useDictation";
import { Button } from "@/ui/shadcn/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/ui/shadcn/tooltip";
import { cn } from "@/ui/utils";

function PageToolButton({ label, active, disabled, onClick, children }: {
    label: string;
    active: boolean;
    disabled: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={onClick}
                    disabled={disabled}
                    aria-pressed={active}
                    aria-label={label}
                    className={cn(
                        "text-muted-foreground hover:text-foreground",
                        active &&
                            "bg-foreground text-background hover:bg-foreground hover:text-background",
                    )}
                >
                    {children}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="top">
                {label}
            </TooltipContent>
        </Tooltip>
    );
}

/** The element picker and drawing buttons, and what they or the mic are doing right now. */
export function PageToolsBar({
    isPicking,
    isDrawing,
    disabled,
    onTogglePicker,
    onToggleDrawing,
    queuedAction,
    pageNotice,
    dictationStatus,
    dictationNotice,
}: {
    isPicking: boolean;
    isDrawing: boolean;
    disabled: boolean;
    onTogglePicker: () => void;
    onToggleDrawing: () => void;
    queuedAction: "pick" | "draw" | null;
    pageNotice: string | null;
    dictationStatus: DictationStatus;
    dictationNotice: string | null | undefined;
}) {
    return (
        <div className="flex min-w-0 items-center gap-0.5">
            <PageToolButton label="Pick a page element" active={isPicking} disabled={disabled} onClick={onTogglePicker}>
                <MousePointerSquareDashed strokeWidth={1.5} />
            </PageToolButton>
            <PageToolButton label="Draw on the page" active={isDrawing} disabled={disabled} onClick={onToggleDrawing}>
                <PencilLine strokeWidth={1.5} />
            </PageToolButton>
            {(isPicking || isDrawing || queuedAction || pageNotice || dictationStatus !== "idle" || dictationNotice) && (
                <span role="status" className="ml-1.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-accent">
                    {(isPicking || isDrawing || dictationStatus === "listening") && (
                        <span
                            className="size-1.5 shrink-0 rounded-full bg-accent"
                            style={{ animation: "slothPulse 1.4s infinite" }}
                        />
                    )}
                    <span className="truncate">
                        {dictationStatus === "listening"
                            ? "Listening · Enter sends · Esc stops"
                            : dictationStatus === "starting"
                              ? "Starting the mic…"
                              : dictationStatus === "stopping"
                                ? "Finishing up…"
                                : dictationStatus === "permission"
                                  ? "Allow the mic in the window that opened"
                                  : dictationNotice
                                    ? dictationNotice
                                    : isPicking
                            ? "Click elements · Esc when done"
                            : isDrawing
                              ? "Drawing · Add to chat when done"
                              : queuedAction
                                ? `${queuedAction === "pick" ? "Picking" : "Drawing"} starts when Sloth is done`
                                : pageNotice}
                    </span>
                </span>
            )}
        </div>
    );
}
