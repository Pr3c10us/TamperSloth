import {lazy, Suspense, useEffect, useRef, useState} from "react";
import {useParams} from "react-router-dom";
import {Check, Copy, Download, FileCode, Pause, Pencil, Play, RefreshCw, Save, Trash2, TriangleAlert, WrapText, X} from "lucide-react";
import {toast} from "sonner";
import {cn} from "@/ui/utils";
import {closeTab} from "@/ui/closeTab";
import {plural} from "@/shared/plural";
import {Button} from "@/ui/shadcn/button";
import {Skeleton} from "@/ui/shadcn/skeleton";
import {Toaster} from "@/ui/shadcn/sonner";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/ui/shadcn/tooltip";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/ui/shadcn/alert-dialog";
import {deleteScript, loadScripts, saveScript, subscribeToScripts, updateScriptStatus} from "@/storage/scripts";
import {downloadScriptSource} from "@/storage/scriptExport";
import {loadConversationHistory} from "@/storage/conversations";
import type {BackgroundScript} from "@/userscripts/types";
import {saveEditedScript, scriptCodeProblem} from "@/userscripts/editScript";
import {ScriptCode} from "@/ui/ScriptCode";
import type {ScriptEditorHandle} from "./ScriptEditor";
import {openChatInPanel, RUN_AT_LABELS, reloadedNote, reloadTabsForScript} from "@/userscripts/scriptActions";
import {SitesDialog} from "@/ui/SitesDialog";
import {scriptTargets} from "@/userscripts/userscript";
import {openInstallPage} from "@/userscripts/installUserscript";

const ScriptEditor = lazy(() => import("./ScriptEditor"));

const WRAP_KEY = "ts_script_viewer_wrap";

function readWrap(): boolean {
    try { return localStorage.getItem(WRAP_KEY) === "1"; } catch { return false; }
}

function writeWrap(wrap: boolean) {
    try { localStorage.setItem(WRAP_KEY, wrap ? "1" : "0"); } catch { /* storage unavailable */ }
}

function Meta({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="min-w-0">
            <dt className="eyebrow mb-1 text-muted-foreground">{label}</dt>
            <dd className="truncate text-[13.5px]">{children}</dd>
        </div>
    );
}

