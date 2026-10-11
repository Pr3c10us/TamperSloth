import {useEffect, useMemo, useState} from "react";
import {Check, ChevronDown, ChevronUp, HardDrive, KeyRound, Search, X} from "lucide-react";
import {MODELPROVIDERS, isKnownModel, type ProviderId} from "../lib/provider";
import {loadSelectedModel, saveSelectedModel} from "../lib/storage";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Popover, PopoverContent, PopoverTrigger,} from "@/components/ui/popover";
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

export function ModelSelector({selected, onChange}: ModelSelectorProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [apiKeys, setApiKeys] = useState<Partial<Record<ProviderId, string>>>({});

    useEffect(() => {
        getApiKeys().then((m) => setApiKeys(m as Partial<Record<ProviderId, string>>));
        return subscribeApiKeys((m) =>
            setApiKeys(m as Partial<Record<ProviderId, string>>),
        );
    }, []);

    const entries: SelectedModelEntry[] = useMemo(
        () =>
            MODELPROVIDERS.filter((p) => !!apiKeys[p.id]).flatMap((p) =>
                p.models.map((m) => ({
                    providerId: p.id,
                    modelId: m,
                    providerName: p.name,
                    providerIcon: p.icon,
                })),
            ),
        [apiKeys],
    );

    const q = query.trim().toLowerCase();
    const filtered = q
        ? entries.filter(
            (e) =>
                e.modelId.toLowerCase().includes(q) ||
                e.providerName.toLowerCase().includes(q),
        )
        : entries;

    const grouped = filtered.reduce<Record<string, SelectedModelEntry[]>>((acc, e) => {
        (acc[e.providerName] ||= []).push(e);
        return acc;
    }, {});

    const handleSelect = async (entry: SelectedModelEntry) => {
        await saveSelectedModel(entry.providerId, entry.modelId);
        onChange(entry);
        setOpen(false);
        setQuery("");
    };

    const label = selected ? selected.modelId : "Select model";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    className="max-w-[160px] gap-1.5 overflow-hidden px-2.5 font-sans text-[12.5px] font-medium"
                >
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
                align="start"
                sideOffset={6}
                className="flex max-h-[360px] w-[16rem] flex-col overflow-hidden p-0"
            >
                <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
                    <Search className="size-3 text-muted-foreground" strokeWidth={1.5}/>
                    <Input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search models…"
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

                <div className="overflow-y-auto p-1">
                    {entries.length === 0 ? (
                        <div className="flex flex-col items-center gap-2 p-6 text-center">
                            <KeyRound className="size-5 text-muted-foreground" strokeWidth={1.5}/>
                            <div className="text-sm font-medium text-foreground">
                                No providers configured
                            </div>
                            <div className="text-xs leading-relaxed text-muted-foreground">
                                Add an API key in Settings → Connections to pick a model.
                            </div>
                        </div>
                    ) : Object.keys(grouped).length === 0 ? (
                        <div className="px-3 py-5 text-center text-[12.5px] text-muted-foreground">
                            No models match "{query}".
                        </div>
                    ) : (
                        Object.entries(grouped).map(([provName, list], pi) => (
                            <div key={provName} className={pi === 0 ? "" : "mt-1.5"}>
                                <div
                                    className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 font-mono text-[9.5px] uppercase tracking-[.14em] text-muted-foreground">
                                    {provName === "Local" && (
                                        <HardDrive className="size-2.5" strokeWidth={1.5}/>
                                    )}
                                    {provName}
                                </div>
                                {list.map((entry) => {
                                    const active =
                                        entry.providerId === selected?.providerId &&
                                        entry.modelId === selected?.modelId;
                                    return (
                                        <Button
                                            key={`${entry.providerId}-${entry.modelId}`}
                                            type="button"
                                            variant="ghost"
                                            onClick={() => handleSelect(entry)}
                                            className={cn(
                                                "h-auto w-full items-start justify-start gap-2 rounded-md px-2.5 py-1.5 text-left",
                                                active && "bg-muted",
                                            )}
                                        >
                                            <div className="min-w-0 flex-1">
                                                <div className="truncate text-[13px] font-medium text-foreground">
                                                    {entry.modelId}
                                                </div>
                                                <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                                                    {entry.providerName}
                                                </div>
                                            </div>
                                            {active && (
                                                <Check
                                                    className="mt-0.5 size-3.5 shrink-0 text-accent"
                                                    strokeWidth={2}
                                                />
                                            )}
                                        </Button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                <div
                    className="flex items-center gap-1.5 border-t border-border px-2.5 py-2 font-mono text-[10px] tracking-[.06em] text-muted-foreground">
                    <KeyRound className="size-2.5" strokeWidth={1.5}/>
                    BYOK · Settings → Connections
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
    return {
        providerId: saved.providerId,
        modelId,
        providerName: provider.name,
        providerIcon: provider.icon,
    };
}
