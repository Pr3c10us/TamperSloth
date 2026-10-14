import { useEffect, useRef, useState } from "react";
import {
    CircleDot,
    CornerDownLeft,
    LoaderCircle,
    MousePointerClick,
    MousePointerSquareDashed,
    Paperclip,
    PencilLine,
    Plus,
    TextQuote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { clearPickedMarkers, useElementPicker } from "../hooks/useElementPicker";
import { useDrawOverlay } from "../hooks/useDrawOverlay";
import { usePanelRequests } from "../hooks/usePanelRequests";
import { useDictation } from "../hooks/useDictation";
import {
    DEFAULT_DICTATION_SETTINGS,
    loadDictationSettings,
    saveDictationSettings,
    type DictationSettings,
} from "../lib/dictation";
import { DictationButton } from "./DictationButton";
import { DictationWave } from "./DictationWave";
import type { Quote } from "../lib/panelRequests";
import { QuoteChip } from "./QuoteChip";
import { ModelSelector, type SelectedModelEntry } from "./ModelSelector";
import { PickedElementChip, type PickedElement } from "./PickedElementChip";
import {
    AttachmentChip,
    formatSize,
    MAX_ATTACHMENTS,
    type PendingAttachment,
} from "./AttachmentChip";
import { AskUserOverlay } from "@/src/chat/components/askUser/askUserOverlay.tsx";
import { TabWaitNotice } from "./TabWaitNotice";
import { RateLimitNotice } from "./RateLimitNotice";

interface ComposerProps {
    draft: string;
    setDraft: (v: string) => void;
    pickedElements: PickedElement[];
    setPickedElements: (updater: (prev: PickedElement[]) => PickedElement[]) => void;
    pendingFiles: PendingAttachment[];
    quotes: Quote[];
    setQuotes: (updater: (prev: Quote[]) => Quote[]) => void;
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

/** Label row for a group of attachments above the input: icon, name, count and "clear all". */
function TrayHeader({ icon, label, count, onClear }: { icon: React.ReactNode; label: string; count: string; onClear: () => void }) {
    return (
        <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
            <span className="flex min-w-0 items-center gap-1.5">
                {icon}
                <span className="truncate">{label}</span>
                <span className="rounded-sm border border-border px-1 tabular-nums tracking-normal text-foreground/80">{count}</span>
            </span>
            <button
                type="button"
                onClick={onClear}
                aria-label={`Clear all ${label.toLowerCase()}`}
                className="shrink-0 uppercase tracking-[.08em] text-foreground underline underline-offset-2 hover:text-accent"
            >
                Clear all
            </button>
        </div>
    );
}

export function Composer({
    draft,
    setDraft,
    pickedElements,
    setPickedElements,
    pendingFiles,
    quotes,
    setQuotes,
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
    const [isDrawing, setIsDrawing] = useState(false);
    // A pick or drawing asked for from the page's context menu while Sloth is busy starts once it is done.
    const [queuedAction, setQueuedAction] = useState<"pick" | "draw" | null>(null);
    const [pageNotice, setPageNotice] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const [skippedFiles, setSkippedFiles] = useState(0);
    const filesFull = pendingFiles.length >= MAX_ATTACHMENTS;
    const [dictationSettings, setDictationSettings] = useState<DictationSettings>(DEFAULT_DICTATION_SETTINGS);
    const dictation = useDictation(conversationId, dictationSettings);
    // While the mic is on, the input shows the transcript with the words still being heard after it.
    const listening = dictation.status === "starting" || dictation.status === "listening" || dictation.status === "stopping";
    // Enter while dictating sends once the last words have landed in the draft.
    const [sendQueued, setSendQueued] = useState(false);

    useEffect(() => {
        void loadDictationSettings().then(setDictationSettings);
    }, []);

    const changeDictationSettings = (next: DictationSettings) => {
        setDictationSettings(next);
        void saveDictationSettings(next).catch((error) => console.warn("[Tampersloth] Could not save dictation options:", error));
    };

    // The limit notice clears itself after a few seconds.
    useEffect(() => {
        if (!skippedFiles) return;
        const timer = setTimeout(() => setSkippedFiles(0), 4000);
        return () => clearTimeout(timer);
    }, [skippedFiles]);

    useEffect(() => {
        if (!pageNotice) return;
        const timer = setTimeout(() => setPageNotice(null), 4000);
        return () => clearTimeout(timer);
    }, [pageNotice]);

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

    const { start: startPicker, cancel: cancelPicker, remove: removePickedFromDom } =
        useElementPicker({
            tabId,
            group: conversationId,
            isPicking,
            setIsPicking,
            setPickedElements,
        });
    const { start: startDrawing, cancel: cancelDrawing } = useDrawOverlay({ tabId, isDrawing, setIsDrawing });

    // Picking and drawing both take over the page, so starting one ends the other.
    const togglePicker = () => {
        if (isDrawing) void cancelDrawing();
        void startPicker();
    };
    const toggleDrawing = async () => {
        if (isDrawing) {
            await cancelDrawing();
            return;
        }
        if (isPicking) await cancelPicker();
        if (!await startDrawing()) setPageNotice("Can't draw on this page");
    };

    // Requests from the page: "Ask Sloth" quotes, context-menu picks and drawings, and finished drawings.
    usePanelRequests((request) => {
        if (request.kind === "quote") {
            const { text, url, title } = request;
            setQuotes((prev) => (prev.some((q) => q.text === text) ? prev : [...prev, { text, url, title }]));
        } else if (request.kind === "image") {
            setSkippedFiles(addFiles([dataUrlToFile(request.dataUrl, request.name)]));
        } else if (request.kind === "dictate") {
            void dictation.start();
        } else {
            setQueuedAction(request.kind);
        }
    });
    useEffect(() => {
        if (!queuedAction || isLoading) return;
        setQueuedAction(null);
        if (queuedAction === "pick") {
            if (!isPicking) togglePicker();
        } else if (!isDrawing) {
            void toggleDrawing();
        }
        // Runs when a request arrives or the run holding it back ends.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queuedAction, isLoading]);

    const fitTextarea = () => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        const maxHeight = lineHeight * 6;
        ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
        ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    useEffect(fitTextarea, [draft]);

    // The side panel can mount this while still opening (near-zero width), which wraps
    // the placeholder into many lines; refit whenever the width settles.
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        let lastWidth = ta.clientWidth;
        const observer = new ResizeObserver(() => {
            if (ta.clientWidth === lastWidth) return;
            lastWidth = ta.clientWidth;
            fitTextarea();
        });
        observer.observe(ta);
        return () => observer.disconnect();
    }, []);

    const canSend =
        !!selectedModel &&
        (draft.trim().length > 0 ||
            (listening && dictation.interim.length > 0) ||
            pendingFiles.length > 0 ||
            pickedElements.length > 0 ||
            quotes.length > 0);

    const toggleDictation = () => {
        if (dictation.status === "idle") void dictation.start();
        else void dictation.stop();
    };

    // Ends dictation, then focuses the input with the caret after the transcript.
    const stopDictationAndEdit = async () => {
        await dictation.stop();
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
    };

    const send = async () => {
        if (!canSend || isLoading) return;
        if (!listening) {
            onSend();
            return;
        }
        await dictation.stop();
        setSendQueued(true);
    };

    // Sends on the render after dictation's last words reach the draft, so they go with the message.
    useEffect(() => {
        if (!sendQueued) return;
        setSendQueued(false);
        if (canSend && !isLoading) onSend();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendQueued]);

    // The live transcript keeps its newest words in view, and takes keyboard focus so Enter and Esc work.
    useEffect(() => {
        const preview = previewRef.current;
        if (!preview || !listening) return;
        preview.scrollTop = preview.scrollHeight;
    }, [listening, draft, dictation.interim]);
    useEffect(() => {
        if (listening) previewRef.current?.focus({ preventScroll: true });
    }, [listening]);

    const handleAttach = () => fileInputRef.current?.click();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        setSkippedFiles(addFiles(files));
        e.target.value = "";
    };

    // Images on the clipboard (e.g. a copied screenshot) become attachments.
    // Text still pastes normally; the default is suppressed only for image-only pastes.
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (isLoading) return;
        const images = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
        if (!images.length) return;
        if (!e.clipboardData.types.includes("text/plain")) e.preventDefault();
        const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        const named = images.map((f, i) => {
            const ext = f.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
            const name = `pasted-${stamp}${images.length > 1 ? `-${i + 1}` : ""}.${ext}`;
            return new File([f], name, { type: f.type, lastModified: f.lastModified });
        });
        setSkippedFiles(addFiles(named));
    };

    const removePicked = (i: number) => {
        removePickedFromDom(i);
    };

    const clearFiles = () => {
        for (let i = pendingFiles.length - 1; i >= 0; i--) removeFile(i);
    };

    const clearQuotes = () => setQuotes(() => []);

    const clearPicked = () => {
        setPickedElements(() => []);
        clearPickedMarkers(tabId, conversationId);
    };

    return (
        <div ref={containerRef} className="fixed bottom-0 inset-x-0 z-20 flex shrink-0 flex-col bg-background">
            <RateLimitNotice conversationId={conversationId} />
            <TabWaitNotice conversationId={conversationId} />
            <AskUserOverlay conversationId={conversationId} />
            <div className="flex flex-col gap-1.5 px-3 pb-2 pt-2">
                <div className="flex flex-col gap-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-xs transition-colors focus-within:border-foreground/40">
                    {pickedElements.length > 0 && (
                        <section aria-label="Picked elements" className="flex flex-col gap-1.5">
                            <TrayHeader
                                icon={<MousePointerClick className="size-3 text-accent" strokeWidth={1.75} />}
                                label="Picked elements"
                                count={String(pickedElements.length)}
                                onClear={clearPicked}
                            />
                            {/* Previews wrap; past about two rows the list scrolls instead of pushing the input up. */}
                            <div className="flex max-h-[12.5rem] flex-wrap items-start gap-1.5 overflow-y-auto [scrollbar-width:thin]">
                                {pickedElements.map((picked, i) => (
                                    <PickedElementChip
                                        key={i}
                                        html={picked.html}
                                        imageUrl={picked.screenshot}
                                        onRemove={() => removePicked(i)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {pendingFiles.length > 0 && (
                        <section
                            aria-label="Attached files"
                            className={cn("flex flex-col gap-1.5", pickedElements.length > 0 && "border-t border-dashed border-border pt-2.5")}
                        >
                            <TrayHeader
                                icon={<Paperclip className="size-3" strokeWidth={1.75} />}
                                label="Files"
                                count={`${pendingFiles.length}/${MAX_ATTACHMENTS}`}
                                onClear={clearFiles}
                            />
                            {/* One horizontally scrolling row, so many files never push the input up. */}
                            <div className="-mx-2.5 flex gap-2 overflow-x-auto overscroll-x-contain px-2.5 pb-1 [scrollbar-width:thin]">
                                {pendingFiles.map((f, i) => (
                                    <div key={i} className="shrink-0">
                                        <AttachmentChip att={f} large onRemove={() => removeFile(i)} />
                                    </div>
                                ))}
                            </div>
                            {skippedFiles > 0 && (
                                <p role="status" className="font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                                    Up to {MAX_ATTACHMENTS} files · {skippedFiles} not added
                                </p>
                            )}
                        </section>
                    )}

                    {quotes.length > 0 && (
                        <section
                            aria-label="Quotes"
                            className={cn(
                                "flex flex-col gap-1.5",
                                (pickedElements.length > 0 || pendingFiles.length > 0) && "border-t border-dashed border-border pt-2.5",
                            )}
                        >
                            <TrayHeader
                                icon={<TextQuote className="size-3 text-accent" strokeWidth={1.75} />}
                                label="Quotes"
                                count={String(quotes.length)}
                                onClear={clearQuotes}
                            />
                            <div className="flex max-h-[12.5rem] flex-col gap-2 overflow-y-auto [scrollbar-width:thin]">
                                {quotes.map((quote, i) => (
                                    <QuoteChip
                                        key={i}
                                        quote={quote}
                                        onRemove={() => setQuotes((prev) => prev.filter((_, j) => j !== i))}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <div className="flex items-end gap-2">
                        {listening && (
                            <div
                                ref={previewRef}
                                tabIndex={0}
                                role="textbox"
                                aria-readonly
                                aria-label="Dictation"
                                aria-live="polite"
                                onClick={() => void stopDictationAndEdit()}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault();
                                        void send();
                                    } else if (e.key === "Escape") {
                                        e.preventDefault();
                                        void stopDictationAndEdit();
                                    }
                                }}
                                className="max-h-[8.6rem] min-w-0 flex-1 cursor-text overflow-y-auto whitespace-pre-wrap break-words px-1 py-0.5 font-sans text-sm leading-relaxed text-foreground outline-none [scrollbar-width:thin]"
                            >
                                {draft}
                                {dictation.interim && (
                                    <span className="italic text-muted-foreground">
                                        {draft && !/\s$/.test(draft) ? " " : ""}
                                        {dictation.interim}
                                    </span>
                                )}
                                {!draft && !dictation.interim && (
                                    <span className="text-muted-foreground">
                                        {dictation.status === "starting" ? "Starting the mic…" : "Listening… start talking"}
                                    </span>
                                )}
                            </div>
                        )}
                        <textarea
                            ref={textareaRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onPaste={handlePaste}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    void send();
                                }
                            }}
                            placeholder="Tell the sloth what to do…"
                            rows={1}
                            className={cn(listening && "hidden", "min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-0.5 font-sans text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground")}
                        />

                        {listening && (
                            <button
                                type="button"
                                onClick={() => void dictation.stop()}
                                aria-label="Stop dictation"
                                className="mb-0.5 flex max-w-[24%] shrink-0 justify-end overflow-hidden rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            >
                                <DictationWave levels={dictation.levels} className={cn(dictation.status === "stopping" && "opacity-40")} />
                            </button>
                        )}

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
                                onClick={() => void send()}
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
                                    onClick={togglePicker}
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
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={() => void toggleDrawing()}
                                    disabled={isLoading}
                                    aria-pressed={isDrawing}
                                    aria-label="Draw on the page"
                                    className={cn(
                                        "text-muted-foreground hover:text-foreground",
                                        isDrawing &&
                                            "bg-foreground text-background hover:bg-foreground hover:text-background",
                                    )}
                                >
                                    <PencilLine strokeWidth={1.5} />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                                Draw on the page
                            </TooltipContent>
                        </Tooltip>
                        <DictationButton
                            status={dictation.status}
                            settings={dictationSettings}
                            onSettingsChange={changeDictationSettings}
                            onToggle={toggleDictation}
                        />
                        {(isPicking || isDrawing || queuedAction || pageNotice || dictation.status !== "idle" || dictation.notice) && (
                            <span role="status" className="ml-1.5 flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-accent">
                                {(isPicking || isDrawing || dictation.status === "listening") && (
                                    <span
                                        className="size-1.5 shrink-0 rounded-full bg-accent"
                                        style={{ animation: "slothPulse 1.4s infinite" }}
                                    />
                                )}
                                <span className="truncate">
                                    {dictation.status === "listening"
                                        ? "Listening · Enter sends · Esc stops"
                                        : dictation.status === "starting"
                                          ? "Starting the mic…"
                                          : dictation.status === "stopping"
                                            ? "Finishing up…"
                                            : dictation.status === "permission"
                                              ? "Allow the mic in the window that opened"
                                              : dictation.notice
                                                ? dictation.notice
                                                : isPicking
                                        ? "Click elements · Esc when done"
                                        : isDrawing
                                          ? "Drawing · Add to chat when done"
                                          : queuedAction
                                            ? `${queuedAction === "pick" ? "Picking" : "Drawing"} starts when Sloth is done`
                                            : pageNotice}
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

/** A captured drawing arrives as a data URL; decoded in place so it joins the files at once. */
function dataUrlToFile(dataUrl: string, name: string) {
    const [head, body = ""] = dataUrl.split(",");
    const type = head.match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg";
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type });
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
