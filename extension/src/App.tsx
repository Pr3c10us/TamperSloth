import {useEffect, useRef, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {
    ArrowLeft,
    ChevronDown,
    Download,
    Pause,
    Play,
    Search,
    Settings,
    Sparkles,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Toaster} from "@/components/ui/sonner";
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
import {PageHeader, PageHeaderAction, PageHeaderTitle} from "@/components/page-header";
import {deleteScript, exportScript, importScriptsFromJson, loadScripts, subscribeToScripts, updateScriptStatus,} from "./chat/lib/storage";
import type {BackgroundScript} from "./chat/lib/types";
import {ScriptCode} from "./scripts/ScriptCode";
import {openScriptViewer, reloadedNote, reloadTabsForScript, reloadTabsForScripts} from "./scripts/lib";

const PREVIEW_LINES = 8;

function App() {
    const navigate = useNavigate();
    const [scripts, setScripts] = useState<BackgroundScript[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [search, setSearch] = useState("");
    const [confirmDelete, setConfirmDelete] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        try {
            const text = await file.text();
            const before = new Set((await loadScripts()).map((s) => s.id));
            const count = await importScriptsFromJson(text);
            const updated = await loadScripts();
            setScripts(updated);
            const reloaded = await reloadTabsForScripts(updated.filter((s) => !before.has(s.id)));
            toast.success(`Imported ${count} script${count !== 1 ? "s" : ""} successfully.`, {
                description: reloadedNote(reloaded),
            });
        } catch {
            toast.error("Invalid script file. Make sure it's a TamperSloth JSON export.");
        }
    };

    // The viewer tab and the agent can also pause or delete scripts.
    useEffect(() => {
        loadScripts().then(setScripts);
        return subscribeToScripts(setScripts);
    }, []);

    const q = search.trim().toLowerCase();
    const filtered = q
        ? scripts.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q),
        )
        : scripts;

    const handleToggleStatus = async (script: BackgroundScript) => {
        const next = script.status === "active" ? "paused" : "active";
        await updateScriptStatus(script.id, next);
        setScripts((prev) =>
            prev.map((s) => (s.id === script.id ? {...s, status: next} : s)),
        );
        const reloaded = await reloadTabsForScript(script);
        toast.success(next === "paused" ? `"${script.name}" paused.` : `"${script.name}" resumed.`, {
            description: reloadedNote(reloaded),
        });
    };

    const confirmRemoval = async () => {
        if (!confirmDelete) return;
        const name = confirmDelete.name;           // capture before clearing
        const removed = scripts.find((s) => s.id === confirmDelete.id);
        await deleteScript(confirmDelete.id);
        setScripts((prev) => prev.filter((s) => s.id !== confirmDelete.id));
        if (expanded === confirmDelete.id) setExpanded(null);
        setConfirmDelete(null);
        const reloaded = removed ? await reloadTabsForScript(removed) : 0;
        toast.success(`"${name}" deleted.`, {
            description: reloadedNote(reloaded),
        });
    };

    return (
        <div className="relative flex h-full flex-col overflow-hidden border-l border-border bg-background font-sans">
            {/* Hidden file input for import */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleFileChange}
            />

            {/* Sonner toaster */}
            <Toaster position="bottom-center"/>

            {/* Header */}
            <PageHeader>
                <PageHeaderAction label="Back" onClick={() => navigate("/")}>
                    <ArrowLeft/>
                </PageHeaderAction>
                <PageHeaderTitle className="flex-1">Gallery</PageHeaderTitle>
                <div className="flex shrink-0 items-center gap-0.5">
                    {scripts.length > 0 && (
                        <PageHeaderAction label="Import scripts" onClick={handleImport}>
                            <Upload/>
                        </PageHeaderAction>
                    )}
                    <PageHeaderAction label="Settings" onClick={() => navigate("/settings")}>
                        <Settings/>
                    </PageHeaderAction>
                </div>
            </PageHeader>
            {scripts.length > 0 && (
                <>
                    {/* Search */}
                    <div className="shrink-0 px-4 pt-3 pb-2.5">
                        <div className="relative flex items-center">
                            <Search
                                strokeWidth={1.5}
                                className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
                            />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Search my scripts…"
                                className="h-9 rounded-full bg-card pl-9 pr-9 text-[13px]"
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 flex cursor-pointer items-center justify-center text-muted-foreground"
                                >
                                    <X strokeWidth={1.5} className="size-3"/>
                                </button>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* Scripts list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
                {scripts.length === 0 ? (
                    <div className="mt-10 flex flex-col items-center gap-5 px-2 text-center">
                        <p className="font-heading text-[22px] italic leading-snug text-foreground">
                            No scripts yet.
                        </p>
                        <p className="-mt-2 text-[13px] leading-relaxed text-muted-foreground">
                            Ask the AI to write one, or import an existing script.
                        </p>
                        <div className="flex w-full flex-col gap-2">
                            <Button asChild className="w-full gap-2">
                                <Link to="/" className="no-underline">
                                    <Sparkles strokeWidth={1.5} className="size-3.5"/>
                                    Start a conversation
                                </Link>
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleImport}
                                className="w-full gap-2"
                            >
                                <Upload strokeWidth={1.5} className="size-3.5"/>
                                Import a script
                            </Button>
                        </div>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="py-10 text-center">
                        <p className="font-heading text-[22px] italic text-muted-foreground">
                            Nothing matches "{search}".
                        </p>
                        <p className="mt-1.5 text-[13px] text-muted-foreground">
                            Or maybe the sloth hasn't built it yet.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
                        {filtered.map((script, i) => {
                            const isExpanded = expanded === script.id;
                            const isActive = script.status === "active";
                            const isLast = i === filtered.length - 1;

                            return (
                                <div
                                    key={script.id}
                                    className={[
                                        !isLast && "border-b border-muted",
                                        isExpanded && "bg-background",
                                        "transition-colors duration-[160ms]",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                >
                                    {/* Row */}
                                    <button
                                        onClick={() =>
                                            setExpanded(isExpanded ? null : script.id)
                                        }
                                        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left"
                                    >
                                        <span
                                            className={[
                                                "h-2 w-2 shrink-0 rounded-full",
                                                isActive ? "bg-accent" : "bg-border",
                                            ].join(" ")}
                                        />
                                        <span
                                            className={[
                                                "flex-1 truncate text-[14px] font-medium",
                                                isActive ? "text-foreground" : "text-muted-foreground",
                                            ].join(" ")}
                                        >
                                            {script.name}
                                        </span>
                                        <span
                                            className="truncate font-mono text-[10.5px] tracking-[.04em] text-muted-foreground">
                                            {script.urlMatchPattern
                                                .replace("*://", "")
                                                .replace("/*", "")}
                                        </span>
                                        <ChevronDown
                                            strokeWidth={1.5}
                                            className={[
                                                "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                                                isExpanded && "rotate-180",
                                            ]
                                                .filter(Boolean)
                                                .join(" ")}
                                        />
                                    </button>

                                    {/* Expanded body */}
                                    {isExpanded && (
                                        <div className="px-3.5 pb-3.5 pl-[34px]">
                                            {script.description && (
                                                <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">
                                                    {script.description}
                                                </p>
                                            )}
                                            <CodePreview script={script}/>
                                            <div className="flex items-center gap-1.5">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleStatus(script);
                                                    }}
                                                    className="h-7 gap-1 px-2 text-[11.5px]"
                                                >
                                                    {isActive ? (
                                                        <>
                                                            <Pause strokeWidth={1.5} className="size-[11px]"/>
                                                            Pause
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Play strokeWidth={1.5} className="size-[11px]"/>
                                                            Resume
                                                        </>
                                                    )}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        exportScript(script);
                                                        toast.success(`"${script.name}" exported.`);
                                                    }}
                                                    className="h-7 gap-1 px-2 text-[11.5px]"
                                                >
                                                    <Download strokeWidth={1.5} className="size-[11px]"/>
                                                    Export
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setConfirmDelete({
                                                            id: script.id,
                                                            name: script.name,
                                                        });
                                                    }}
                                                    className="h-7 gap-1 px-2 text-[11.5px] text-destructive hover:border-destructive hover:bg-destructive hover:text-white"
                                                >
                                                    <Trash2 strokeWidth={1.5} className="size-[11px]"/>
                                                    Delete
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Delete confirmation dialog */}
            <AlertDialog
                open={!!confirmDelete}
                onOpenChange={(open) => !open && setConfirmDelete(null)}
            >
                <AlertDialogContent className="max-w-xs rounded-[10px] border-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading text-[22px] leading-tight">
                            Delete {confirmDelete?.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                            This can't be undone. The sloth will pretend it never happened.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmRemoval}
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

/** The first few lines, enough to recognise a script; the whole thing opens in its own tab. */
function CodePreview({script}: { script: BackgroundScript }) {
    const lines = script.code.split("\n");
    const more = lines.length - PREVIEW_LINES;
    return (
        <button
            type="button"
            onClick={() => openScriptViewer(script.id)}
            aria-label={`Open the code of ${script.name} in a new tab`}
            className="group relative mb-3 block w-full cursor-pointer overflow-hidden rounded-[8px] border border-border bg-card text-left transition-colors duration-[160ms] hover:border-muted-foreground/40"
        >
            <div className="pointer-events-none overflow-hidden">
                <ScriptCode code={lines.slice(0, PREVIEW_LINES).join("\n")} fontSize="11px" padding="9px 11px"/>
            </div>
            {more > 0 && (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-card to-transparent"/>
            )}
            <span className="absolute right-2 bottom-1.5 rounded-full border border-border bg-background/90 px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors group-hover:text-foreground">
                {more > 0 ? `+${more} lines · Open ↗` : "Open ↗"}
            </span>
        </button>
    );
}

export default App;
