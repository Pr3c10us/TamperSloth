import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ThinkingBlockProps {
    text: string;
    isStreaming?: boolean;
}

export function ThinkingBlock({ text, isStreaming = false }: ThinkingBlockProps) {
    const [open, setOpen] = useState(false);

    return (
        <div className="overflow-hidden rounded border border-border">
            <Button
                variant="ghost"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                className="group flex h-auto w-full items-center gap-2 rounded-none px-3 py-2 text-left hover:bg-muted/50"
            >
                {isStreaming ? (
                    <span
                        className="size-1.5 shrink-0 rounded-full bg-accent"
                        style={{ animation: "slothPulse 1.4s cubic-bezier(.22,.61,.36,1) infinite" }}
                    />
                ) : (
                    <Brain className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                )}
                <span className="flex-1 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                    Thinking
                </span>
                {!isStreaming && (
                    <ChevronDown
                        className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-[240ms]"
                        style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                        strokeWidth={1.5}
                    />
                )}
            </Button>
            {open && !isStreaming && (
                <div className="border-t border-border bg-muted/20 px-3 py-3">
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                        {text}
                    </pre>
                </div>
            )}
        </div>
    );
}
