import { useEffect, useRef, useState } from "react";
import {
    ArrowUp,
    MousePointerSquareDashed,
    Paperclip,
    Square,
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
    addFiles: (files: File[]) => void;
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
        addFiles(files);
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
        <div className="fixed bottom-0 inset-x-0 flex shrink-0 flex-col border-t border-muted bg-background">
            <AskUserOverlay />
            <div className="flex flex-col gap-2.5 p-3">
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
                        {pickedElements.map((html, i) => (
                            <PickedElementChip
                                key={i}
                                html={html}
                                onRemove={() => removePicked(i)}
                            />
                        ))}
                    </div>
                )}

                {pendingFiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {pendingFiles.map((f, i) => (
                            <AttachmentChip
                                key={i}
                                att={f}
                                onRemove={() => removeFile(i)}
                            />
                        ))}
                    </div>
                )}

                <div className="flex flex-col rounded-xl border border-border bg-card transition-colors focus-within:border-foreground">
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
                        rows={2}
                        disabled={isLoading}
                        className="w-full resize-none border-0 bg-transparent px-3 pb-1 pt-3 font-sans text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
                    />

                    {!selectedModel && (
                        <div className="flex items-center gap-2 px-3 py-1.5 border-t border-border text-xs text-muted-foreground bg-muted/30">
                            <span>
                                Add an API key in Settings and select a model to start chatting.
                            </span>
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1.5">
                        <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-hidden">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={startPicker}
                                        disabled={isLoading}
                                        aria-pressed={isPicking}
                                        aria-label="Pick a page element"
                                        className={cn(
                                            isPicking &&
                                                "bg-foreground text-background hover:bg-foreground hover:text-background",
                                        )}
                                    >
                                        <MousePointerSquareDashed
                                            strokeWidth={1.5}
                                        />
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
                                        size="icon-sm"
                                        onClick={handleAttach}
                                        disabled={isLoading}
                                        aria-label="Attach file"
                                    >
                                        <Paperclip strokeWidth={1.5} />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    Attach file
                                </TooltipContent>
                            </Tooltip>
                            <ComposerTodoButton
                                conversationId={conversationId}
                            />
                            <ModelSelector
                                selected={selectedModel}
                                onChange={setSelectedModel}
                            />
                        </div>

                        {isLoading ? (
                            <Button
                                type="button"
                                size="icon-lg"
                                onClick={onCancel}
                                aria-label="Stop"
                            >
                                <Square strokeWidth={3} fill="currentColor" />
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                size="lg"
                                onClick={onSend}
                                disabled={!canSend}
                                className="gap-1.5 px-3"
                            >
                                Send
                                <ArrowUp strokeWidth={2} />
                            </Button>
                        )}
                    </div>
                </div>

                {isPicking && (
                    <div className="flex items-center gap-1.5 font-mono text-[11px] text-accent">
                        <span
                            className="size-1.5 rounded-full bg-accent"
                            style={{ animation: "slothPulse 1.4s infinite" }}
                        />
                        Click elements to add · click the picker again or Esc
                        when done
                    </div>
                )}

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
