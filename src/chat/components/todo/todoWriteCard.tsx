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

interface WriteArgs {
    description?: string;
    items?: TodoItem[];
}

interface WriteResult {
    success?: true;
    previous?: TodoItem[];
    current?: TodoItem[];
    changedIds?: string[];
    error?: string;
}

export function TodoWriteCard({ tc }: { tc: ToolCall }) {
    const args = tc.args as WriteArgs;
    const result = (tc.result ?? {}) as WriteResult;
    const isCalling = tc.status === "calling";
    const isError = tc.status === "error" || !!result.error;

    if (isCalling) {
        return (
            <article className="rounded-md border border-border bg-card p-3.5">
                <header className="mb-3 flex items-center justify-between">
                    <Eyebrow>Writing…</Eyebrow>
                </header>
                <div className="space-y-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-4/5" />
                    <Skeleton className="h-5 w-3/5" />
                </div>
            </article>
        );
    }

    if (isError) {
        return (
            <article
                className="rounded-md border border-destructive/40 bg-card p-3.5"
                style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
            >
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="size-3.5" strokeWidth={2} />
                    <span>{result.error ?? "List write failed"}</span>
                </div>
            </article>
        );
    }

    const current = result.current ?? args.items ?? [];
    const changed = new Set(result.changedIds ?? []);
    const isEmpty = current.length === 0;
    const changedCount = changed.size;

    return (
        <article
            className="rounded-md border border-border bg-card p-3.5"
            style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
        >
            <header className="mb-3 flex items-baseline justify-between gap-3">
                <h4
                    className="font-heading text-[20px] italic leading-none text-foreground"
                >
                    {isEmpty ? "List emptied." : "List updated."}
                </h4>
                <Eyebrow>
                    {current.length} {current.length === 1 ? "item" : "items"}
                    {changedCount > 0 && ` · ${changedCount} changed`}
                </Eyebrow>
            </header>

            {isEmpty ? (
                <p className="font-heading text-[15px] italic text-muted-foreground">
                    Nothing to track. Nap earned.
                </p>
            ) : (
                <ul className="flex flex-col">
                    {current.map((item, idx) => {
                        const isChanged = changed.has(item.id);
                        const isInProgress = item.status === "in_progress";
                        const isDone = item.status === "completed";
                        return (
                            <li
                                key={item.id}
                                className={cn(
                                    "relative flex items-start gap-3 py-2 pl-3 pr-2 border-b border-border/60 last:border-b-0",
                                )}
                                style={{
                                    animation: isChanged
                                        ? `todoWash 900ms ${TODO_EASE} 120ms both, todoEnter ${TODO_DUR}ms ${TODO_EASE} ${idx * 30}ms both`
                                        : `todoEnter ${TODO_DUR}ms ${TODO_EASE} ${idx * 30}ms both`,
                                }}
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
            )}
        </article>
    );
}