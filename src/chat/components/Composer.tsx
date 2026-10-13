import { useEffect, useRef, useState } from "react";
import {
    CircleDot,
    CornerDownLeft,
    LoaderCircle,
    MousePointerSquareDashed,
    Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useElementPicker } from "../hooks/useElementPicker";
import { ModelSelector, type SelectedModelEntry } from "./ModelSelector";
import { PickedElementChip } from "./PickedElementChip";
import {
    AttachmentChip,
    formatSize,
    MAX_ATTACHMENTS,
    type PendingAttachment,
} from "./AttachmentChip";
import { ComposerTodoButton } from "./todo/composerTodoButton";
import { AskUserOverlay } from "@/src/chat/components/askUser/askUserOverlay.tsx";

interface ComposerProps {
    draft: string;
    setDraft: (v: string) => void;
    pickedElements: string[];
    setPickedElements: (updater: (prev: string[]) => string[]) => void;
    pendingFiles: PendingAttachment[];
    /** Returns how many files were left out because of the attachment limit. */
    addFiles: (files: File[]) => number;
    removeFile: (index: number) => void;
    selectedModel: SelectedModelEntry | null;
    setSelectedModel: (m: SelectedModelEntry) => void;
    isLoading: boolean;
    onSend: () => void;
    onCancel: () => void;
    tabId: number;
    conversationId: string;
}

