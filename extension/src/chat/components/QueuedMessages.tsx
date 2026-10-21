import { Clock, Paperclip, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { QueuedMessage } from "../hooks/useAgent";
import { Eyebrow, CARD_DUR, CARD_EASE } from "./askUser/shared";

/** What a queued message carries besides its text, as a short label. */
function extras(q: QueuedMessage) {
    const parts = [
        q.attachments?.length && `${q.attachments.length} file${q.attachments.length > 1 ? "s" : ""}`,
        q.pickedElements?.length && `${q.pickedElements.length} element${q.pickedElements.length > 1 ? "s" : ""}`,
        q.quotes?.length && `${q.quotes.length} quote${q.quotes.length > 1 ? "s" : ""}`,
    ].filter(Boolean);
    return parts.join(" · ");
}

/** Messages sent while Sloth works. The run reads them before its next step, or they start the next run. */
export function QueuedMessages({ queued, onRemove, onEdit }: {
    queued: QueuedMessage[];
    onRemove: (id: string) => void;
    onEdit: (id: string) => void;
}) {
    if (!queued.length) return null;
    return (
        <section
            aria-label="Queued messages"
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
        >
            <div className="flex flex-col gap-2 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Clock className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <Eyebrow>Sloth reads {queued.length > 1 ? "these" : "this"} before its next step</Eyebrow>
                </header>
                <ul className="flex max-h-[9rem] flex-col gap-1.5 overflow-y-auto [scrollbar-width:thin]">
                    {queued.map((q) => (
                        <li key={q.id} className="flex items-start gap-2 rounded-lg border border-border bg-secondary px-2.5 py-1.5">
                            <div className="min-w-0 flex-1">
                                {q.text && <p className="line-clamp-2 break-words text-[13px] leading-relaxed text-secondary-foreground">{q.text}</p>}
                                {extras(q) && (
                                    <p className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                                        <Paperclip className="size-3" strokeWidth={1.75} />
                                        {extras(q)}
                                    </p>
                                )}
                            </div>
                            <Button type="button" variant="ghost" size="icon-xs" onClick={() => onEdit(q.id)}
                                aria-label="Move back to the input to edit" title="Edit"
                                className="text-muted-foreground hover:text-foreground">
                                <Pencil className="size-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon-xs" onClick={() => onRemove(q.id)}
                                aria-label="Remove queued message" title="Remove"
                                className="text-muted-foreground hover:text-foreground">
                                <X className="size-3.5" />
                            </Button>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

