import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TodoPriority, TodoStatus } from "../../lib/storage";

export const STATUS_LABEL: Record<TodoStatus, string> = {
    in_progress: "Doing now",
    pending: "Up next",
    completed: "Done",
};

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
};

export const TODO_EASE = "cubic-bezier(.22,.61,.36,1)";
export const TODO_DUR = 240;

// One-time keyframe + variable injection. Multiple <style> tags with the same
// rules are harmless, but we key off id to keep DevTools tidy.
const STYLE_ID = "tampersloth-todo-keyframes";
function ensureStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = `
@keyframes todoEnter {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes todoWash {
    0%   { background-color: rgba(63, 74, 42, 0.14); }
    100% { background-color: rgba(63, 74, 42, 0);   }
}
@keyframes todoFadeOut {
    from { opacity: 0.45; }
    to   { opacity: 0;    }
}
@keyframes todoCardEnter {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
`;
    document.head.appendChild(el);
}
ensureStyles();

interface StatusGlyphProps {
    status: TodoStatus;
    dim?: boolean;
}

export function StatusGlyph({ status, dim }: StatusGlyphProps) {
    if (status === "completed") {
        return (
            <span
                aria-hidden
                className={cn(
                    "inline-flex size-[14px] shrink-0 items-center justify-center rounded-[2px] bg-foreground text-background",
                    dim && "opacity-60",
                )}
            >
                <Check className="size-[10px]" strokeWidth={2.5} />
            </span>
        );
    }
    if (status === "in_progress") {
        return (
            <span
                aria-hidden
                className="inline-block size-[14px] shrink-0 rounded-[2px] bg-accent"
                style={{
                    animation: `slothPulse 1.6s ${TODO_EASE} infinite`,
                }}
            />
        );
    }
    return (
        <span
            aria-hidden
            className={cn(
                "inline-block size-[14px] shrink-0 rounded-[2px] border border-border bg-transparent",
                dim && "opacity-60",
            )}
        />
    );
}

interface PriorityRailProps {
    priority: TodoPriority;
    dim?: boolean;
}

export function PriorityRail({ priority, dim }: PriorityRailProps) {
    const base = "absolute left-0 top-0 bottom-0 w-[2px]";
    if (priority === "high") {
        return (
            <span
                aria-hidden
                className={cn(base, "bg-foreground", dim && "opacity-50")}
            />
        );
    }
    if (priority === "medium") {
        return (
            <span
                aria-hidden
                className={cn(base, "bg-border", dim && "opacity-50")}
            />
        );
    }
    return (
        <span
            aria-hidden
            className={cn(
                base,
                "bg-transparent",
                dim && "opacity-50",
            )}
            style={{
                backgroundImage:
                    "repeating-linear-gradient(to bottom, var(--border) 0 3px, transparent 3px 6px)",
            }}
        />
    );
}

export function Eyebrow({
                            children,
                            className,
                            tone = "muted",
                        }: {
    children: React.ReactNode;
    className?: string;
    tone?: "muted" | "foreground" | "background";
}) {
    const toneClass =
        tone === "background"
            ? "text-background/70"
            : tone === "foreground"
                ? "text-foreground"
                : "text-muted-foreground";
    return (
        <span
            className={cn(
                "font-mono text-[10px] uppercase tracking-[.14em]",
                toneClass,
                className,
            )}
        >
            {children}
        </span>
    );
}

export function PriorityTag({ priority }: { priority: TodoPriority }) {
    if (priority !== "high") return null;
    return (
        <span className="font-mono text-[9px] uppercase tracking-[.14em] text-foreground/70">
            High
        </span>
    );
}