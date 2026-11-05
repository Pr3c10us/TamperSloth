import { X } from "lucide-react";
import { cn } from "@/ui/utils";
import { Button } from "@/ui/shadcn/button";
import { Badge } from "@/ui/shadcn/badge";
import { ZoomableImage } from "@/pages/chat/messages/ImageLightbox";
import type { PendingAttachment } from "@/agent/conversation/attachments";

interface AttachmentChipProps {
    att: PendingAttachment;
    onRemove?: () => void;
    /** Larger, softer thumbnail used inside the composer card. */
    large?: boolean;
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
    return (
        <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClick}
            aria-label="Remove attachment"
            className="absolute right-1 top-1 size-[18px] rounded-full bg-foreground/70 p-0 text-background hover:bg-foreground/90"
        >
            <X className="size-2.5" strokeWidth={2} />
        </Button>
    );
}

function PlaceholderImage({ label }: { label: string }) {
    return (
        <div
            className="flex h-full w-full items-end p-1"
            style={{
                backgroundImage:
                    "repeating-linear-gradient(45deg, var(--placeholder-a), var(--placeholder-a) 4px, var(--placeholder-b) 4px, var(--placeholder-b) 8px)",
            }}
        >
            <span className="rounded-sm bg-background px-1 py-px font-mono text-[8px] tracking-[.04em] text-foreground/80">
                {label.length > 12 ? label.slice(0, 11) + "…" : label}
            </span>
        </div>
    );
}

export function AttachmentChip({ att, onRemove, large }: AttachmentChipProps) {
    if (att.kind === "image") {
        return (
            <div
                className={cn(
                    "relative flex items-center justify-center overflow-hidden border border-border bg-muted",
                    large ? "size-28 rounded-xl shadow-xs" : "size-20 rounded-md",
                )}
            >
                {att.url ? (
                    <ZoomableImage src={att.url} alt={att.name} className="size-full">
                        <img src={att.url} alt="" className="size-full object-cover" />
                    </ZoomableImage>
                ) : (
                    <PlaceholderImage label={att.name} />
                )}
                {onRemove && <RemoveBtn onClick={onRemove} />}
            </div>
        );
    }
    return (
        <div
            className={cn(
                "relative inline-flex max-w-[200px] items-center gap-2 border border-border bg-card px-2.5 py-1.5",
                large ? "rounded-xl" : "rounded-md",
                onRemove && "pr-7",
            )}
        >
            <Badge className="size-[22px] shrink-0 rounded-sm bg-foreground px-0 font-mono text-[8px] tracking-[.04em] text-background hover:bg-foreground">
                {att.ext || "FILE"}
            </Badge>
            <div className="flex min-w-0 flex-col">
                <span className="truncate text-xs text-foreground">{att.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{att.size}</span>
            </div>
            {onRemove && <RemoveBtn onClick={onRemove} />}
        </div>
    );
}
