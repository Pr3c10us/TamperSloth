import {Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent} from "react";
import {useNavigate} from "react-router-dom";
import {Brain, Check, ChevronDown, ChevronRight, ChevronUp, KeyRound, Search, Settings2, X} from "lucide-react";
import {
    MODEL_MAKER_NAMES,
    MODELPROVIDERS,
    formatModelName,
    isKnownModel,
    modelMaker,
    type ProviderConfig,
    type ProviderId,
} from "@/agent/models/provider";
import {loadSelectedModel, saveSelectedModel} from "@/storage/selectedModel";
import {ModelLogo, ProviderLogo} from "@/ui/ProviderLogo";
import {ThinkingLevelPage, useDefaultThinkingLevel} from "./ThinkingSelector";
import {THINKING_LEVELS, type ThinkingLevel} from "@/agent/models/thinkingLevel";
import {resolveThinkingLevel, thinkingLevelsFor} from "@/agent/models/providerCompatibility";
import {Button} from "@/ui/shadcn/button";
import {Input} from "@/ui/shadcn/input";
import {Popover, PopoverContent, PopoverTrigger,} from "@/ui/shadcn/popover";
import {Tooltip, TooltipContent, TooltipTrigger} from "@/ui/shadcn/tooltip";
import {cn} from "@/ui/utils";
import {getApiKeys, subscribeApiKeys} from "@/storage/apiKeys";
import {refreshAccount} from "@/account/account";
import {useAccount} from "@/account/useAccount";
import {
    PlanBadge,
    SlothModelRow,
    SlothSignInCard,
    SlothUsageMeter,
    slothModelInfo,
} from "@/ui/SlothModels";

export interface SelectedModelEntry {
    providerId: ProviderId;
    modelId: string;
    providerName: string;
    providerIcon: string;
}

interface ModelSelectorProps {
    selected: SelectedModelEntry | null;
    onChange: (entry: SelectedModelEntry) => void;
    /** This chat's thinking level; `undefined` follows the default in Preferences. */
    thinkingLevel: ThinkingLevel | undefined;
    onThinkingLevelChange: (level: ThinkingLevel) => void;
}

function toEntry(p: ProviderConfig, modelId: string): SelectedModelEntry {
    return {providerId: p.id, modelId, providerName: p.name, providerIcon: p.icon};
}

