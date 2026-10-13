import {useEffect, useRef, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {
    ArrowRight,
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
import {Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,} from "@/components/ui/tooltip";
import {deleteScript, exportScript, importScriptsFromJson, loadScripts, updateScriptStatus,} from "./chat/lib/storage";
import type {BackgroundScript} from "./chat/lib/types";

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

    const reloadSidebarTab = () => {
        if (sidebarTabId) {
            chrome.runtime.sendMessage({type: "RELOAD_TAB", tabId: sidebarTabId});
        }
    };

    const handleImport = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        try {
            const text = await file.text();
            const count = await importScriptsFromJson(text);
            const updated = await loadScripts();
            setScripts(updated);
            reloadSidebarTab();
            toast.success(`Imported ${count} script${count !== 1 ? "s" : ""} successfully.`);
        } catch {
            toast.error("Invalid script file. Make sure it's a TamperSloth JSON export.");
        }
    };

    useEffect(() => {
        loadScripts().then(setScripts);
    }, []);

    const q = search.trim().toLowerCase();
    const filtered = q
        ? scripts.filter(
            (s) =>
                s.name.toLowerCase().includes(q) ||
                s.description.toLowerCase().includes(q),
        )
        : scripts;
    const sidebarTabId = Number(new URLSearchParams(window.location.search).get("tabId")) || 0;



    const handleToggleStatus = async (script: BackgroundScript) => {
        const next = script.status === "active" ? "paused" : "active";
        await updateScriptStatus(script.id, next);
        setScripts((prev) =>
            prev.map((s) => (s.id === script.id ? {...s, status: next} : s)),
        );
        reloadSidebarTab();
        toast.success(next === "paused" ? `"${script.name}" paused.` : `"${script.name}" resumed.`, {
            description: "The page has been refreshed to apply the change.",
        });
    };

    const confirmRemoval = async () => {
        if (!confirmDelete) return;
        const name = confirmDelete.name;           // capture before clearing
        await deleteScript(confirmDelete.id);
        setScripts((prev) => prev.filter((s) => s.id !== confirmDelete.id));
        if (expanded === confirmDelete.id) setExpanded(null);
        setConfirmDelete(null);
        reloadSidebarTab();
        toast.success(`"${name}" deleted.`, {
            description: "The page has been refreshed to apply the change.",
        });
    };

    return (
        <div className="relative flex h-full flex-col overflow-hidden bg-background font-sans">
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
            <header className="flex shrink-0 items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                    {/*<img src="favicon.svg" className="h-[22px] w-[22px]" alt=""/>*/}
                </div>
                <TooltipProvider delayDuration={300}>
                    <div className="flex items-center gap-1.5">
                        {scripts.length > 0 && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={handleImport}
                                        className="h-8 w-8 rounded-lg text-foreground/60"
                                    >
                                        <Upload strokeWidth={1.5} className="size-[15px]"/>
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Import scripts</TooltipContent>
                            </Tooltip>
                        )}

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => navigate("/settings")}
                                    className="h-8 w-8 rounded-lg text-foreground/60"
                                >
                                    <Settings strokeWidth={1.5} className="size-[15px]"/>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>Settings</TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
            </header>
            {scripts.length > 0 && (
                <>
                    {/* CTA card */}
                    <div className="shrink-0 px-4 pb-3">
                        <button
                            onClick={() => navigate("/chat")}
                            className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] bg-foreground px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
                        >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background">
                                <img src="icon.svg" className="h-7 w-7" alt=""/>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div
                                    className="mb-1 font-heading text-[19px] italic leading-[1.1] text-primary-foreground">
                                    Tell the sloth.
                                </div>
                                <div className="font-mono text-[10.5px] uppercase tracking-[.12em] text-[var(--sand)]">
                                    What do you want to change?
                                </div>
                            </div>
                            <ArrowRight
                                strokeWidth={1.5}
                                className="size-4 shrink-0 text-primary-foreground"
                            />
                        </button>
                    </div>

                    {/* Search */}
                    <div className="shrink-0 px-4 pb-2.5">
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
                                <Link to="/chat" className="no-underline">
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
                        <p className="font-heading text-[22px] italic text-[var(--bark)]">
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
                                                <p className="mb-3 text-[13px] leading-relaxed text-[var(--bark)]">
                                                    {script.description}
                                                </p>
                                            )}
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
                        <AlertDialogDescription className="text-[13px] leading-relaxed text-[var(--bark)]">
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

export default App;