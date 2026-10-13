import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToolMeta, AlertCircle } from "../lib/toolMeta";
import type { ToolCall } from "@/src/chat/hooks";
import {TodoWriteCard} from "@/src/chat/components/todo/todoWriteCard.tsx";
import {TodoReadCard} from "@/src/chat/components/todo/todoReadCard.tsx";
import {TodoClearCard} from "@/src/chat/components/todo/todoClearCard.tsx";
import {AskUserCard} from "@/src/chat/components/askUser/askUserCard.tsx";
import {guidanceStatusLabel} from '../lib/guidanceStatus';
import {toolCallTokens, type ToolMetric} from "../lib/efficiency";
import {IS_DEV} from "../lib/devMode";

const PULSE = "slothPulse 1.4s cubic-bezier(.22,.61,.36,1) infinite";

function ToolTokens({ metric }: { metric?: ToolMetric }) {
    if (!metric) return null;
    const tokens = toolCallTokens(metric);
    return (
        <span
            className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
            title={`Estimated tokens for ${metric.name}. Input: arguments the model wrote (billed as output). Output: result added to the model's context (billed as input on each later step).`}
        >
            {tokens.input.toLocaleString()} in · {tokens.output.toLocaleString()} out
        </span>
    );
}

function WithTokens({ metric, children }: { metric?: ToolMetric, children: React.ReactNode }) {
    if (!metric) return <>{children}</>;
    return (
        <div className="flex flex-col gap-1">
            {children}
            <span className="self-end"><ToolTokens metric={metric}/></span>
        </div>
    );
}

/** Dev-only: copies the failing call (name, args, error) for bug reports. */
function CopyToolError({ tc }: { tc: ToolCall }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        const report = JSON.stringify({ tool: tc.name, id: tc.id, args: tc.args, result: tc.result }, (_k, v) =>
            v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v, 2);
        await navigator.clipboard.writeText(report);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            type="button"
            onClick={copy}
            title="Copy tool error (dev only)"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-[3px] text-destructive hover:bg-destructive/15"
        >
            {copied ? <Check className="size-3" strokeWidth={2.5} /> : <Copy className="size-3" strokeWidth={2} />}
        </button>
    );
}

export function ToolCallInline({ tc, i, metric }: { tc: ToolCall, i: number, metric?: ToolMetric }) {
    const meta = getToolMeta(tc.name);
    const isPending = tc.status === "calling";
    const isError = tc.status === "error";
    const ToolIcon = meta.icon;
    const key = tc.id + ":" + i;
    const name = tc.name;

    if (name === "TodoWrite") return <WithTokens key={key} metric={metric}><TodoWriteCard tc={tc}/></WithTokens>;
    if (name === "TodoRead") return <WithTokens key={key} metric={metric}><TodoReadCard tc={tc}/></WithTokens>;
    if (name === "TodoClear") return <WithTokens key={key} metric={metric}><TodoClearCard tc={tc}/></WithTokens>;
    if (name === "askUser") return <WithTokens key={key} metric={metric}><AskUserCard tc={tc}/></WithTokens>;

    const guidanceResult=['waitForUserAction','annotatePage'].includes(name) ? tc.result as Parameters<typeof guidanceStatusLabel>[0] : undefined;
    const needsReview=guidanceResult?.status==='needsReview';
    const label = isPending ? meta.activeLabel : isError ? meta.errorLabel : name==='annotatePage' && needsReview ? 'Guide drawing needs a new target'
        : name==='waitForUserAction' ? guidanceStatusLabel(guidanceResult) : meta.doneLabel;
    const description = tc.args?.description as string | undefined;

    return (
        <div className="flex flex-col items-start gap-1.5">
            <div
                className={cn(
                    "inline-flex w-full items-center gap-2.5 rounded-md border bg-card px-2.5 py-1.5 font-heading text-sm transition-colors cursor-default",
                    isError ? "border-destructive/40" : "border-border",
                )}
            >
                <span
                    aria-hidden
                    className={cn(
                        "inline-flex size-5 shrink-0 items-center justify-center rounded-[3px]",
                        isPending && "bg-accent/15 text-accent",
                        isError && "bg-destructive/15 text-destructive",
                        !isPending && !isError && "bg-foreground/10 text-foreground/80",
                    )}
                    style={isPending ? { animation: PULSE } : undefined}
                >
                    {isError ? (
                        <AlertCircle className="size-3" strokeWidth={2} />
                    ) : (
                        <ToolIcon className="size-3" strokeWidth={2} />
                    )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate", isError ? "text-destructive" : "text-foreground/80")}>
                        {description || label}
                    </span>
                {/*    {description && (*/}
                {/*    <span className="truncate font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">*/}
                {/*            {label}*/}
                {/*        </span>*/}
                {/*)}*/}
                </span>
                <ToolTokens metric={metric}/>
                {IS_DEV && isError && <CopyToolError tc={tc}/>}
                {!isPending && !isError && !needsReview && guidanceResult?.status!=='cancelled' && guidanceResult?.status!=='visualCheck' && (
                    <Check className="size-3 shrink-0 text-accent" strokeWidth={2.5} />
                )}
            </div>
        </div>
    );
}
