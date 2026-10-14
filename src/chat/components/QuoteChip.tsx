import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Quote } from "../lib/panelRequests";
import { Hint } from "./Hint";

function sourceOf(quote: Quote) {
    try {
        if (quote.url) return new URL(quote.url).hostname.replace(/^www\./, "");
    } catch { /* Fall back to the title. */ }
    return quote.title ?? "";
}

/** Long quotes are clamped to a few lines; the tooltip shows more of them. */
const HINT_MAX = 600;

/** Page text quoted with "Ask Sloth": a left-ruled excerpt with where it came from. */
export function QuoteChip({ quote, onRemove, className }: { quote: Quote; onRemove?: () => void; className?: string }) {
    const source = sourceOf(quote);
    const long = quote.text.length > 180 || quote.text.split("\n").length > 3;
    return (
        <Hint label={long ? (quote.text.length > HINT_MAX ? quote.text.slice(0, HINT_MAX - 1) + "…" : quote.text) : undefined}
              className="block max-w-sm whitespace-pre-wrap break-words text-[11px]">
            <figure className={cn("relative flex min-w-0 flex-col gap-1 border-l-2 border-accent py-0.5 pl-2.5", onRemove && "pr-7", className)}>
                <blockquote className="line-clamp-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-foreground/80">
                    {quote.text}
                </blockquote>
                {source && (
                    <figcaption className="truncate font-mono text-[10px] text-muted-foreground">{source}</figcaption>
                )}
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label="Remove quote"
                        className="absolute right-0 top-0 inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-3" />
                    </button>
                )}
            </figure>
        </Hint>
    );
}