/** Full-tab view of a saved script's source, where it can also be edited. Opened from the gallery. */
export default function ScriptViewerPage() {
    const {id = ""} = useParams();
    const [script, setScript] = useState<BackgroundScript | null | undefined>(undefined);
    // Null until found; a chat deleted since, or an imported script's, never is.
    const [chat, setChat] = useState<{id: string; title: string} | null>(null);
    const [ownTab, setOwnTab] = useState<chrome.tabs.Tab | null>(null);
    const [wrap, setWrap] = useState(readWrap);
    const [copied, setCopied] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleted, setDeleted] = useState(false);
    const [checking, setChecking] = useState(false);
    // While editing: the saved code it started from, and the code as it stands now.
    const [editBase, setEditBase] = useState<string | null>(null);
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirmDiscard, setConfirmDiscard] = useState(false);
    const [problem, setProblem] = useState<{message: string; offset?: number; canOverride?: boolean} | null>(null);
    const editor = useRef<ScriptEditorHandle>(null);

    const editing = editBase !== null;
    const unsaved = editing && draft !== editBase;

    // Closing or reloading the tab would lose the edits.
    useEffect(() => {
        if (!unsaved) return;
        const warn = (event: BeforeUnloadEvent) => event.preventDefault();
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [unsaved]);

    // Stay in step with the gallery and the agent, which can pause or delete it meanwhile.
    useEffect(() => {
        const pick = (all: BackgroundScript[]) => setScript(all.find((s) => s.id === id) ?? null);
        void loadScripts().then(pick);
        return subscribeToScripts(pick);
    }, [id]);

    const conversationId = script?.conversationId;
    useEffect(() => {
        if (!conversationId) return;
        void loadConversationHistory().then((history) => {
            const found = history.find((c) => c.id === conversationId);
            setChat(found ? {id: found.id, title: found.title || "Untitled chat"} : null);
        });
    }, [conversationId]);

    // Fetched ahead of time: opening the side panel must happen within the click itself.
    useEffect(() => {
        chrome.tabs.getCurrent((tab) => setOwnTab(tab ?? null));
    }, []);

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

    const handleCheckUpdate = async (current: BackgroundScript) => {
        setChecking(true);
        try {
            const result = await chrome.runtime.sendMessage({type: "CHECK_USERSCRIPT_UPDATE", scriptId: current.id});
            if (result?.status === "updated") toast.success(`Updated to v${result.version}.`, {description: "Matching pages pick it up on their next load."});
            else if (result?.status === "review") openInstallPage(result.url);
            else if (result?.status === "current") toast.success("It's up to date.");
            else if (result?.status === "unavailable") toast.error("This script doesn't say where to find updates.");
            else toast.error("Couldn't check for updates.", {description: result?.error});
        } catch {
            toast.error("Couldn't check for updates.");
        } finally {
            setChecking(false);
        }
    };

    const forgetSite = async (current: BackgroundScript, host: string) => {
        if (!current.userscript) return;
        await saveScript({...current, userscript: {
            ...current.userscript,
            connectAllowed: current.userscript.connectAllowed?.filter((h) => h !== host),
            connectBlocked: current.userscript.connectBlocked?.filter((h) => h !== host),
        }});
    };

    const startEditing = (current: BackgroundScript) => {
        setProblem(null);
        setDraft(current.code);
        setEditBase(current.code);
    };

    const stopEditing = () => {
        setProblem(null);
        setConfirmDiscard(false);
        setEditBase(null);
    };

    const loadLatest = (current: BackgroundScript) => {
        setProblem(null);
        setEditBase(current.code);
        setDraft(current.code);
        editor.current?.setCode(current.code);
    };

    const handleSave = async (current: BackgroundScript, override = false) => {
        if (saving || draft === editBase) return;
        const code = draft;
        const blocking = scriptCodeProblem(current, code);
        if (blocking) {
            setProblem({message: blocking});
            return;
        }
        setSaving(true);
        try {
            if (!override) {
                const {findSyntaxProblem} = await import("@/userscripts/scriptSyntax");
                const syntax = findSyntaxProblem(code);
                if (syntax) {
                    setProblem({message: `Line ${syntax.line} looks like a syntax error, so the script may not run.`, offset: syntax.offset, canOverride: true});
                    editor.current?.goTo(syntax.offset);
                    return;
                }
            }
            setProblem(null);
            // From the stored copy: a pause or a forgotten site since this page rendered stays.
            const latest = (await loadScripts()).find((s) => s.id === current.id) ?? current;
            const updated = await saveEditedScript(latest, code);
            setEditBase(code);
            toast.success(`"${updated.name}" saved.`, updated.status === "active"
                ? {
                    description: "Matching pages pick it up on their next load.",
                    action: {label: "Reload tabs", onClick: () => void reloadTabsForScript(updated)},
                }
                : {description: "It's paused, so it won't run until you resume it."});
        } catch (error) {
            setProblem({message: error instanceof Error ? error.message : "Couldn't save the script."});
        } finally {
            setSaving(false);
        }
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
    const lineCount = (editing ? draft : script.code).split("\n").length;
    const changedElsewhere = editing && script.code !== editBase;
    const targets = scriptTargets(script);
    const userscript = script.userscript;
    const updatable = !!userscript && !!(userscript.updateURL || userscript.downloadURL || userscript.sourceUrl);
    const rememberedSites = [
        ...(userscript?.connectAllowed ?? []).map((host) => ({host, label: "Allowed"})),
        ...(userscript?.connectBlocked ?? []).map((host) => ({host, label: "Blocked"})),
    ];

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
                        {userscript?.pendingUpdate ? (
                            <Button size="sm" onClick={() => openInstallPage(userscript.pendingUpdate!.url)}>
                                <RefreshCw strokeWidth={1.5}/>
                                Review v{userscript.pendingUpdate.version}
                            </Button>
                        ) : updatable && (
                            <Button variant="outline" size="sm" disabled={checking} onClick={() => void handleCheckUpdate(script)}>
                                <RefreshCw strokeWidth={1.5} className={cn(checking && "animate-spin")}/>
                                Check for updates
                            </Button>
                        )}
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
                        <SitesDialog
                            runs={targets}
                            skips={userscript ? [...userscript.excludeMatches, ...userscript.excludes] : []}
                            scriptName={script.name}
                        />
                    </Meta>
                    <Meta label="Timing">
                        {userscript?.contextMenu
                            ? "From the right-click menu"
                            : <span title={script.runAt}>{RUN_AT_LABELS[script.runAt] ?? script.runAt}</span>}
                    </Meta>
                    {userscript ? (
                        <Meta label="Userscript">
                            <span title={userscript.sourceUrl || undefined}>
                                {userscript.version ? `v${userscript.version}` : "Installed"}
                                {userscript.author && ` · ${userscript.author}`}
                            </span>
                        </Meta>
                    ) : (
                        <Meta label="Made in">
                            {chat && ownTab ? (
                                <button
                                    type="button"
                                    onClick={() => openChatInPanel(ownTab, chat.id)}
                                    title={`Open “${chat.title}” in the side panel`}
                                    className="max-w-full cursor-pointer truncate text-left text-accent underline decoration-[1px] underline-offset-[3px] transition-colors duration-[var(--dur-fast)] hover:text-[var(--link-hover)]"
                                >
                                    {chat.title}
                                </button>
                            ) : (
                                <span title={chat?.title}>{chat?.title ?? "A deleted or imported chat"}</span>
                            )}
                        </Meta>
                    )}
                </dl>

                {rememberedSites.length > 0 && (
                    <div className="mt-4 rounded-[10px] border border-border bg-card px-4 py-3.5">
                        <p className="eyebrow mb-2 text-muted-foreground">Sites you decided on</p>
                        <ul className="flex flex-wrap gap-1.5">
                            {rememberedSites.map(({host, label}) => (
                                <li key={host} className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pr-1 pl-2.5 text-[12.5px]">
                                    <span className="text-muted-foreground">{label}</span>
                                    <span className="font-mono">{host}</span>
                                    <button
                                        type="button"
                                        aria-label={`Forget ${host}; the script asks again next time`}
                                        title="Forget; the script asks again next time"
                                        onClick={() => void forgetSite(script, host)}
                                        className="flex size-5 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        <X strokeWidth={1.5} className="size-3"/>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                <div className="mt-6 overflow-clip rounded-[10px] border border-border bg-card text-card-foreground">
                    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-3.5 py-2">
                        <span className="eyebrow flex-1 text-muted-foreground">
                            {editing ? "Editing" : "JavaScript"} · {plural(lineCount, "line")}{unsaved && " · Unsaved"}
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
                        {editing ? (
                            <>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => (unsaved ? setConfirmDiscard(true) : stopEditing())}
                                    className="text-muted-foreground"
                                >
                                    {unsaved ? "Cancel" : "Done"}
                                </Button>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button size="xs" disabled={!unsaved || saving} onClick={() => void handleSave(script)}>
                                            <Save strokeWidth={1.5}/>
                                            {saving ? "Saving…" : "Save"}
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Ctrl+S</TooltipContent>
                                </Tooltip>
                            </>
                        ) : (
                            <>
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
                                <Button variant="outline" size="xs" onClick={() => startEditing(script)}>
                                    <Pencil strokeWidth={1.5}/>
                                    Edit
                                </Button>
                            </>
                        )}
                    </div>
                    {editing && changedElsewhere && (
                        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3.5 py-2 text-[13px]">
                            <TriangleAlert strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground"/>
                            <span className="min-w-0 flex-1">This script was changed somewhere else while you were editing. Saving replaces that version.</span>
                            <Button variant="outline" size="xs" onClick={() => loadLatest(script)}>Load that version</Button>
                        </div>
                    )}
                    {editing && problem && (
                        <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-3.5 py-2 text-[13px] text-destructive">
                            <TriangleAlert strokeWidth={1.5} className="size-4 shrink-0"/>
                            <span className="min-w-0 flex-1">{problem.message}</span>
                            {problem.offset !== undefined && (
                                <Button variant="outline" size="xs" onClick={() => editor.current?.goTo(problem.offset!)}>Go to line</Button>
                            )}
                            {problem.canOverride && (
                                <Button variant="outline" size="xs" disabled={saving} onClick={() => void handleSave(script, true)}>Save anyway</Button>
                            )}
                        </div>
                    )}
                    {editing && updatable && (
                        <p className="border-b border-border px-3.5 py-2 text-[13px] text-muted-foreground">
                            Header changes like @match and @grant apply when you save. Updating from its source replaces your edits.
                        </p>
                    )}
                    {editing ? (
                        <Suspense fallback={<Skeleton className="m-4 h-96"/>}>
                            <ScriptEditor
                                ref={editor}
                                initialCode={editBase}
                                wrap={wrap}
                                onChange={(code) => { setDraft(code); setProblem(null); }}
                                onSave={() => void handleSave(script)}
                            />
                        </Suspense>
                    ) : (
                        <div className={wrap ? undefined : "overflow-x-auto"}>
                            <ScriptCode code={script.code} lineNumbers wrap={wrap} padding="14px 18px 18px 8px"/>
                        </div>
                    )}
                </div>
            </div>

            <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
                <AlertDialogContent className="max-w-xs rounded-[10px] border-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading text-[22px] leading-tight">
                            Discard your changes?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                            The script stays as it was last saved.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep editing</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={stopEditing}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Discard
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

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
