import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ChatMessage, StoredAttachment } from "../hooks/useAgent";
import { attachmentUrl } from "../lib/attachmentUrls";
import { MarkdownContent } from "./Markdown";
import { PickedElementChip } from "./PickedElementChip";
import { AttachmentChip } from "./AttachmentChip";
import { QuoteChip } from "./QuoteChip";
import { CopyMessageButton } from "./AssistantMessage";

// Messages taller than this fold to the collapsed height, with a toggle to read the rest.
const COLLAPSE_AT = 200;
const COLLAPSED_HEIGHT = 120;

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

/** The message text in its bubble; a long message folds behind "Show more". */
function MessageBubble({ content }: { content: string }) {
    const textRef = useRef<HTMLDivElement>(null);
    const [long, setLong] = useState(false);
    const [expanded, setExpanded] = useState(false);

    // Re-measured when the panel's width changes, since that changes how the text wraps.
    useLayoutEffect(() => {
        const text = textRef.current;
        if (!text) return;
        const measure = () => setLong(text.scrollHeight > COLLAPSE_AT);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(text);
        return () => observer.disconnect();
    }, [content]);

    const collapsed = long && !expanded;
    return (
        <div className="flex max-w-[85%] flex-col items-start gap-1.5 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-[14px] leading-relaxed text-secondary-foreground [&_p]:text-inherit [&_li]:text-inherit [&_strong]:text-inherit [&_em]:text-inherit [&_code]:text-inherit">
            <div
                ref={textRef}
                className={cn("w-full overflow-hidden", collapsed && "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]")}
                style={collapsed ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
            >
                <MarkdownContent content={content} />
            </div>
            {long && (
                <button
                    type="button"
                    onClick={() => setExpanded((open) => !open)}
                    aria-expanded={expanded}
                    className="rounded-sm text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                    {expanded ? "Show less" : "Show more"}
                </button>
            )}
        </div>
    );
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
            {msg.content && <MessageBubble content={msg.content} />}
            {picked.length > 0 && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                    {picked.map((html, i) => (
                        <SentPickedElement key={i} html={html} shotId={msg.pickedElementShots?.[i]} />
                    ))}
                </div>
            )}
            {(msg.content || onEdit) && (
                // Out of the way until the message is hovered or focused, like the reply's actions.
                <div className="-mr-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/user:opacity-100 focus-within:opacity-100">
                    {msg.content && <CopyMessageButton text={msg.content} />}
                    {onEdit && (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon-xs" onClick={() => onEdit(msg.id)} aria-label="Edit message"
                                    className="text-muted-foreground hover:text-foreground">
                                    <Pencil className="size-3.5" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="bottom">Edit and resend</TooltipContent>
                        </Tooltip>
                    )}
                </div>
            )}
        </div>
    );
});
