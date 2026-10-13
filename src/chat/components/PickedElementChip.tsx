import { MousePointerClick, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
    onRemove?: () => void;
    className?: string;
}

/** Compact pill for a picked element; the cleaned HTML is in its tooltip. */
export function PickedElementChip({ html, onRemove, className }: PickedElementChipProps) {
    const { selector, text, snippet } = getElementInfo(html);
    return (
        <div
            title={snippet}
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
    );
}
