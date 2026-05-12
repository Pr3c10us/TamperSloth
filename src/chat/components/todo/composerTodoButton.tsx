import { useEffect, useState } from "react";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    loadTodos,
    subscribeTodos,
    type TodoItem,
} from "../../lib/storage";
import {
    Eyebrow,
    PriorityRail,
    PriorityTag,
    StatusGlyph,
    TODO_DUR,
    TODO_EASE,
} from "./shared";

interface ComposerTodoButtonProps {
    conversationId: string;
}

export function ComposerTodoButton({ conversationId }: ComposerTodoButtonProps) {
    const [todos, setTodos] = useState<TodoItem[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let cancelled = false;
        loadTodos(conversationId).then((items) => {
            if (!cancelled) setTodos(items);
        });
        const unsubscribe = subscribeTodos(conversationId, setTodos);
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [conversationId]);

    const total = todos.length;
    const inProgress = todos.find((t) => t.status === "in_progress") ?? null;
    const doneCount = todos.filter((t) => t.status === "completed").length;
    const pendingCount = todos.filter((t) => t.status === "pending").length;
    const allDone = total > 0 && doneCount === total;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="View todos"
                            aria-pressed={open}
                            className={cn(
                                "relative",
                                open && "bg-foreground text-background hover:bg-foreground hover:text-background",
                            )}
                        >
                            <ListChecks strokeWidth={1.5} />
                            {inProgress && !open && (
                                <span
                                    aria-hidden
                                    className="absolute right-1 top-1 size-1.5 rounded-full bg-accent"
                                    style={{ animation: "slothPulse 1.6s infinite" }}
                                />
                            )}
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">
                    {total === 0
                        ? "No todos yet"
                        : `${doneCount}/${total} done${inProgress ? " · 1 in progress" : ""}`}
                </TooltipContent>
            </Tooltip>

            <PopoverContent
                side="top"
                align="start"
                sideOffset={8}
                collisionPadding={12}
                className="w-[min(20rem,calc(100vw-2rem))] rounded-md border border-border bg-card p-0 text-foreground shadow-lg"
            >
                {total === 0 ? (
                    <div className="px-4 py-4">
                        <Eyebrow>Current list</Eyebrow>
                        <p className="mt-2 font-heading text-[15px] italic text-muted-foreground">
                            Nothing on the agenda. Hang tight.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        <header className="flex items-baseline justify-between gap-3 px-4 pt-3.5 pb-2">
                            <Eyebrow>Current list</Eyebrow>
                            <span className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground">
                                {doneCount}/{total} done
                                {pendingCount > 0 && ` · ${pendingCount} pending`}
                            </span>
                        </header>
                        {allDone && (
                            <p className="px-4 pb-2 font-heading text-[13px] italic text-muted-foreground">
                                All done. Nap earned.
                            </p>
                        )}
                        <ul className="flex max-h-[60vh] flex-col overflow-y-auto px-1.5 pb-1.5">
                            {todos.map((item, idx) => {
                                const isDone = item.status === "completed";
                                const isInProgress = item.status === "in_progress";
                                return (
                                    <li
                                        key={item.id}
                                        className="relative flex items-start gap-3 border-b border-border/60 py-2 pl-3 pr-2 last:border-b-0"
                                        style={{
                                            animation: `todoEnter ${TODO_DUR}ms ${TODO_EASE} ${idx * 20}ms both`,
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
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
