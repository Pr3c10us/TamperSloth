import {useEffect, useMemo, useRef, useState, type KeyboardEvent} from "react";
import {useNavigate} from "react-router-dom";
import {Check, ChevronDown, ChevronUp, KeyRound, Search, Settings2, X} from "lucide-react";
import {MODELPROVIDERS, formatModelName, isKnownModel, type ProviderConfig, type ProviderId} from "../lib/provider";
import {loadSelectedModel, saveSelectedModel} from "../lib/storage";
import {ProviderLogo} from "./ProviderLogo";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/components/ui/tooltip";
import {cn} from "@/lib/utils";
import {getApiKeys, subscribeApiKeys} from "@/src/settings/lib/storage.ts";

export interface SelectedModelEntry {
    providerId: ProviderId;
    modelId: string;
    providerName: string;
    providerIcon: string;
}

interface ModelSelectorProps {
    selected: SelectedModelEntry | null;
    onChange: (entry: SelectedModelEntry) => void;
}

function toEntry(p: ProviderConfig, modelId: string): SelectedModelEntry {
    return {providerId: p.id, modelId, providerName: p.name, providerIcon: p.icon};
}

export function ModelSelector({selected, onChange}: ModelSelectorProps) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [activeId, setActiveId] = useState<ProviderId>(MODELPROVIDERS[0].id);
    const [highlight, setHighlight] = useState(0);
    const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        getApiKeys().then((m) => setApiKeys(m as Partial<Record<ProviderId, string>>));
        return subscribeApiKeys((m) =>
            setApiKeys(m as Partial<Record<ProviderId, string>>),
        );
    }, []);

    // Connected providers first so the rail leads with what can be used;
    // the rest stay visible (dimmed) as a path to adding a key.
    const providers = useMemo(
        () => [
            ...MODELPROVIDERS.filter((p) => !!apiKeys[p.id]),
            ...MODELPROVIDERS.filter((p) => !apiKeys[p.id]),
        ],
        [apiKeys],
    );
    const active = MODELPROVIDERS.find((p) => p.id === activeId)!;
    const activeConnected = !!apiKeys[active.id];

    const q = query.trim().toLowerCase();
    // Searching spans every connected provider; otherwise show the active one.
    const visible: SelectedModelEntry[] = useMemo(() => {
        if (!q) return activeConnected ? active.models.map((m) => toEntry(active, m)) : [];
        return MODELPROVIDERS.filter((p) => !!apiKeys[p.id]).flatMap((p) =>
            p.models
                .filter(
                    (m) =>
                        m.toLowerCase().includes(q) ||
                        formatModelName(m).toLowerCase().includes(q) ||
                        p.name.toLowerCase().includes(q),
                )
                .map((m) => toEntry(p, m)),
        );
    }, [q, active, activeConnected, apiKeys]);

    useEffect(() => setHighlight(0), [q, activeId]);

    useEffect(() => {
        listRef.current
            ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
            ?.scrollIntoView({block: "nearest"});
    }, [highlight]);

    const handleOpenChange = (next: boolean) => {
        if (next) {
            const firstConnected = MODELPROVIDERS.find((p) => !!apiKeys[p.id]);
            setActiveId(selected?.providerId ?? firstConnected?.id ?? MODELPROVIDERS[0].id);
        } else {
            setQuery("");
        }
        setOpen(next);
    };

    const handleSelect = async (entry: SelectedModelEntry) => {
        await saveSelectedModel(entry.providerId, entry.modelId);
        onChange(entry);
        handleOpenChange(false);
    };

    const openConnections = () => {
        handleOpenChange(false);
        navigate("/settings?tab=connections");
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!visible.length) return;
            e.preventDefault();
            const step = e.key === "ArrowDown" ? 1 : -1;
            setHighlight((h) => (h + step + visible.length) % visible.length);
        } else if (e.key === "Enter" && visible[highlight]) {
            e.preventDefault();
            void handleSelect(visible[highlight]);
        }
    };

    const label = selected ? formatModelName(selected.modelId) : "Select model";

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-expanded={open}
                    className="max-w-[200px] gap-1.5 overflow-hidden px-1.5 font-sans text-[12.5px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:text-foreground"
                >
                    {selected && <ProviderLogo provider={selected.providerId} className="size-3.5"/>}
                    <span className="truncate">{label}</span>
                    {open ? (
                        <ChevronDown className="size-3 text-muted-foreground" strokeWidth={1.5}/>
                    ) : (
                        <ChevronUp className="size-3 text-muted-foreground" strokeWidth={1.5}/>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                side="top"
                align="end"
                sideOffset={6}
                className="flex h-[320px] w-[20rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden p-0"
            >
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
                    <Search className="size-3 text-muted-foreground" strokeWidth={1.5}/>
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search all models…"
                        aria-label="Search models"
                        className="h-7 border-0 bg-transparent px-0 text-[12.5px] shadow-none focus-visible:ring-0 dark:bg-transparent"
                    />
                    {query && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => setQuery("")}
                            aria-label="Clear search"
                            className="shrink-0 text-muted-foreground"
                        >
                            <X className="size-2.5" strokeWidth={1.5}/>
                        </Button>
                    )}
                </div>

                <div className="flex min-h-0 flex-1">
                    <nav
                        aria-label="Providers"
                        className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-muted/40 py-1.5"
                    >
                        {providers.map((p) => {
                            const connected = !!apiKeys[p.id];
                            const isActive = !q && p.id === activeId;
                            const holdsSelection = p.id === selected?.providerId;
                            return (
                                <Tooltip key={p.id}>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setActiveId(p.id);
                                                setQuery("");
                                            }}
                                            aria-label={connected ? p.name : `${p.name} (no API key)`}
                                            aria-current={isActive ? "true" : undefined}
                                            className={cn(
                                                "relative flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground transition-[background-color,opacity,filter] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                                isActive
                                                    ? "bg-background shadow-sm ring-1 ring-border"
                                                    : "hover:bg-background/70",
                                                !connected && !isActive && "opacity-40 grayscale hover:opacity-80 hover:grayscale-0",
                                            )}
                                        >
                                            <ProviderLogo provider={p.id} className="size-[18px]"/>
                                            {holdsSelection && (
                                                <span
                                                    aria-hidden
                                                    className="absolute -left-[5px] top-1/2 h-3 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                                                />
                                            )}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="left">
                                        {connected ? p.name : `${p.name} · add key`}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </nav>

                    <div className="flex min-w-0 flex-1 flex-col">
                        <div
                            className="flex items-center justify-between gap-2 px-3 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[.14em] text-muted-foreground">
                            <span className="truncate">{q ? "Results" : active.name}</span>
                            {(q || activeConnected) && (
                                <span className="shrink-0 tabular-nums">{visible.length}</span>
                            )}
                        </div>

                        <div ref={listRef} role="listbox" aria-label="Models" className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                            {!q && !activeConnected ? (
                                <div className="flex h-full flex-col items-center justify-center gap-2 px-4 pb-4 text-center">
                                    <ProviderLogo provider={active.id} className="size-7"/>
                                    <div className="text-[13px] font-medium text-foreground">
                                        Connect {active.name}
                                    </div>
                                    <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                                        Add an API key to use its {active.models.length} models.
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="mt-1" onClick={openConnections}>
                                        <KeyRound strokeWidth={1.75}/>
                                        Add API key
                                    </Button>
                                </div>
                            ) : visible.length === 0 ? (
                                <div className="px-3 py-5 text-center text-[12.5px] text-muted-foreground">
                                    No models match "{query}".
                                </div>
                            ) : (
                                visible.map((entry, i) => {
                                    const isSelected =
                                        entry.providerId === selected?.providerId &&
                                        entry.modelId === selected?.modelId;
                                    const provider = MODELPROVIDERS.find((p) => p.id === entry.providerId)!;
                                    return (
                                        <button
                                            key={`${entry.providerId}-${entry.modelId}`}
                                            type="button"
                                            role="option"
                                            aria-selected={isSelected}
                                            data-index={i}
                                            onClick={() => handleSelect(entry)}
                                            onMouseMove={() => setHighlight(i)}
                                            className={cn(
                                                "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none",
                                                i === highlight && "bg-muted",
                                            )}
                                        >
                                            {q && <ProviderLogo provider={entry.providerId} className="size-3.5"/>}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate text-[13px] font-medium text-foreground">
                                                        {formatModelName(entry.modelId)}
                                                    </span>
                                                    {!q && entry.modelId === provider.defaultModel && (
                                                        <span className="shrink-0 rounded-sm bg-muted px-1 font-mono text-[9px] uppercase tracking-[.08em] text-muted-foreground">
                                                            Default
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">
                                                    {q ? entry.providerName : entry.modelId}
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2}/>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    onClick={openConnections}
                    className="flex items-center gap-1.5 border-t border-border px-2.5 py-2 text-left font-mono text-[10px] tracking-[.06em] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
                >
                    <Settings2 className="size-2.5" strokeWidth={1.5}/>
                    BYOK · Manage keys in Connections
                </button>
            </PopoverContent>
        </Popover>
    );
}

export async function loadInitialSelectedModel(): Promise<SelectedModelEntry | null> {
    const saved = await loadSelectedModel();
    if (!saved) return null;
    const provider = MODELPROVIDERS.find((p) => p.id === saved.providerId);
    if (!provider) return null;
    // A model retired since the selection was saved would otherwise keep being
    // sent to the API and 404 on every request, with the picker still showing
    // the dead ID as if it were fine.
    const modelId = isKnownModel(saved.providerId, saved.modelId)
        ? saved.modelId
        : provider.defaultModel;
    if (modelId !== saved.modelId) {
        void saveSelectedModel(saved.providerId, modelId);
    }
    return toEntry(provider, modelId);
}
