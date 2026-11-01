import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {Check, Copy, Download, FileCode, Pause, Play, Trash2, WrapText} from "lucide-react";
import {toast} from "sonner";
import {cn} from "@/lib/utils";
import {Button} from "@/components/ui/button";
import {Skeleton} from "@/components/ui/skeleton";
import {Toaster} from "@/components/ui/sonner";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    deleteScript,
    downloadScriptSource,
    loadConversationHistory,
    loadScripts,
    subscribeToScripts,
    updateScriptStatus,
} from "@/src/chat/lib/storage";
import type {BackgroundScript} from "@/src/chat/lib/types";
import {ScriptCode} from "./ScriptCode";
import {RUN_AT_LABELS, reloadedNote, reloadTabsForScript} from "./lib";

const WRAP_KEY = "ts_script_viewer_wrap";

function readWrap(): boolean {
    try { return localStorage.getItem(WRAP_KEY) === "1"; } catch { return false; }
}

function writeWrap(wrap: boolean) {
    try { localStorage.setItem(WRAP_KEY, wrap ? "1" : "0"); } catch { /* storage unavailable */ }
}

function closeTab() {
    chrome.tabs.getCurrent((tab) => {
        if (tab?.id) void chrome.tabs.remove(tab.id);
        else window.close();
    });
}

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

function Meta({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="min-w-0">
            <dt className="eyebrow mb-1 text-muted-foreground">{label}</dt>
            <dd className="truncate text-[13.5px]">{children}</dd>
        </div>
    );
}

