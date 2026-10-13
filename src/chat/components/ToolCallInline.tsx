import {memo, useState} from "react";
import {Check, Copy} from "lucide-react";
import {getToolMeta, AlertCircle} from "../lib/toolMeta";
import type {ToolCall} from "@/src/chat/hooks";
import {TodoWriteCard} from "@/src/chat/components/todo/todoWriteCard.tsx";
import {TodoReadCard} from "@/src/chat/components/todo/todoReadCard.tsx";
import {TodoClearCard} from "@/src/chat/components/todo/todoClearCard.tsx";
import {AskUserCard} from "@/src/chat/components/askUser/askUserCard.tsx";
import {toolCallTokens, type ToolMetric} from "../lib/efficiency";
import {IS_DEV} from "../lib/devMode";
import {toolReason} from "../lib/toolReason";
import {formatStepDuration, screenshotSource, toolErrorMessage} from "../lib/toolPreview";
import {toolVerb} from "../lib/stepSummary";
import {Step, useNow, type StepState} from "./steps/Step";

/** Tools that render as their own cards rather than steps. */
export const CARD_TOOLS = new Set(["TodoWrite", "TodoRead", "TodoClear", "askUser"]);

function ToolTokens({ metric }: { metric?: ToolMetric }) {
    if (!metric) return null;
    const tokens = toolCallTokens(metric);
    return (
        <span
            className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground"
            title={`Estimated tokens for ${metric.name}. Input: arguments the model wrote (billed as output). Output: result added to the model's context (billed as input on each later step).`}
        >
            {tokens.input.toLocaleString()} in · {tokens.output.toLocaleString()} out
        </span>
    );
}

function WithTokens({ metric, children }: { metric?: ToolMetric, children: React.ReactNode }) {
    if (!metric) return <>{children}</>;
    return (
        <div className="flex flex-col gap-1">
            {children}
            <span className="self-end"><ToolTokens metric={metric}/></span>
        </div>
    );
}

/** Dev-only: copies the failing call (name, args, error) for bug reports. */
function CopyToolError({ tc }: { tc: ToolCall }) {
    const [copied, setCopied] = useState(false);
    const copy = async () => {
        const report = JSON.stringify({ tool: tc.name, id: tc.id, args: tc.args, result: tc.result }, (_k, v) =>
            v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v, 2);
        await navigator.clipboard.writeText(report);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return (
        <button
            type="button"
            onClick={copy}
            title="Copy tool error (dev only)"
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive/15"
        >
            {copied ? <Check className="size-3" strokeWidth={2.5} /> : <Copy className="size-3" strokeWidth={2} />}
        </button>
    );
}

interface ToolCallInlineProps {
    tc: ToolCall;
    metric?: ToolMetric;
    /** True while this run is still streaming. */
    live: boolean;
}

/** One line: the model's reason for the call. Screenshots also show the image. */
export const ToolCallInline = memo(function ToolCallInline({ tc, metric, live }: ToolCallInlineProps) {
    const isPending = tc.status === "calling" && live;
    const now = useNow(isPending);
    const name = tc.name;

    if (name === "TodoWrite") return <WithTokens metric={metric}><TodoWriteCard tc={tc}/></WithTokens>;
    if (name === "TodoRead") return <WithTokens metric={metric}><TodoReadCard tc={tc}/></WithTokens>;
    if (name === "TodoClear") return <WithTokens metric={metric}><TodoClearCard tc={tc}/></WithTokens>;
    if (name === "askUser") return <WithTokens metric={metric}><AskUserCard tc={tc}/></WithTokens>;

    const meta = getToolMeta(name);
    const reason = toolReason(tc.args);
    const error = tc.status === "error" ? toolErrorMessage(tc.result) ?? "The tool failed." : undefined;
    const state: StepState = isPending ? "active" : tc.status === "error" ? "error" : tc.status === "calling" ? "stopped" : "done";
    const elapsed = isPending && tc.startedAt !== undefined ? now - tc.startedAt : undefined;
    const screenshot = tc.status === "done" ? screenshotSource(name, tc.result) : undefined;

    // Until the model has written its reason the title is a placeholder bar,
    // not a generic label. Calls without any reason say what the tool did.
    const verb = toolVerb(name, tc.args);
    const title = reason ?? (isPending
        ? <span aria-label={`Preparing ${meta.displayName}`} className="inline-block h-2.5 w-28 translate-y-px rounded-full bg-muted-foreground/20 align-middle"/>
        : verb.charAt(0).toUpperCase() + verb.slice(1));

    return (
        <Step
            icon={error ? AlertCircle : meta.icon}
            state={state}
            title={title}
            titleKey={reason ? "reason" : "pending"}
            hint={error ? `${meta.displayName} failed: ${error}` : state === "stopped" ? `${meta.displayName} was stopped` : meta.displayName}
            meta={elapsed !== undefined && elapsed >= 1000 ? formatStepDuration(elapsed) : metric ? <ToolTokens metric={metric}/> : undefined}
            extra={screenshot && (
                <img
                    src={screenshot}
                    alt={reason ? `Screenshot: ${reason}` : "Captured screenshot"}
                    loading="lazy"
                    className="ts-enter max-h-56 w-auto max-w-full rounded-md border border-border object-contain object-left-top"
                />
            )}
            trailing={IS_DEV && error ? <CopyToolError tc={tc}/> : undefined}
        />
    );
});
