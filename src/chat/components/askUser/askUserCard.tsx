import { AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolCall } from "../../hooks/useAgent";
import type { AskUserAnswer, AskUserOption } from "../../lib/askUserBus";
import { Eyebrow, TODO_DUR, TODO_EASE } from "../todo/shared";

interface AskUserArgs {
    description?: string;
    question?: string;
    options?: AskUserOption[];
}

interface AskUserResult {
    answer?: AskUserAnswer;
    error?: unknown;
}

function errorToString(err: unknown): string {
    if (!err) return "Question dropped";
    if (typeof err === "string") return err;
    if (err instanceof Error) return err.message || err.name || "Question dropped";
    if (typeof err === "object") {
        const anyErr = err as { message?: unknown; error?: unknown };
        if (typeof anyErr.message === "string") return anyErr.message;
        if (typeof anyErr.error === "string") return anyErr.error;
        try {
            return JSON.stringify(err);
        } catch {
            return "Question dropped";
        }
    }
    return String(err);
}

export function AskUserCard({ tc }: { tc: ToolCall }) {
    const args = (tc.args ?? {}) as AskUserArgs;
    const rawResult = tc.result;
    const result =
        rawResult && typeof rawResult === "object" && !Array.isArray(rawResult)
            ? (rawResult as AskUserResult)
            : ({} as AskUserResult);
    const isCalling = tc.status === "calling";
    const isError = tc.status === "error" || !!result.error;
    const answer = result.answer;

    const question = args.question ?? "Waiting for a question…";

    if (isError) {
        const errText =
            errorToString(result.error) !== "Question dropped"
                ? errorToString(result.error)
                : errorToString(rawResult);
        return (
            <article
                className="rounded-md border border-destructive/40 bg-card p-3.5"
                style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
            >
                <div className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="size-3.5" strokeWidth={2} />
                    <span>{errText}</span>
                </div>
            </article>
        );
    }

    return (
        <article
            className="rounded-md border border-border bg-card p-3.5"
            style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
        >
            <header className="mb-2 flex items-center gap-2">
                <HelpCircle className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                <Eyebrow>{isCalling && !answer ? "Asked you" : "You picked"}</Eyebrow>
            </header>

            <p className="font-heading text-[17px] italic leading-snug text-foreground">
                {question}
            </p>

            {answer ? (
                <div
                    className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3"
                    style={{ animation: `todoEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
                >
                    {answer.emoji && (
                        <span aria-hidden className="text-base leading-none">
                            {answer.emoji}
                        </span>
                    )}
                    <span
                        className={cn(
                            "text-sm leading-snug text-foreground",
                            answer.custom && "italic",
                        )}
                    >
                        {answer.label}
                    </span>
                    {answer.custom && (
                        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-muted-foreground">
                            custom
                        </span>
                    )}
                </div>
            ) : (
                <p className="mt-3 font-heading text-[13px] italic text-muted-foreground">
                    Waiting on you.
                </p>
            )}
        </article>
    );
}
