import {Children, isValidElement, useEffect, useId, useRef, useState, type ReactNode} from "react";
import {ChevronRight, type LucideIcon} from "lucide-react";
import {cn} from "@/lib/utils";
import {Hint} from "../Hint";

/**
 * Shared anatomy for the agent's work trace — thinking and tool calls render as
 * steps on one rail: a status node, a title, quiet metadata, and an optional
 * collapsible body.
 */

export type StepState = "active" | "done" | "error" | "stopped";

const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Re-renders on an interval while `active`, for live elapsed timers. */
export function useNow(active: boolean, interval = 1000) {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        if (!active) return;
        setNow(Date.now());
        const id = setInterval(() => setNow(Date.now()), interval);
        return () => clearInterval(id);
    }, [active, interval]);
    return now;
}

/**
 * Reveals streamed text at a steady pace. Providers deliver reasoning in uneven
 * bursts; easing toward the latest text turns them into continuous motion while
 * never falling more than a few frames behind.
 */
export function useSmoothText(text: string, active: boolean) {
    const [shown, setShown] = useState(() => active ? 0 : text.length);
    const target = useRef(text);
    target.current = text;
    useEffect(() => {
        if (!active || prefersReducedMotion()) return;
        let frame = 0;
        const tick = () => {
            setShown(previous => {
                const remaining = target.current.length - previous;
                return remaining <= 0 ? previous : previous + Math.max(2, Math.ceil(remaining / 8));
            });
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [active]);
    return active && !prefersReducedMotion() ? text.slice(0, Math.min(shown, text.length)) : text;
}

/** Circular status node that sits on the trace rail. */
export function StepNode({icon: Icon, state}: { icon: LucideIcon; state: StepState }) {
    return (
        <span
            aria-hidden
            className={cn(
                // Positioned after the rail segments in the DOM, so it paints over them without a z-index.
                "relative inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-background transition-colors duration-300",
                state === "active" && "ts-ring border-accent/60 text-accent",
                state === "done" && "border-border text-muted-foreground",
                state === "stopped" && "border-dashed border-border text-muted-foreground/70",
                state === "error" && "border-destructive/50 bg-destructive/10 text-destructive",
            )}
        >
            <Icon className="size-[11px]" strokeWidth={2}/>
        </span>
    );
}


function Chevron({open}: { open: boolean }) {
    return (
        <ChevronRight
            aria-hidden
            className={cn(
                "size-3.5 shrink-0 text-muted-foreground/70 transition-[transform,opacity] duration-200",
                "opacity-60 group-hover/step:opacity-100",
                open && "rotate-90 opacity-100",
            )}
            strokeWidth={1.75}
        />
    );
}

/** Collapsible body; inert keeps it out of tab order and screen readers while closed. */
function Collapse({id, open, children}: { id: string; open: boolean; children: ReactNode }) {
    return (
        <div id={id} className="ts-collapse" data-open={open} inert={!open}>
            <div>{children}</div>
        </div>
    );
}

interface StepProps {
    icon: LucideIcon;
    state: StepState;
    title: ReactNode;
    /** Changes when the title's meaning changes, so the new title fades in. */
    titleKey?: string;
    /** Native tooltip for the title row, e.g. an error message. */
    hint?: string;
    meta?: ReactNode;
    /** Collapsible body; the step is expandable only when present. */
    children?: ReactNode;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    trailing?: ReactNode;
}

export function Step({icon, state, title, titleKey, hint, meta, children, open = false, onOpenChange, trailing}: StepProps) {
    const bodyId = useId();
    const expandable = children != null && onOpenChange != null;
    const header = (
        <>
            <StepNode icon={icon} state={state}/>
            <span
                key={titleKey}
                className={cn(
                    "ts-enter min-w-0 flex-1 truncate text-[13px] leading-5",
                    state === "active" && "ts-shimmer",
                    state === "done" && "text-foreground/80",
                    state === "stopped" && "text-muted-foreground",
                    state === "error" && "text-destructive",
                )}
            >
                {title}
            </span>
            {meta && <span className="shrink-0 font-mono text-[10px] tabular-nums tracking-[.04em] text-muted-foreground">{meta}</span>}
            {expandable && <Chevron open={open}/>}
        </>
    );
    const headerClass = "group/step flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left";

    return (
        <div>
            <div className="flex min-w-0 items-center gap-1">
                <Hint label={hint} align="start">
                    {expandable ? (
                        <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={bodyId}
                            onClick={() => onOpenChange(!open)}
                            className={cn(headerClass, "cursor-pointer transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-0")}
                        >
                            {header}
                        </button>
                    ) : (
                        <div className={headerClass}>{header}</div>
                    )}
                </Hint>
                {trailing}
            </div>
            {children != null && (
                <Collapse id={bodyId} open={open}>
                    <div className="pb-1.5 pl-9 pr-1.5 pt-0.5">{children}</div>
                </Collapse>
            )}
        </div>
    );
}

/**
 * A sequence's steps on one rail. The rail runs from the first status node to
 * the last, even when a step has content (such as a screenshot) below its row.
 */
export function StepList({id, open, children}: { id: string; open: boolean; children: ReactNode }) {
    const steps = Children.toArray(children);
    return (
        <Collapse id={id} open={open}>
            <div className="-mx-1.5 flex flex-col pt-1">
                {steps.map((step, i) => (
                    <div key={isValidElement(step) ? step.key : i} className="relative">
                        {i > 0 && <RailSegment from="top"/>}
                        {i < steps.length - 1 && <RailSegment from="center"/>}
                        {step}
                    </div>
                ))}
            </div>
        </Collapse>
    );
}

function RailSegment({from}: { from: "top" | "center" }) {
    return (
        <span
            aria-hidden
            className={cn("pointer-events-none absolute left-[15.5px] w-px bg-border", from === "top" ? "top-0 h-3.5" : "bottom-0 top-3.5")}
        />
    );
}

interface SequenceLineProps {
    /** id of the StepList this line expands. */
    controls: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
}

/** A muted, clickable line with a trailing chevron, e.g. "Read the page, used 3 tools ›". */
export function SequenceLine({controls, open, onOpenChange, children}: SequenceLineProps) {
    return (
        <button
            type="button"
            aria-expanded={open}
            aria-controls={controls}
            onClick={() => onOpenChange(!open)}
            className="group/step flex max-w-full cursor-pointer items-center gap-2 self-start rounded-sm text-left text-[13px] leading-6 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
        >
            {children}
            <Chevron open={open}/>
        </button>
    );
}
