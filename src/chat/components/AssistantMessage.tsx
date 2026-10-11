import {memo, useCallback, useState} from "react";
import {Check, Copy} from "lucide-react";
import type {ChatMessage} from "@/src/chat/hooks";
import {MarkdownContent} from "./Markdown";
import {ToolCallInline} from "./ToolCallInline";
import {ThinkingBlock} from "./ThinkingBlock";
import {Button} from "@/components/ui/button";
import {StreamingDots} from "./StreamingDots";
import {formatElapsedTime} from "../lib/efficiency";
import {estimateRunCost, formatCost} from "../lib/pricing";

function TextBlockContent({text}: { text: string }) {
    return (
        <>
            <div className="break-words text-sm leading-relaxed text-foreground">
                <MarkdownContent content={text}/>
            </div>
        </>
    );
}

function CopyMessageButton({text}: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handle = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [text]);
    return (
        <Button variant="ghost" size="xs" onClick={handle} className="self-start text-muted-foreground">
            {copied ? <Check/> : <Copy/>}
            <span className="font-mono text-[10px] uppercase tracking-[.08em]">
                {copied ? "Copied" : "Copy"}
            </span>
        </Button>
    );
}

interface AssistantMessageProps {
    msg: ChatMessage;
    isLoading: boolean;
    isLast: boolean;
}

// Streaming re-renders the whole list on every delta; `msg` keeps its identity
// for every message except the one being written, so memo skips the rest —
// without it each token re-parses the markdown of the entire conversation.
export const AssistantMessage = memo(function AssistantMessage({msg, isLoading, isLast}: AssistantMessageProps) {
    const [showCost, setShowCost] = useState(false);
    const cost = showCost && msg.runMetrics ? estimateRunCost(msg.runMetrics) : undefined;
    const fullText = msg.blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
                <img src="favicon.svg" alt="" className="size-4 opacity-85"/>
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                    Sloth
                </span>
            </div>
            <div className="flex flex-col gap-2">
                {msg.blocks.map((block, i) => {
                    if (block.type === "tool_call") {
                        const key = block.toolCall.id + ":" + i;
                        return <ToolCallInline key={key} i={i} tc={block.toolCall}/>;
                    }
                    if (block.type === "thinking") {
                        const isLastBlock = i === msg.blocks.length - 1;
                        return (
                            <ThinkingBlock
                                key={i}
                                text={block.text}
                                isStreaming={isLoading && isLast && isLastBlock}
                            />
                        );
                    }
                    return block.text ? <TextBlockContent key={i} text={block.text}/> : null;
                })}
            </div>
            {isLoading && isLast && <StreamingDots/>}
            {msg.runMetrics && !(isLoading && isLast) && (
                <button
                    type="button"
                    onClick={() => setShowCost(previous => !previous)}
                    aria-pressed={showCost}
                    aria-label={showCost ? "Show token counts" : "Show estimated costs in USD"}
                    title={showCost
                        ? `${msg.runMetrics.modelId ?? "Model unknown"} · Estimated USD cost at standard API rates. Click to show tokens.`
                        : "Click to show estimated input and output costs in USD"}
                    className="self-start cursor-pointer rounded-sm text-left text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                >
                    {formatElapsedTime(msg.runMetrics.elapsedMs)} elapsed
                    {msg.runMetrics.total?.input !== undefined && (showCost
                        ? ` · ${formatCost(cost?.input)} input cost`
                        : ` · ${msg.runMetrics.total.input.toLocaleString()} input tokens`)}
                    {msg.runMetrics.total?.output !== undefined && (showCost
                        ? ` · ${formatCost(cost?.output)} output cost`
                        : ` · ${msg.runMetrics.total.output.toLocaleString()} output tokens`)}
                </button>
            )}
            {fullText && !isLoading && isLast && <CopyMessageButton text={fullText}/>}
        </div>
    );
});
