import { Check } from "lucide-react";
import { getToolMeta, AlertCircle } from "../lib/toolMeta";
import type { ToolCall } from "@/src/chat/hooks";
import {TodoWriteCard} from "@/src/chat/components/todo/todoWriteCard.tsx";
import {TodoReadCard} from "@/src/chat/components/todo/todoReadCard.tsx";
import {TodoClearCard} from "@/src/chat/components/todo/todoClearCard.tsx";
import {AskUserCard} from "@/src/chat/components/askUser/askUserCard.tsx";

export function ToolCallInline({ tc, i }: { tc: ToolCall, i: number }) {
    const meta = getToolMeta(tc.name);
    const Icon = tc.status === "error" ? AlertCircle : meta.icon;
    const isPending = tc.status === "calling";
    const key = tc.id + ":" + i;
    const name = tc.name;

    if (name === "TodoWrite") return <TodoWriteCard key={key} tc={tc}/>;
    if (name === "TodoRead") return <TodoReadCard key={key} tc={tc}/>;
    if (name === "TodoClear") return <TodoClearCard key={key} tc={tc}/>;
    if (name === "askUser") return <AskUserCard key={key} tc={tc}/>;

    return (
        <div className="flex flex-col items-start gap-1.5">
            <div
                className="inline-flex w-full items-center gap-2.5 rounded-md border border-border bg-card px-2.5 py-1.5 font-heading text-sm transition-colors cursor-default"
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
                <span className="text-foreground/80 truncate">{tc.args.description}</span>
            </div>
        </div>
    );
}
