import { useState } from "react";
import { MousePointerClick, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Hint } from "./Hint";
import { ZoomableImage } from "./ImageLightbox";

/** A picked element in the composer: the HTML goes to the model, the screenshot is only shown here. */
export interface PickedElement {
    html: string;
    /** Data URL of the element's visible area, when the capture succeeded. */
    screenshot?: string | null;
}

/** Removes what the element picker itself added: its outline and data-tampersloth-* markers. */
function withoutPickerMarks(html: string) {
    const openTag = html.match(/^<[^>]*>/)?.[0];
    if (!openTag) return html;
    let cleaned = openTag.replace(/\s+data-tampersloth-[\w-]+(="[^"]*"|='[^']*')?/g, "");
    cleaned = cleaned.replace(/\sstyle=(["'])(.*?)\1/, (_all, quote: string, style: string) => {
        const kept = style.split(";").map(rule => rule.trim()).filter(rule => rule && !/^outline(-offset)?\s*:/i.test(rule));
        return kept.length ? ` style=${quote}${kept.join("; ")}${quote}` : "";
    });
    return cleaned + html.slice(openTag.length);
}

function getElementInfo(html: string) {
    const clean = withoutPickerMarks(html);
    const tag = clean.match(/^<(\w+)/)?.[1].toLowerCase() ?? "element";
    const id = clean.match(/\bid=["']([^"']+)["']/)?.[1];
    const className = clean.match(/\bclass=["']([^"']+)["']/)?.[1];
    const selector = id ? `${tag}#${id}` : className ? `${tag}.${className.trim().split(/\s+/)[0]}` : tag;
    // Visible text gives each chip a recognizable label even when selectors repeat.
    const text = clean.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    const snippet = clean.length > 400 ? clean.slice(0, 397) + "…" : clean;
    return { selector, text, snippet };
}

interface PickedElementChipProps {
    html: string;
    /** Screenshot of the element; without one (or if it fails to load) the chip shows the tag. */
    imageUrl?: string | null;
    onRemove?: () => void;
    className?: string;
}

const SNIPPET_HINT = "block max-w-sm whitespace-pre-wrap break-all font-mono text-[10px]";

/** A picked element: its screenshot when there is one, else a compact pill. The cleaned HTML is in the tooltip. */
export function PickedElementChip({ html, imageUrl, onRemove, className }: PickedElementChipProps) {
    const { selector, text, snippet } = getElementInfo(html);
    const [broken, setBroken] = useState<string | null>(null);
    if (imageUrl && broken !== imageUrl) {
        return (
            <Hint label={snippet} className={SNIPPET_HINT}>
                <div className={cn("group relative max-w-full overflow-hidden rounded-md border border-border bg-muted", className)}>
                    <ZoomableImage src={imageUrl} alt={`Picked element ${selector}`}>
                        <img
                            src={imageUrl}
                            alt={`Picked element ${selector}`}
                            onError={() => setBroken(imageUrl)}
                            className="block max-h-24 max-w-[12rem] object-contain"
                        />
                    </ZoomableImage>
                    <span className="absolute bottom-1 left-1 inline-flex max-w-[calc(100%-0.5rem)] items-center gap-1 rounded-sm bg-background/90 px-1 py-px font-mono text-[10px] text-accent">
                        <MousePointerClick className="size-2.5 shrink-0" strokeWidth={1.5} aria-hidden />
                        <span className="truncate">{selector}</span>
                    </span>
                    {onRemove && (
                        <button
                            type="button"
                            onClick={onRemove}
                            aria-label={`Remove picked element ${selector}`}
                            className="absolute right-1 top-1 inline-flex size-[18px] items-center justify-center rounded-full bg-foreground/70 text-background transition-colors hover:bg-foreground/90"
                        >
                            <X className="size-2.5" strokeWidth={2} />
                        </button>
                    )}
                </div>
            </Hint>
        );
    }
    return (
        <Hint label={snippet} className={SNIPPET_HINT}>
            <div
                className={cn("inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-md border border-border bg-background pl-2 text-[11px]", onRemove ? "pr-0.5" : "pr-2", className)}
            >
                <MousePointerClick className="size-3 shrink-0 text-accent" strokeWidth={1.5} aria-hidden />
                <span className="shrink-0 font-mono text-accent">{selector}</span>
                {text && <span className="min-w-0 max-w-[10rem] truncate text-muted-foreground">{text}</span>}
                {onRemove && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label={`Remove picked element ${selector}`}
                        className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <X className="size-3" />
                    </button>
                )}
            </div>
        </Hint>
    );
}