export function ModelSelector({selected, onChange, thinkingLevel, onThinkingLevelChange}: ModelSelectorProps) {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    // The panel is too narrow for a flyout, so thinking levels replace the model list instead.
    const [page, setPage] = useState<"models" | "thinking">("models");
    const defaultLevel = useDefaultThinkingLevel();
    // A level the model doesn't offer runs as the nearest one it does; the chat keeps its choice for other models.
    const levels = selected ? thinkingLevelsFor(selected.providerId, selected.modelId) : [];
    const level = selected ? resolveThinkingLevel(thinkingLevel ?? defaultLevel, selected.providerId, selected.modelId) : undefined;
    const levelLabel = level && THINKING_LEVELS.find((l) => l.value === level)!.label;
    const [query, setQuery] = useState("");
    const [activeId, setActiveId] = useState<ProviderId>(MODELPROVIDERS[0].id);
    // -1 means no row is highlighted until the pointer or arrow keys pick one.
    const [highlight, setHighlight] = useState(-1);
    const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});
    const {signedIn, account} = useAccount();
    const listRef = useRef<HTMLDivElement>(null);
    // The popover takes each page's height, so switching pages morphs its size.
    const [pageHeight, setPageHeight] = useState<number>();
    const pageObserver = useRef<ResizeObserver | null>(null);
    // A callback ref: the popover's content mounts in a portal after this component's effects run.
    const pageRef = useCallback((el: HTMLDivElement | null) => {
        pageObserver.current?.disconnect();
        pageObserver.current = null;
        if (!el) return;
        const measure = () => setPageHeight(el.offsetHeight);
        measure();
        pageObserver.current = new ResizeObserver(measure);
        pageObserver.current.observe(el);
    }, []);

    useEffect(() => {
        getApiKeys().then((m) => setApiKeys(m as Partial<Record<ProviderId, string>>));
        return subscribeApiKeys((m) =>
            setApiKeys(m as Partial<Record<ProviderId, string>>),
        );
    }, []);

    // Sloth models need a signed-in account rather than a key.
    const connected = useMemo(
        (): Partial<Record<ProviderId, string>> => ({...apiKeys, tampersloth: signedIn ? "account" : undefined}),
        [apiKeys, signedIn],
    );

    // TamperSloth leads, then connected providers so the rail shows what can be
    // used; the rest stay visible (dimmed) as a path to adding a key.
    const providers = useMemo(() => {
        const rest = MODELPROVIDERS.filter((p) => p.id !== "tampersloth");
        return [
            MODELPROVIDERS.find((p) => p.id === "tampersloth")!,
            ...rest.filter((p) => !!connected[p.id]),
            ...rest.filter((p) => !connected[p.id]),
        ];
    }, [connected]);
    const active = MODELPROVIDERS.find((p) => p.id === activeId)!;
    const activeConnected = !!connected[active.id];

    const q = query.trim().toLowerCase();
    const slothPane = !q && active.id === "tampersloth";
    // Searching spans every connected provider; otherwise show the active one.
    const visible: SelectedModelEntry[] = useMemo(() => {
        if (!q) return activeConnected ? active.models.map((m) => toEntry(active, m)) : [];
        return MODELPROVIDERS.filter((p) => !!connected[p.id]).flatMap((p) =>
            p.models
                .filter(
                    (m) =>
                        m.toLowerCase().includes(q) ||
                        formatModelName(m).toLowerCase().includes(q) ||
                        !!p.makerOf && MODEL_MAKER_NAMES[p.makerOf(m)].toLowerCase().includes(q) ||
                        (p.id === "tampersloth" && slothModelInfo(m, account).tagline.toLowerCase().includes(q)) ||
                        p.name.toLowerCase().includes(q),
                )
                .map((m) => toEntry(p, m)),
        );
    }, [q, active, activeConnected, connected, account]);

    // While searching, the top result is highlighted so Enter picks it.
    useEffect(() => setHighlight(q ? 0 : -1), [q, activeId]);

    useEffect(() => {
        listRef.current
            ?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)
            ?.scrollIntoView({block: "nearest"});
    }, [highlight]);

    const showThinking = page === "thinking" && !!level;

    const handleOpenChange = (next: boolean) => {
        if (next) {
            if (signedIn) void refreshAccount();
            const firstConnected = providers.find((p) => !!connected[p.id]);
            setActiveId(selected?.providerId ?? firstConnected?.id ?? MODELPROVIDERS[0].id);
            setPage("models");
        } else {
            setQuery("");
            // Reopening starts from the model list, without morphing from the last page's height.
            setPageHeight(undefined);
        }
        setOpen(next);
    };

    const isLocked = (entry: SelectedModelEntry) =>
        entry.providerId === "tampersloth" && slothModelInfo(entry.modelId, account).locked;

    const handleSelect = async (entry: SelectedModelEntry) => {
        // A locked Sloth model can't be picked; its Pro badge says why.
        if (isLocked(entry)) return;
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
            const down = e.key === "ArrowDown";
            setHighlight((h) =>
                h < 0 ? (down ? 0 : visible.length - 1) : (h + (down ? 1 : -1) + visible.length) % visible.length,
            );
        } else if (e.key === "Enter" && visible[highlight] && !isLocked(visible[highlight])) {
            e.preventDefault();
            void handleSelect(visible[highlight]);
        }
    };

    const label = selected ? formatModelName(selected.modelId) : "Select model";
    const selectedMaker = selected && modelMaker(selected.providerId, selected.modelId);
    // "Claude Opus 5.5 by Anthropic via Google Vertex AI": the stacked logos, in words.
    const fullLabel = selected && selectedMaker
        ? `${label} by ${MODEL_MAKER_NAMES[selectedMaker]} via ${selected.providerName}`
        : label;

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    aria-expanded={open}
                    aria-label={levelLabel ? `${fullLabel}, ${levelLabel} thinking` : fullLabel}
                    title={selectedMaker ? fullLabel : undefined}
                    className="max-w-[240px] gap-1.5 overflow-hidden px-1.5 font-sans text-[12.5px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:text-foreground"
                >
                    {selected && <ModelLogo providerId={selected.providerId} modelId={selected.modelId} size={14}/>}
                    <span className="truncate">{label}</span>
                    {levelLabel && <span className="shrink-0 text-muted-foreground/70">{levelLabel}</span>}
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
                style={{height: pageHeight}}
                className="w-[20rem] max-w-[calc(100vw-1.5rem)] overflow-hidden p-0 transition-[height] duration-200 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none"
            >
                <div ref={pageRef} className={cn("flex flex-col", !showThinking && "h-[320px]")}>
                {showThinking ? (
                    <ThinkingLevelPage
                        level={level}
                        levels={levels}
                        onBack={() => setPage("models")}
                        onSelect={(next) => {
                            onThinkingLevelChange(next);
                            handleOpenChange(false);
                        }}
                    />
                ) : (<>
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
                        className="flex w-11 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-muted/40 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                    >
                        {providers.map((p) => {
                            const isConnected = !!connected[p.id];
                            const needs = p.id === "tampersloth" ? "sign in" : "add key";
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
                                            aria-label={isConnected ? p.name : `${p.name} (${needs})`}
                                            aria-current={isActive ? "true" : undefined}
                                            className={cn(
                                                "relative flex size-8 shrink-0 items-center justify-center rounded-lg text-foreground transition-[background-color,opacity,filter] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                                                isActive
                                                    ? "bg-background shadow-sm ring-1 ring-border"
                                                    : "hover:bg-background/70",
                                                !isConnected && !isActive && "opacity-40 grayscale hover:opacity-80 hover:grayscale-0",
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
                                        {isConnected ? p.name : `${p.name} · ${needs}`}
                                    </TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </nav>

                    <div className="flex min-w-0 flex-1 flex-col">
                        <div
                            className="flex items-center justify-between gap-2 px-3 pb-1 pt-2 font-mono text-[9.5px] uppercase tracking-[.14em] text-muted-foreground">
                            <span className="truncate">{q ? "Results" : active.name}</span>
                            {slothPane && account ? (
                                <PlanBadge account={account}/>
                            ) : (q || activeConnected) && (
                                <span className="shrink-0 tabular-nums">{visible.length}</span>
                            )}
                        </div>

                        <div ref={listRef} role="listbox" aria-label="Models" onMouseLeave={() => setHighlight(-1)} className="min-h-0 flex-1 overflow-y-auto px-1 pb-1">
                            {slothPane && !signedIn ? (
                                <SlothSignInCard
                                    onSignedIn={async () => {
                                        // Sign-in kept a usable BYOK model, or else moved to the plan's default.
                                        const entry = await loadInitialSelectedModel();
                                        if (entry?.providerId !== "tampersloth") return;
                                        onChange(entry);
                                        handleOpenChange(false);
                                    }}
                                />
                            ) : !q && !activeConnected ? (
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
                                    if (!q && entry.providerId === "tampersloth") {
                                        return (
                                            <SlothModelRow
                                                key={entry.modelId}
                                                modelId={entry.modelId}
                                                account={account}
                                                selected={isSelected}
                                                highlighted={i === highlight}
                                                index={i}
                                                onSelect={() => void handleSelect(entry)}
                                                onHover={() => setHighlight(i)}
                                            />
                                        );
                                    }
                                    const maker = modelMaker(entry.providerId, entry.modelId);
                                    // An aggregator's list is grouped by maker (Gemini and Gemma are both Google's).
                                    const group = !q && maker ? MODEL_MAKER_NAMES[maker] : undefined;
                                    const groupOf = (e?: SelectedModelEntry) => {
                                        const m = e && modelMaker(e.providerId, e.modelId);
                                        return m && MODEL_MAKER_NAMES[m];
                                    };
                                    const groupStart = !!group && group !== groupOf(visible[i - 1]);
                                    const groupSize = groupStart ? visible.filter((e) => groupOf(e) === group).length : 0;
                                    return (
                                        <Fragment key={`${entry.providerId}-${entry.modelId}`}>
                                        {groupStart && (
                                            <div
                                                role="presentation"
                                                className={cn(
                                                    "sticky top-0 z-10 -mx-1 flex items-center gap-1.5 bg-popover/95 px-3.5 pb-1 font-mono text-[9.5px] uppercase tracking-[.14em] text-muted-foreground backdrop-blur-sm",
                                                    i === 0 ? "pt-0.5" : "pt-2.5",
                                                )}
                                            >
                                                <span className="truncate">{group}</span>
                                                <span aria-hidden className="h-px flex-1 bg-border/70"/>
                                                <span className="shrink-0 tabular-nums text-muted-foreground/70">{groupSize}</span>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={isSelected}
                                            data-index={i}
                                            onClick={() => handleSelect(entry)}
                                            onMouseMove={() => setHighlight(i)}
                                            className={cn(
                                                "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none",
                                                i === highlight && "bg-muted",
                                                // Keyboard scrolling stops clear of the sticky group header.
                                                group && "scroll-mt-7",
                                            )}
                                        >
                                            {q ? (
                                                // Wide enough for a stacked pair, so single marks line up with them.
                                                <span className="flex w-6 shrink-0 justify-center">
                                                    <ModelLogo providerId={entry.providerId} modelId={entry.modelId} size={14}/>
                                                </span>
                                            ) : maker && (
                                                <ProviderLogo provider={maker} className="size-4"/>
                                            )}
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
                                                    {!q ? entry.modelId
                                                        : maker ? `${MODEL_MAKER_NAMES[maker]} · via ${entry.providerName}`
                                                            : entry.providerName}
                                                </div>
                                            </div>
                                            {isSelected && (
                                                <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2}/>
                                            )}
                                        </button>
                                        </Fragment>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {level && <button
                    type="button"
                    onClick={() => setPage("thinking")}
                    className="flex items-center gap-2 border-t border-border px-2.5 py-2 text-left text-[12.5px] text-foreground outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                >
                    <Brain className="size-3.5 text-muted-foreground" strokeWidth={1.5}/>
                    Thinking
                    <span className="ml-auto text-muted-foreground">{levelLabel}</span>
                    <ChevronRight className="size-3.5 text-muted-foreground" strokeWidth={1.75}/>
                </button>}

                {slothPane && account ? (
                    <button
                        type="button"
                        onClick={openConnections}
                        aria-label="Manage your TamperSloth account"
                        className="border-t border-border px-2.5 py-2 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
                    >
                        <SlothUsageMeter account={account}/>
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={openConnections}
                        className="flex items-center gap-1.5 border-t border-border px-2.5 py-2 text-left font-mono text-[10px] tracking-[.06em] text-muted-foreground outline-none hover:text-foreground focus-visible:text-foreground"
                    >
                        <Settings2 className="size-2.5" strokeWidth={1.5}/>
                        BYOK · Manage keys in Connections
                    </button>
                )}
                </>)}
                </div>
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
