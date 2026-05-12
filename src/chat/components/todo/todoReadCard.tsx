import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "../../hooks/useAgent";
import type { TodoItem } from "../../lib/storage";
import {
    Eyebrow,
    PriorityRail,
    PriorityTag,
    StatusGlyph,
    TODO_DUR,
    TODO_EASE,
} from "./shared";

interface ReadResult {
    items?: TodoItem[];
    error?: string;
}

function summarize(items: TodoItem[]): {
    inProgress: TodoItem | null;
    pendingCount: number;
    doneCount: number;
} {
    const inProgress = items.find((i) => i.status === "in_progress") ?? null;
    let pendingCount = 0;
    let doneCount = 0;
    for (const item of items) {
        if (item.status === "pending") pendingCount++;
        else if (item.status === "completed") doneCount++;
    }
    return { inProgress, pendingCount, doneCount };
}

export function TodoReadCard({ tc }: { tc: ToolCall }) {
    const result = (tc.result ?? {}) as ReadResult;
    const isCalling = tc.status === "calling";
    const isError = tc.status === "error" || !!result.error;

    if (isCalling) {
        return (
            <article className="rounded-md border border-border bg-card p-4">
                <header className="mb-3 flex items-center justify-between">
                    <Eyebrow>Reading…</Eyebrow>
                </header>
                <div className="space-y-2.5">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/4" />
                </div>
            </article>
        );
    }

    if (isError) {
        return (
            <article
                className="rounded-md border border-destructive/40 bg-card p-4"
                style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
            >
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="size-3.5" strokeWidth={2} />
                    <span>{result.error ?? "Could not read the list"}</span>
                </div>
            </article>
        );
    }

    const items = result.items ?? [];

    if (items.length === 0) {
        return (
            <article
                className="rounded-md border border-border bg-card px-4 py-3"
                style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
            >
                <div className="flex items-baseline justify-between gap-3">
                    <Eyebrow>Current list</Eyebrow>
                    <span className="font-heading text-[15px] italic text-muted-foreground">
                        Empty. Nothing on the agenda.
                    </span>
                </div>
            </article>
        );
    }

    const { pendingCount, doneCount } = summarize(items);

    return (
        <article
            className="rounded-md border border-border bg-card p-4"
            style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
        >
            <header className="mb-3 flex items-baseline justify-between gap-3">
                <Eyebrow>Current list</Eyebrow>
                <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                    {doneCount}/{items.length} done
                    {pendingCount > 0 && ` · ${pendingCount} pending`}
                </span>
            </header>

            <ul className="flex flex-col">
                {items.map((item) => {
                    const isDone = item.status === "completed";
                    const isInProgress = item.status === "in_progress";
                    return (
                        <li
                            key={item.id}
                            className="relative flex items-start gap-3 py-2 pl-3 pr-2 border-b border-border/60 last:border-b-0"
                        >
                            <PriorityRail priority={item.priority} dim={isDone} />
                            <span className="mt-[3px]">
                                <StatusGlyph status={item.status} dim={isDone} />
                            </span>
                            <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                                <span
                                    className={cn(
                                        "text-sm leading-snug",
                                        isDone
                                            ? "text-muted-foreground"
                                            : "text-foreground",
                                        isInProgress && "font-medium",
                                    )}
                                >
                                    {item.content}
                                </span>
                                <span className="flex shrink-0 items-baseline gap-2">
                                    {isInProgress && (
                                        <span className="font-heading text-[13px] italic text-accent">
                                            doing now
                                        </span>
                                    )}
                                    <PriorityTag priority={item.priority} />
                                </span>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </article>
    );
}