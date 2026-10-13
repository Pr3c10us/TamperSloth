import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToolMeta, AlertCircle } from "../lib/toolMeta";
import type { ToolCall } from "@/src/chat/hooks";
import {TodoWriteCard} from "@/src/chat/components/todo/todoWriteCard.tsx";
import {TodoReadCard} from "@/src/chat/components/todo/todoReadCard.tsx";
import {TodoClearCard} from "@/src/chat/components/todo/todoClearCard.tsx";
import {AskUserCard} from "@/src/chat/components/askUser/askUserCard.tsx";
import {guidanceStatusLabel} from '../lib/guidanceStatus';

const PULSE = "slothPulse 1.4s cubic-bezier(.22,.61,.36,1) infinite";

export function ToolCallInline({ tc, i }: { tc: ToolCall, i: number }) {
    const meta = getToolMeta(tc.name);
    const isPending = tc.status === "calling";
    const isError = tc.status === "error";
    const ToolIcon = meta.icon;
    const key = tc.id + ":" + i;
    const name = tc.name;

    if (name === "TodoWrite") return <TodoWriteCard key={key} tc={tc}/>;
    if (name === "TodoRead") return <TodoReadCard key={key} tc={tc}/>;
    if (name === "TodoClear") return <TodoClearCard key={key} tc={tc}/>;
    if (name === "askUser") return <AskUserCard key={key} tc={tc}/>;

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
                {!isPending && !isError && !needsReview && guidanceResult?.status!=='cancelled' && (
                    <Check className="size-3 shrink-0 text-accent" strokeWidth={2.5} />
                )}
            </div>
        </div>
    );
}
