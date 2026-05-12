import {useCallback, useState} from "react";
import {Check, Copy} from "lucide-react";
import type {ChatMessage} from "@/src/chat/hooks";
import {MarkdownContent} from "./Markdown";
import {ToolCallInline} from "./ToolCallInline";
import {ThinkingBlock} from "./ThinkingBlock";
import {Button} from "@/components/ui/button";
import {StreamingDots} from "./StreamingDots";
import {TodoWriteCard} from "./todo/todoWriteCard";
import {TodoReadCard} from "./todo/todoReadCard";
import {TodoClearCard} from "./todo/todoClearCard";
import {AskUserCard} from "./askUser/askUserCard";

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

export function AssistantMessage({msg, isLoading, isLast}: AssistantMessageProps) {
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
                        const name = block.toolCall.name;
                        if (name === "TodoWrite") return <TodoWriteCard key={key} tc={block.toolCall}/>;
                        if (name === "TodoRead") return <TodoReadCard key={key} tc={block.toolCall}/>;
                        if (name === "TodoClear") return <TodoClearCard key={key} tc={block.toolCall}/>;
                        if (name === "askUser") return <AskUserCard key={key} tc={block.toolCall}/>;
                        return <ToolCallInline key={key} tc={block.toolCall}/>;
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
            {fullText && !isLoading && isLast && <CopyMessageButton text={fullText}/>}
        </div>
    );
}
