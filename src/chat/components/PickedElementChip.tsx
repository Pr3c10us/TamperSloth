import { MousePointerClick, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function getElementInfo(html: string) {
    const tagMatch = html.match(/^<(\w+)/);
    const tag = tagMatch ? tagMatch[1].toLowerCase() : "element";
    const idMatch = html.match(/\bid=["']([^"']+)["']/);
    const classMatch = html.match(/\bclass=["']([^"']+)["']/);
    let selector = tag;
    if (idMatch) selector = `${tag}#${idMatch[1]}`;
    else if (classMatch) selector = `${tag}.${classMatch[1].split(/\s+/)[0]}`;
    const snippet = html.length > 240 ? html.slice(0, 237) + "…" : html;
    return { tag, selector, snippet };
}

interface PickedElementChipProps {
    html: string;
    onRemove?: () => void;
}

export function PickedElementChip({ html, onRemove }: PickedElementChipProps) {
    const { selector, snippet } = getElementInfo(html);
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-2.5 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                    <MousePointerClick className="size-3 shrink-0 text-accent" strokeWidth={1.5} />
                    <Badge variant="outline" className="rounded-sm px-1.5 font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                        Picked element
                    </Badge>
                    <span className="truncate font-mono text-[11px] text-accent">{selector}</span>
                </div>
                {onRemove && (
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={onRemove}
                        className="text-muted-foreground"
                        aria-label="Remove picked element"
                    >
                        <X />
                    </Button>
                )}
            </div>
            <pre className="m-0 overflow-x-auto whitespace-pre bg-card px-2.5 py-2 font-mono text-[11px] leading-[1.5] text-foreground">
                {snippet}
            </pre>
        </div>
    );
}
