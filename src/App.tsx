import {useEffect, useRef, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {ArrowRight, ChevronDown, Download, Pause, Play, Search, Settings, Sparkles, Trash2, Upload, X,} from "lucide-react";
import {Button} from "@/components/ui/button";
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
    const [importError, setImportError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImport = () => {
        setImportError(null);
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
            setImportError(`Imported ${count} script${count !== 1 ? "s" : ""} successfully.`);
        } catch {
            setImportError("Invalid script file. Make sure it's a TamperSloth JSON export.");
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

    const handleToggleStatus = async (script: BackgroundScript) => {
        const next = script.status === "active" ? "paused" : "active";
        await updateScriptStatus(script.id, next);
        setScripts((prev) =>
            prev.map((s) => (s.id === script.id ? {...s, status: next} : s)),
        );
    };

    const confirmRemoval = async () => {
        if (!confirmDelete) return;
        await deleteScript(confirmDelete.id);
        setScripts((prev) => prev.filter((s) => s.id !== confirmDelete.id));
        if (expanded === confirmDelete.id) setExpanded(null);
        setConfirmDelete(null);
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

            {/* Header */}
            <header className="flex shrink-0 items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                    <img src="favicon.svg" className="h-[22px] w-[22px]" alt=""/>
                </div>
                <div className="flex items-center gap-1.5">
                    <button
                        onClick={handleImport}
                        title="Import scripts"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground/60 transition-colors hover:bg-muted"
                    >
                        <Upload strokeWidth={1.5} className="size-[15px]"/>
                    </button>
                    <button
                        onClick={() => navigate("/settings")}
                        title="Settings"
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-background text-foreground/60 transition-colors hover:bg-muted"
                    >
                        <Settings strokeWidth={1.5} className="size-[15px]"/>
                    </button>
                </div>
            </header>

            {/* CTA card */}
            <div className="shrink-0 px-4 pb-3">
                <button
                    onClick={() => navigate("/chat")}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-[10px] bg-foreground px-3.5 py-3 text-left transition-transform active:scale-[0.99]"
                >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-background">
                        <Sparkles strokeWidth={1.5} className="size-[18px] text-foreground"/>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="mb-1 font-heading text-[19px] italic leading-[1.1] text-primary-foreground">
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
                <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2">
                    <Search
                        strokeWidth={1.5}
                        className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search my scripts…"
                        className="flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                    />
                    {search && (
                        <button
                            onClick={() => setSearch("")}
                            className="flex cursor-pointer items-center justify-center text-muted-foreground"
                        >
                            <X strokeWidth={1.5} className="size-3"/>
                        </button>
                    )}
                </div>
            </div>

            {/* Scripts list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
                {/* Section label */}
                {scripts.length === 0 ? (
                    <div className="flex flex-col items-center gap-5 mt-10 px-2 text-center">
                        <p className="font-heading text-[22px] italic leading-snug text-foreground">
                            No scripts yet.
                        </p>
                        <p className="text-[13px] leading-relaxed text-muted-foreground -mt-2">
                            Ask the AI to write one, or import an existing script.
                        </p>
                        <div className="flex flex-col w-full gap-2">
                            <Link
                                to="/chat"
                                className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-foreground px-4 py-2.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
                            >
                                <Sparkles strokeWidth={1.5} className="size-3.5"/>
                                Start a conversation
                            </Link>
                            <button
                                onClick={handleImport}
                                className="flex w-full items-center justify-center gap-2 rounded-[8px] border border-border px-4 py-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted"
                            >
                                <Upload strokeWidth={1.5} className="size-3.5"/>
                                Import a script
                            </button>
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
                                            className="font-mono text-[10.5px] tracking-[.04em] text-muted-foreground">
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
                                                <ActionButton
                                                    icon={
                                                        isActive ? (
                                                            <Pause
                                                                strokeWidth={1.5}
                                                                className="size-[11px]"
                                                            />
                                                        ) : (
                                                            <Play
                                                                strokeWidth={1.5}
                                                                className="size-[11px]"
                                                            />
                                                        )
                                                    }
                                                    label={isActive ? "Pause" : "Resume"}
                                                    onClick={() => handleToggleStatus(script)}
                                                />
                                                <ActionButton
                                                    icon={
                                                        <Download
                                                            strokeWidth={1.5}
                                                            className="size-[11px]"
                                                        />
                                                    }
                                                    label="Export"
                                                    onClick={() => exportScript(script)}
                                                />
                                                <ActionButton
                                                    icon={
                                                        <Trash2
                                                            strokeWidth={1.5}
                                                            className="size-[11px]"
                                                        />
                                                    }
                                                    label="Delete"
                                                    onClick={() =>
                                                        setConfirmDelete({
                                                            id: script.id,
                                                            name: script.name,
                                                        })
                                                    }
                                                    danger
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Import feedback toast */}
            {importError && (
                <div
                    className="absolute bottom-4 left-4 right-4 z-40 flex items-center justify-between gap-3 rounded-[8px] border border-border bg-card px-3.5 py-2.5 shadow-sm"
                    onClick={() => setImportError(null)}
                >
                    <span className="text-[13px] text-foreground">{importError}</span>
                    <X strokeWidth={1.5} className="size-3.5 shrink-0 cursor-pointer text-muted-foreground"/>
                </div>
            )}

            {/* Delete confirmation dialog */}
            {confirmDelete && (
                <div
                    className="absolute inset-0 z-50 flex items-center justify-center bg-foreground/50 p-5"
                    onClick={() => setConfirmDelete(null)}
                >
                    <div
                        className="w-full max-w-xs rounded-[10px] border border-foreground bg-background p-[18px]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="mb-2 font-heading text-[22px] leading-tight">
                            Delete {confirmDelete.name}?
                        </h2>
                        <p className="mb-4 text-[13px] leading-relaxed text-[var(--bark)]">
                            This can't be undone. The sloth will pretend it never happened.
                        </p>
                        <div className="flex justify-end gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setConfirmDelete(null)}
                            >
                                Keep it
                            </Button>
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={confirmRemoval}
                            >
                                Delete
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ActionButton({
                          icon,
                          label,
                          onClick,
                          danger = false,
                      }: {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
}) {
    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            className={[
                "inline-flex cursor-pointer items-center gap-[5px] rounded-md border px-[9px] py-[5px]",
                "text-[11.5px] font-medium transition-all duration-[160ms]",
                danger
                    ? "border-border text-destructive hover:border-destructive hover:bg-destructive hover:text-destructive-foreground"
                    : "border-border text-[var(--bark)] hover:border-foreground hover:bg-foreground hover:text-background",
            ].join(" ")}
        >
            {icon}
            {label}
        </button>
    );
}

export default App;
