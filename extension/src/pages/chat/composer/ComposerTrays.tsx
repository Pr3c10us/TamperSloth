import { MousePointerClick, Paperclip, TextQuote } from "lucide-react";
import { MAX_ATTACHMENTS, type PendingAttachment } from "@/agent/conversation/attachments";
import type { PickedElement } from "@/agent/conversation/types";
import type { Quote } from "@/shared/panelRequests";
import { cn } from "@/ui/utils";
import { AttachmentChip } from "./AttachmentChip";
import { PickedElementChip } from "./PickedElementChip";
import { QuoteChip } from "./QuoteChip";

/** Label row for a group of attachments above the input: icon, name, count and "clear all". */
function TrayHeader({ icon, label, count, onClear }: { icon: React.ReactNode; label: string; count: string; onClear: () => void }) {
    return (
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
                {icon}
                <span className="truncate">{label}</span>
                <span className="rounded-sm border border-border px-1 tabular-nums tracking-normal text-foreground/80">{count}</span>
            </span>
            <button
                type="button"
                onClick={onClear}
                aria-label={`Clear all ${label.toLowerCase()}`}
                className="shrink-0 uppercase tracking-[.08em] text-foreground underline underline-offset-2 hover:text-accent"
            >
                Clear all
            </button>
        </div>
    );
}

/** What goes with the message, above the input: picked elements, files and quotes. */
export function ComposerTrays({
    pickedElements,
    onRemovePicked,
    onClearPicked,
    pendingFiles,
    onRemoveFile,
    onClearFiles,
    skippedFiles,
    quotes,
    onRemoveQuote,
    onClearQuotes,
}: {
    pickedElements: PickedElement[];
    onRemovePicked: (index: number) => void;
    onClearPicked: () => void;
    pendingFiles: PendingAttachment[];
    onRemoveFile: (index: number) => void;
    onClearFiles: () => void;
    /** How many files the attachment limit left out. */
    skippedFiles: number;
    quotes: Quote[];
    onRemoveQuote: (index: number) => void;
    onClearQuotes: () => void;
}) {
    return (
        <>
            {pickedElements.length > 0 && (
                <section aria-label="Picked elements" className="flex flex-col gap-1.5">
                    <TrayHeader
                        icon={<MousePointerClick className="size-3 text-accent" strokeWidth={1.75} />}
                        label="Picked elements"
                        count={String(pickedElements.length)}
                        onClear={onClearPicked}
                    />
                    {/* Previews wrap; past about two rows the list scrolls instead of pushing the input up. */}
                    <div className="flex max-h-[12.5rem] flex-wrap items-start gap-1.5 overflow-y-auto [scrollbar-width:thin]">
                        {pickedElements.map((picked, i) => (
                            <PickedElementChip
                                key={i}
                                html={picked.html}
                                imageUrl={picked.screenshot}
                                onRemove={() => onRemovePicked(i)}
                            />
                        ))}
                    </div>
                </section>
            )}

            {pendingFiles.length > 0 && (
                <section
                    aria-label="Attached files"
                    className={cn("flex flex-col gap-1.5", pickedElements.length > 0 && "border-t border-dashed border-border pt-2.5")}
                >
                    <TrayHeader
                        icon={<Paperclip className="size-3" strokeWidth={1.75} />}
                        label="Files"
                        count={`${pendingFiles.length}/${MAX_ATTACHMENTS}`}
                        onClear={onClearFiles}
                    />
                    {/* One horizontally scrolling row, so many files never push the input up. */}
                    <div className="-mx-2.5 flex gap-2 overflow-x-auto overscroll-x-contain px-2.5 pb-1 [scrollbar-width:thin]">
                        {pendingFiles.map((f, i) => (
                            <div key={i} className="shrink-0">
                                <AttachmentChip att={f} large onRemove={() => onRemoveFile(i)} />
                            </div>
                        ))}
                    </div>
                    {skippedFiles > 0 && (
                        <p role="status" className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                            Up to {MAX_ATTACHMENTS} files · {skippedFiles} not added
                        </p>
                    )}
                </section>
            )}

            {quotes.length > 0 && (
                <section
                    aria-label="Quotes"
                    className={cn(
                        "flex flex-col gap-1.5",
                        (pickedElements.length > 0 || pendingFiles.length > 0) && "border-t border-dashed border-border pt-2.5",
                    )}
                >
                    <TrayHeader
                        icon={<TextQuote className="size-3 text-accent" strokeWidth={1.75} />}
                        label="Quotes"
                        count={String(quotes.length)}
                        onClear={onClearQuotes}
                    />
                    <div className="flex max-h-[12.5rem] flex-col gap-2 overflow-y-auto [scrollbar-width:thin]">
                        {quotes.map((quote, i) => (
                            <QuoteChip
                                key={i}
                                quote={quote}
                                onRemove={() => onRemoveQuote(i)}
                            />
                        ))}
                    </div>
                </section>
            )}
        </>
    );
}
