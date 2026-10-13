import { memo } from "react";
import type { ChatMessage } from "../hooks/useAgent";
import { MarkdownContent } from "./Markdown";
import { PickedElementChip } from "./PickedElementChip";
import { AttachmentChip } from "./AttachmentChip";

// Streaming re-renders the whole list on every delta; `msg` keeps its identity
// for every message except the one being written, so memo skips the rest.
export const UserMessage = memo(function UserMessage({ msg }: { msg: ChatMessage }) {
    const picked = msg.pickedElements ?? [];
    const attachments = msg.attachments ?? [];
    return (
        <div className="flex flex-col items-end gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                You
            </div>
            {attachments.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {attachments.map((a, i) => (
                        <AttachmentChip key={i} att={a} />
                    ))}
                </div>
            )}
            {msg.content && (
                <div className="max-w-[85%] rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-[14px] leading-relaxed text-secondary-foreground [&_p]:text-inherit [&_li]:text-inherit [&_strong]:text-inherit [&_em]:text-inherit [&_code]:text-inherit">
                    <MarkdownContent content={msg.content} />
                </div>
            )}
            {picked.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {picked.map((html, i) => (
                        <PickedElementChip key={i} html={html} />
                    ))}
                </div>
            )}
        </div>
    );
});
