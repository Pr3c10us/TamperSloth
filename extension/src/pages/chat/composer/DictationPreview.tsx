import { useEffect, useRef } from "react";
import type { DictationStatus } from "@/pages/chat/hooks/useDictation";

/** Stands in for the input while the mic is on: the transcript, with the words still being heard after it. */
export function DictationPreview({
    draft,
    interim,
    status,
    onSend,
    onStopAndEdit,
}: {
    draft: string;
    interim: string;
    status: DictationStatus;
    onSend: () => void;
    onStopAndEdit: () => void;
}) {
    const previewRef = useRef<HTMLDivElement>(null);

    // The live transcript keeps its newest words in view, and takes keyboard focus so Enter and Esc work.
    useEffect(() => {
        const preview = previewRef.current;
        if (preview) preview.scrollTop = preview.scrollHeight;
    }, [draft, interim]);
    useEffect(() => {
        previewRef.current?.focus({ preventScroll: true });
    }, []);

    return (
        <div
            ref={previewRef}
            tabIndex={0}
            role="textbox"
            aria-readonly
            aria-label="Dictation"
            aria-live="polite"
            onClick={onStopAndEdit}
            onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    onStopAndEdit();
                }
            }}
            className="max-h-[8.6rem] min-w-0 flex-1 cursor-text overflow-y-auto whitespace-pre-wrap break-words px-1 py-0.5 font-sans text-sm leading-relaxed text-foreground outline-none [scrollbar-width:thin]"
        >
            {draft}
            {interim && (
                <span className="italic text-muted-foreground">
                    {draft && !/\s$/.test(draft) ? " " : ""}
                    {interim}
                </span>
            )}
            {!draft && !interim && (
                <span className="text-muted-foreground">
                    {status === "starting" ? "Starting the mic…" : "Listening… start talking"}
                </span>
            )}
        </div>
    );
}
