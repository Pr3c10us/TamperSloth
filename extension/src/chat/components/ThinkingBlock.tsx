import {memo, useLayoutEffect, useRef, useState} from "react";
import {Brain, Lightbulb} from "lucide-react";
import {cn} from "@/lib/utils";
import {MarkdownContent} from "./Markdown";
import {Step, useNow, useSmoothText} from "./steps/Step";
import {thinkingDuration, type ThinkingContent} from "../lib/reasoning";
import {formatElapsedTime} from "../lib/efficiency";

// Only the tail is shown while streaming, so re-parsing stays cheap per frame.
const PREVIEW_CHARS = 700;
const THINKING_TEXT = "text-[12.5px] leading-relaxed text-muted-foreground [&_p]:my-1 [&_p]:text-[12.5px] [&_strong]:text-foreground/75 [&_h1]:text-[13px] [&_h2]:text-[13px] [&_h3]:text-[13px] [&_h4]:text-[13px] [&_li]:text-[12.5px]";

interface ThinkingBlockProps {
    block: ThinkingContent;
    /** True while this run is still streaming. */
    live: boolean;
}

function doneLabel(duration: number | undefined) {
    if (duration === undefined) return "Thought";
    if (duration < 1000) return "Thought briefly";
    return `Thought for ${formatElapsedTime(duration)}`;
}

/** Cuts streamed text to its last few paragraphs without splitting a line. */
function previewTail(text: string) {
    if (text.length <= PREVIEW_CHARS) return text;
    const tail = text.slice(-PREVIEW_CHARS);
    const lineBreak = tail.indexOf("\n");
    return lineBreak >= 0 && lineBreak < PREVIEW_CHARS / 2 ? tail.slice(lineBreak + 1) : tail;
}

/** Closes a half-streamed bold or code span so it renders instead of showing raw markers. */
function closeOpenMarkdown(text: string) {
    let closed = text;
    if ((closed.match(/\*\*/g)?.length ?? 0) % 2) closed += "**";
    if ((closed.replace(/```/g, "").match(/`/g)?.length ?? 0) % 2) closed += "`";
    return closed;
}

/** Bottom-anchored live preview; the top fades only once older lines scroll out. */
function ThinkingPreview({text}: { text: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [overflowing, setOverflowing] = useState(false);
    useLayoutEffect(() => {
        const element = ref.current;
        if (element) setOverflowing(element.scrollHeight > element.clientHeight + 1);
    }, [text]);
    return (
        <div ref={ref} className={cn("flex max-h-[7.5rem] flex-col justify-end overflow-hidden", overflowing && "ts-fade-top")}>
            <MarkdownContent content={closeOpenMarkdown(previewTail(text))} className={THINKING_TEXT}/>
        </div>
    );
}

/** True when a finished block has nothing worth showing (empty and instant). */
export function isTrivialThinking(block: ThinkingContent, live: boolean) {
    if (block.text.trim() || block.redacted) return false;
    if (live && block.endedAt === undefined) return false;
    const duration = thinkingDuration(block);
    return duration === undefined || duration < 1000;
}

export const ThinkingBlock = memo(function ThinkingBlock({block, live}: ThinkingBlockProps) {
    // null: follow the default (preview while thinking, collapsed after).
    const [userOpen, setUserOpen] = useState<boolean | null>(null);
    const active = live && block.endedAt === undefined;
    const now = useNow(active);
    const text = block.text.trim();
    const smooth = useSmoothText(text, active);
    const duration = thinkingDuration(block, now);

    // Default: a live preview of the latest reasoning while thinking, which
    // collapses away when thinking ends. Opening shows the full text.
    const open = userOpen ?? active;
    let body;
    if (text && userOpen) {
        body = (
            <div className="max-h-80 overflow-y-auto border-l border-border pl-3 [scrollbar-width:thin]">
                <MarkdownContent content={active ? closeOpenMarkdown(smooth) : text} className={THINKING_TEXT}/>
            </div>
        );
    } else if (text) {
        body = <ThinkingPreview text={active ? smooth : text}/>;
    } else if (block.redacted) {
        body = <p className="text-[12px] italic text-muted-foreground">The provider encrypted this reasoning, so it can't be shown.</p>;
    }

    return (
        <Step
            icon={active ? Lightbulb : Brain}
            state={active ? "active" : "done"}
            titleKey={active ? "thinking" : "thought"}
            title={active ? "Thinking" : doneLabel(thinkingDuration(block))}
            meta={active && duration !== undefined ? formatElapsedTime(Math.max(duration, 1000)) : undefined}
            open={open && body !== undefined}
            onOpenChange={body !== undefined ? (next) => setUserOpen(next) : undefined}
        >
            {body}
        </Step>
    );
});
