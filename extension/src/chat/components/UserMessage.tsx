import { memo, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatMessage, StoredAttachment } from "../hooks/useAgent";
import { attachmentUrl } from "../lib/attachmentUrls";
import { MarkdownContent } from "./Markdown";
import { PickedElementChip } from "./PickedElementChip";
import { AttachmentChip } from "./AttachmentChip";
import { QuoteChip } from "./QuoteChip";

// Stored chats only keep an attachment id; the thumbnail URL is minted from IndexedDB.
function SentAttachment({ att }: { att: StoredAttachment }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (att.kind !== "image" || !att.id) return;
        let live = true;
        void attachmentUrl(att.id).then((u) => live && setUrl(u));
        return () => { live = false; };
    }, [att.id, att.kind]);
    return <AttachmentChip att={{ ...att, url }} />;
}

// A picked element shows its screenshot; once that is gone it falls back to the tag pill.
function SentPickedElement({ html, shotId }: { html: string; shotId?: string | null }) {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!shotId) return;
        let live = true;
        void attachmentUrl(shotId).then((u) => live && setUrl(u));
        return () => { live = false; };
    }, [shotId]);
    return <PickedElementChip html={html} imageUrl={url} />;
}

// Streaming re-renders the whole list on every delta; `msg` keeps its identity
// for every message except the one being written, so memo skips the rest.
// `onEdit` is absent while the chat is working: a message can only be edited between runs.
export const UserMessage = memo(function UserMessage({ msg, onEdit }: { msg: ChatMessage; onEdit?: (id: string) => void }) {
    const picked = msg.pickedElements ?? [];
    const attachments = msg.attachments ?? [];
    const quotes = msg.quotes ?? [];
    return (
        <div className="group/user flex flex-col items-end gap-2">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                You
            </div>
            {attachments.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {attachments.map((a, i) => (
                        <SentAttachment key={a.id ?? i} att={a} />
                    ))}
                </div>
            )}
            {quotes.length > 0 && (
                <div className="flex w-full max-w-[85%] flex-col gap-2">
                    {quotes.map((quote, i) => (
                        <QuoteChip key={i} quote={quote} />
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
                        <SentPickedElement key={i} html={html} shotId={msg.pickedElementShots?.[i]} />
                    ))}
                </div>
            )}
            {onEdit && (
                // Out of the way until the message is hovered or focused, like the reply's actions.
                <div className="-mr-1 opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon-xs" onClick={() => onEdit(msg.id)} aria-label="Edit message"
                                className="text-muted-foreground hover:text-foreground">
                                <Pencil className="size-3.5" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">Edit and resend</TooltipContent>
                    </Tooltip>
                </div>
            )}
        </div>
    );
});
