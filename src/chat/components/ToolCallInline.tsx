import { Check } from "lucide-react";
import { getToolMeta, AlertCircle } from "../lib/toolMeta";
import type { ToolCall } from "../hooks/useAgent";

export function ToolCallInline({ tc }: { tc: ToolCall }) {
    const meta = getToolMeta(tc.name);
    const Icon = tc.status === "error" ? AlertCircle : meta.icon;
    const isPending = tc.status === "calling";

    const label =
        tc.status === "calling"
            ? meta.activeLabel
            : tc.status === "error"
                ? meta.errorLabel
                : meta.doneLabel;

    return (
        <div className="flex flex-col items-start gap-1.5">
            <div
                className="inline-flex w-full items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11.5px] transition-colors cursor-default"
            >
                {isPending ? (
                    <span
                        className="size-2 rounded-full bg-accent"
                        style={{ animation: "slothPulse 1.4s cubic-bezier(.22,.61,.36,1) infinite" }}
                    />
                ) : tc.status === "error" ? (
                    <Icon className="size-3 text-destructive" strokeWidth={2} />
                ) : (
                    <Check className="size-3 text-accent" strokeWidth={2} />
                )}
                <span className="shrink-0 text-foreground/80">{meta.displayName}</span>
                <span className="text-border">·</span>
                <span className="truncate text-foreground max-w-[200px]">{label}</span>
            </div>
        </div>
    );
}