/** Full-tab, read-only view of a saved script's source. Opened from the gallery. */
export default function ScriptViewer() {
    const {id = ""} = useParams();
    const [script, setScript] = useState<BackgroundScript | null | undefined>(undefined);
    const [chatTitle, setChatTitle] = useState<string | null>(null);
    const [wrap, setWrap] = useState(readWrap);
    const [copied, setCopied] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleted, setDeleted] = useState(false);

    // Stay in step with the gallery and the agent, which can pause or delete it meanwhile.
    useEffect(() => {
        const pick = (all: BackgroundScript[]) => setScript(all.find((s) => s.id === id) ?? null);
        void loadScripts().then(pick);
        return subscribeToScripts(pick);
    }, [id]);

    const conversationId = script?.conversationId;
    useEffect(() => {
        if (!conversationId) return;
        void loadConversationHistory().then((history) =>
            setChatTitle(history.find((c) => c.id === conversationId)?.title || null),
        );
    }, [conversationId]);

    const name = script?.name;
    useEffect(() => {
        document.title = name ? `${name} · TamperSloth` : "Saved script · TamperSloth";
    }, [name]);

    const toggleWrap = () => {
        setWrap((prev) => {
            writeWrap(!prev);
            return !prev;
        });
    };

    const handleCopy = (code: string) => {
        void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const handleToggleStatus = async (current: BackgroundScript) => {
        const next = current.status === "active" ? "paused" : "active";
        await updateScriptStatus(current.id, next);
        const count = await reloadTabsForScript(current);
        toast.success(next === "paused" ? `"${current.name}" paused.` : `"${current.name}" resumed.`, {
            description: reloadedNote(count),
        });
    };

    const handleDelete = async (current: BackgroundScript) => {
        setDeleted(true);
        await deleteScript(current.id);
        await reloadTabsForScript(current);
    };

    if (script === undefined) {
        return (
            <div className="h-full overflow-y-auto bg-background font-sans">
                <div className="mx-auto w-full max-w-[1100px] px-5 py-10 sm:px-10">
                    <Skeleton className="mb-3 h-3 w-28"/>
                    <Skeleton className="mb-8 h-9 w-72"/>
                    <Skeleton className="h-96 w-full rounded-[10px]"/>
                </div>
            </div>
        );
    }

    if (script === null) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center font-sans">
                <FileCode strokeWidth={1.25} className="size-8 text-muted-foreground/50"/>
                <p className="font-heading text-[26px] italic leading-snug">
                    {deleted ? "Script deleted." : "This script isn't saved anymore."}
                </p>
                <p className="max-w-sm text-[13.5px] text-muted-foreground">
                    {deleted
                        ? "It's gone from every page it used to run on."
                        : "It may have been deleted from the gallery or by the sloth."}
                </p>
                <Button variant="outline" size="sm" className="mt-2" onClick={closeTab}>
                    Close tab
                </Button>
            </div>
        );
    }

    const isActive = script.status === "active";
    const lineCount = script.code.split("\n").length;

    return (
        <div className="h-full overflow-y-auto bg-background font-sans">
            <Toaster position="bottom-center"/>

            <div className="mx-auto w-full max-w-[1100px] px-5 pt-10 pb-16 sm:px-10">
                <p className="eyebrow mb-2 text-muted-foreground">TamperSloth · Saved script</p>

                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                    <div className="min-w-0 flex-1">
                        <h1 className="font-heading text-[34px] leading-tight tracking-[var(--tracking-tight)] break-words">
                            {script.name}
                        </h1>
                        {script.description && (
                            <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">
                                {script.description}
                            </p>
                        )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
                        <Button variant="outline" size="sm" onClick={() => void handleToggleStatus(script)}>
                            {isActive ? <Pause strokeWidth={1.5}/> : <Play strokeWidth={1.5}/>}
                            {isActive ? "Pause" : "Resume"}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setConfirmDelete(true)}
                            className="text-destructive hover:border-destructive hover:bg-destructive hover:text-white"
                        >
                            <Trash2 strokeWidth={1.5}/>
                            Delete
                        </Button>
                    </div>
                </div>

                <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 rounded-[10px] border border-border bg-card px-4 py-3.5 sm:grid-cols-4">
                    <Meta label="Status">
                        <span className="inline-flex items-center gap-2">
                            <span className={cn("size-2 shrink-0 rounded-full", isActive ? "bg-accent" : "bg-border")}/>
                            {isActive ? "Active" : "Paused"}
                        </span>
                    </Meta>
                    <Meta label="Runs on">
                        <span className="font-mono text-[12.5px]" title={script.urlMatchPattern}>
                            {script.urlMatchPattern}
                        </span>
                    </Meta>
                    <Meta label="Timing">
                        <span title={script.runAt}>{RUN_AT_LABELS[script.runAt] ?? script.runAt}</span>
                    </Meta>
                    <Meta label="Made in">
                        <span title={chatTitle ?? undefined}>{chatTitle ?? "A deleted or imported chat"}</span>
                    </Meta>
                </dl>

                <div className="mt-6 overflow-clip rounded-[10px] border border-border bg-card text-card-foreground">
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3.5 py-2">
                        <span className="eyebrow flex-1 text-muted-foreground">
                            JavaScript · {plural(lineCount, "line")}
                        </span>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    aria-pressed={wrap}
                                    onClick={toggleWrap}
                                    className={cn("text-muted-foreground", wrap && "bg-muted text-foreground")}
                                >
                                    <WrapText strokeWidth={1.5}/>
                                    Wrap
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>{wrap ? "Scroll long lines" : "Wrap long lines"}</TooltipContent>
                        </Tooltip>
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => handleCopy(script.code)}
                            className="text-muted-foreground"
                        >
                            {copied ? <Check strokeWidth={1.5}/> : <Copy strokeWidth={1.5}/>}
                            {copied ? "Copied" : "Copy"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => downloadScriptSource(script)}
                            className="text-muted-foreground"
                        >
                            <Download strokeWidth={1.5}/>
                            .js
                        </Button>
                    </div>
                    <div className={wrap ? undefined : "overflow-x-auto"}>
                        <ScriptCode code={script.code} lineNumbers wrap={wrap} padding="14px 18px 18px 8px"/>
                    </div>
                </div>
            </div>

            <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <AlertDialogContent className="max-w-xs rounded-[10px] border-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading text-[22px] leading-tight">
                            Delete {script.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                            This can't be undone. The sloth will pretend it never happened.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleDelete(script)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