export function Composer({
    draft,
    setDraft,
    pickedElements,
    setPickedElements,
    pendingFiles,
    addFiles,
    removeFile,
    selectedModel,
    setSelectedModel,
    isLoading,
    onSend,
    onCancel,
    tabId,
    conversationId,
}: ComposerProps) {
    const [isPicking, setIsPicking] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [skippedFiles, setSkippedFiles] = useState(0);
    const filesFull = pendingFiles.length >= MAX_ATTACHMENTS;

    // The limit notice clears itself after a few seconds.
    useEffect(() => {
        if (!skippedFiles) return;
        const timer = setTimeout(() => setSkippedFiles(0), 4000);
        return () => clearTimeout(timer);
    }, [skippedFiles]);

    // The composer is fixed over the message list; publish its live height so the
    // list can pad its end and the scroll-to-bottom button can sit just above it.
    useEffect(() => {
        const element = containerRef.current;
        if (!element) return;
        const root = document.documentElement;
        const observer = new ResizeObserver(() => root.style.setProperty("--composer-height", `${element.offsetHeight}px`));
        observer.observe(element);
        return () => {
            observer.disconnect();
            root.style.removeProperty("--composer-height");
        };
    }, []);

    const { start: startPicker, remove: removePickedFromDom } =
        useElementPicker({
            tabId,
            isPicking,
            setIsPicking,
            setPickedElements,
        });

    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        const maxHeight = lineHeight * 6;
        ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
        ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
    }, [draft]);

    const canSend =
        !!selectedModel &&
        (draft.trim().length > 0 ||
            pendingFiles.length > 0 ||
            pickedElements.length > 0);

    const handleAttach = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setSkippedFiles(addFiles(files));
        e.target.value = "";
    };

    const removePicked = (i: number) => {
        removePickedFromDom(i);
    };

    const clearPicked = () => {
        for (let i = pickedElements.length - 1; i >= 0; i--) {
            removePickedFromDom(i);
        }
    };

    return (
        <div ref={containerRef} className="fixed bottom-0 inset-x-0 z-20 flex shrink-0 flex-col bg-background">
            <AskUserOverlay />
            <div className="flex flex-col gap-1.5 px-3 pb-2 pt-2">
                <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-xs transition-colors focus-within:border-foreground/40">
                    {pickedElements.length > 0 && (
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                                <span>
                                    {pickedElements.length} element
                                    {pickedElements.length === 1 ? "" : "s"} picked
                                </span>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    onClick={clearPicked}
                                    className="h-auto px-0 py-0 font-mono text-[10px] uppercase tracking-[.08em] text-foreground underline underline-offset-2 hover:bg-transparent"
                                >
                                    clear all
                                </Button>
                            </div>
                            {/* Pills wrap; past about three rows the list scrolls instead of pushing the input up. */}
                            <div className="flex max-h-[6.25rem] flex-wrap gap-1.5 overflow-y-auto [scrollbar-width:thin]">
                                {pickedElements.map((html, i) => (
                                    <PickedElementChip
                                        key={i}
                                        html={html}
                                        onRemove={() => removePicked(i)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {pendingFiles.length > 0 && (
                        <div className="flex flex-col gap-1">
                            {/* One horizontally scrolling row, so many files never push the input up. */}
                            <div className="-mx-2.5 flex gap-2 overflow-x-auto overscroll-x-contain px-2.5 pb-1 [scrollbar-width:thin]">
                                {pendingFiles.map((f, i) => (
                                    <div key={i} className="shrink-0">
                                        <AttachmentChip att={f} large onRemove={() => removeFile(i)} />
                                    </div>
                                ))}
                            </div>
                            {(filesFull || skippedFiles > 0) && (
                                <p role="status" className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                                    {skippedFiles > 0
                                        ? `Up to ${MAX_ATTACHMENTS} files · ${skippedFiles} not added`
                                        : `${MAX_ATTACHMENTS} of ${MAX_ATTACHMENTS} files`}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="flex items-end gap-2">
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    if (canSend && !isLoading) onSend();
                                }
                            }}
                            placeholder="Tell the sloth what to do…"
                            rows={1}
                            className="min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-0.5 font-sans text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
                        />

                        {isLoading ? (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={onCancel}
                                aria-label="Stop"
                                className="shrink-0 text-foreground"
                            >
                                <CircleDot strokeWidth={1.75} />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={onSend}
                                disabled={!canSend}
                                aria-label="Send"
                                className="shrink-0 text-foreground"
                            >
                                <CornerDownLeft strokeWidth={1.75} />
                            </Button>
                        )}
                    </div>
                </div>

                {!selectedModel && (
                    <div className="px-1.5 text-xs text-muted-foreground">
                        Add an API key in Settings and select a model to start
                        chatting.
                    </div>
                )}

                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-0.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={handleAttach}
                                    disabled={isLoading || filesFull}
                                    aria-label={filesFull ? `Attachment limit reached (${MAX_ATTACHMENTS} files)` : "Attach file"}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <Plus strokeWidth={1.75} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">Attach file</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={startPicker}
                                    disabled={isLoading}
                                    aria-pressed={isPicking}
                                    aria-label="Pick a page element"
                                    className={cn(
                                        "text-muted-foreground hover:text-foreground",
                                        isPicking &&
                                            "bg-foreground text-background hover:bg-foreground hover:text-background",
                                    )}
                                >
                                    <MousePointerSquareDashed strokeWidth={1.5} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                Pick a page element
                            </TooltipContent>
                        </Tooltip>
                        <ComposerTodoButton conversationId={conversationId} />
                        {isPicking && (
                            <span className="ml-1.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-accent">
                                <span
                                    className="size-1.5 shrink-0 rounded-full bg-accent"
                                    style={{ animation: "slothPulse 1.4s infinite" }}
                                />
                                <span className="truncate">
                                    Click elements · Esc when done
                                </span>
                            </span>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                        <ModelSelector
                            selected={selectedModel}
                            onChange={setSelectedModel}
                        />
                        {isLoading && (
                            <LoaderCircle
                                aria-label="Working"
                                className="mr-1 size-3.5 animate-spin text-muted-foreground"
                                strokeWidth={1.75}
                            />
                        )}
                    </div>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                />
            </div>
        </div>
    );
}

export function makeAttachmentFromFile(f: File): PendingAttachment {
    return {
        kind: f.type.startsWith("image/") ? "image" : "file",
        name: f.name,
        size: formatSize(f.size),
        ext: (f.name.split(".").pop() || "").toUpperCase().slice(0, 4),
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        mediaType: f.type || "application/octet-stream",
        file: f,
    };
}
