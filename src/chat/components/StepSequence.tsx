import {memo, useId, useState} from "react";
import type {ContentBlock} from "@/src/chat/hooks";
import {formatElapsedTime, type ToolMetric} from "../lib/efficiency";
import {thinkingDuration} from "../lib/reasoning";
import {summarizeSteps} from "../lib/stepSummary";
import {toolReason} from "../lib/toolReason";
import {SequenceLine, StepList, useNow} from "./steps/Step";
import {ThinkingBlock} from "./ThinkingBlock";
import {ToolCallInline} from "./ToolCallInline";
import {LivingDots} from "./LivingDots";

export type SequenceBlock = Exclude<ContentBlock, { type: "text" }>;

interface StepSequenceProps {
    items: { block: SequenceBlock; index: number }[];
    /** The run is streaming and no response text has followed this sequence yet. */
    live: boolean;
    metrics?: Map<string, ToolMetric>;
}

function StepItem({block, live, metrics}: { block: SequenceBlock; live: boolean; metrics?: Map<string, ToolMetric> }) {
    return block.type === "thinking"
        ? <ThinkingBlock block={block} live={live}/>
        : <ToolCallInline tc={block.toolCall} live={live} metric={metrics?.get(block.toolCall.id)}/>;
}

/** The latest step's label; it stays on screen until the next step or the reply begins. */
function liveLabel(block: SequenceBlock): string {
    if (block.type === "thinking") return "Thinking";
    return toolReason(block.toolCall.args) ?? "Working";
}

function startedAt(block: SequenceBlock) {
    return block.type === "thinking" ? block.startedAt : block.toolCall.startedAt;
}

/** Muted status line with the living dots and an elapsed timer. */
export function LiveStatus({label, labelKey, since}: { label: string; labelKey?: string; since?: number }) {
    const now = useNow(true);
    const elapsed = since !== undefined ? now - since : undefined;
    return (
        <>
            <LivingDots className="-ml-0.5"/>
            {/* Keyed by step, not text, so a streaming reason does not re-trigger the fade. */}
            <span key={labelKey} className="ts-enter min-w-0 truncate">{label}</span>
            {elapsed !== undefined && elapsed >= 1000 && (
                <span className="shrink-0 tabular-nums text-muted-foreground/80">{formatElapsedTime(elapsed)}</span>
            )}
        </>
    );
}

/**
 * Consecutive thinking and tool steps as one collapsed line. While the sequence
 * runs, the line is a live status for its latest step; once the reply starts it
 * folds into a summary. Either way, clicking it lists every step.
 */
export const StepSequence = memo(function StepSequence({items, live, metrics}: StepSequenceProps) {
    const [open, setOpen] = useState(false);
    const listId = useId();
    const [mountedAt] = useState(Date.now);
    const latest = items[items.length - 1].block;
    const since = items.map(({block}) => startedAt(block)).find(time => time !== undefined) ?? mountedAt;
    const summary = summarizeSteps(items.map(({block}) => block.type === "thinking"
        ? {kind: "thinking" as const, durationMs: thinkingDuration(block)}
        : {kind: "tool" as const, name: block.toolCall.name, args: block.toolCall.args, failed: block.toolCall.status === "error"}));

    return (
        <div className="flex flex-col">
            <SequenceLine controls={listId} open={open} onOpenChange={setOpen} hint={live ? undefined : summary}>
                {live
                    ? <LiveStatus label={liveLabel(latest)} labelKey={String(items[items.length - 1].index)} since={since}/>
                    : <span key="summary" className="ts-enter min-w-0 truncate">{summary}</span>}
            </SequenceLine>
            <StepList id={listId} open={open}>
                {items.map(({block, index}) => (
                    <StepItem key={block.type === "tool_call" ? `${block.toolCall.id}:${index}` : index} block={block} live={live} metrics={metrics}/>
                ))}
            </StepList>
        </div>
    );
});
