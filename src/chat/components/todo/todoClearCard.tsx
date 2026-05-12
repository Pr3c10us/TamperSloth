import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle } from "lucide-react";
import type { ToolCall } from "@/src/chat/hooks";
import type { TodoItem } from "../../lib/storage";
import { Eyebrow, TODO_DUR, TODO_EASE } from "./shared";

interface ClearResult {
    success?: true;
    cleared?: number;
    previous?: TodoItem[];
    error?: string;
}

export function TodoClearCard({ tc }: { tc: ToolCall }) {
    const result = (tc.result ?? {}) as ClearResult;
    const isCalling = tc.status === "calling";
    const isError = tc.status === "error" || !!result.error;

    if (isCalling) {
        return (
            <article className="rounded-md bg-foreground p-4 text-background">
                <Eyebrow tone="background" className="mb-2 block">
                    Clearing…
                </Eyebrow>
                <div className="space-y-2">
                    <Skeleton className="h-6 w-2/5 bg-background/15" />
                    <Skeleton className="h-3 w-1/4 bg-background/10" />
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
                    <span>{result.error ?? "Clear failed"}</span>
                </div>
            </article>
        );
    }

    const cleared = result.cleared ?? 0;
    const previous = result.previous ?? [];

    return (
        <article
            className="relative overflow-hidden rounded-md bg-foreground p-4 text-background"
            style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
        >
            <img
                src="favicon.svg"
                alt=""
                aria-hidden
                className="absolute right-3 top-3 size-6 opacity-40 invert"
            />

            <h3 className="font-heading text-[28px] italic leading-none text-background">
                Cleared.
            </h3>

            <div className="mt-2 flex items-baseline gap-2">
                <Eyebrow tone="background">
                    {cleared} {cleared === 1 ? "item" : "items"} · gone
                </Eyebrow>
            </div>

            <p className="mt-4 font-heading text-[16px] italic text-background/70">
                Nothing to track. Hang tight.
            </p>

            {previous.length > 0 && (
                <ul
                    aria-hidden
                    className="pointer-events-none mt-3 flex flex-col gap-0.5"
                    style={{
                        animation: `todoFadeOut 600ms ${TODO_EASE} 120ms both`,
                    }}
                >
                    {previous.slice(0, 4).map((item) => (
                        <li
                            key={item.id}
                            className="truncate text-xs text-background/50 line-through"
                        >
                            {item.content}
                        </li>
                    ))}
                    {previous.length > 4 && (
                        <li className="text-[10px] uppercase tracking-[.14em] text-background/30">
                            +{previous.length - 4} more
                        </li>
                    )}
                </ul>
            )}
        </article>
    );
}

