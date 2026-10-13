import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/** Most files one message can carry. */
export const MAX_ATTACHMENTS = 10;

export interface PendingAttachment {
    kind: "image" | "file";
    name: string;
    size: string;
    ext?: string;
    url?: string | null;
    mediaType?: string;
    file?: File;
}

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
                    "repeating-linear-gradient(45deg, var(--sand), var(--sand) 4px, var(--dust) 4px, var(--dust) 8px)",
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
                    <img src={att.url} alt="" className="size-full object-cover" />
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

export function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}
