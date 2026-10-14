import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DICTATION_LANGUAGES, languageName, type DictationSettings } from "../lib/dictation";
import type { DictationStatus } from "../hooks/useDictation";

/** Radio value for "let the browser choose"; the stored setting for it is an empty string. */
const DEFAULT = "default";

interface DictationButtonProps {
    status: DictationStatus;
    settings: DictationSettings;
    onSettingsChange: (settings: DictationSettings) => void;
    onToggle: () => void;
}

/** The mic toggle with its options chevron: which microphone and which language to listen for. */
export function DictationButton({ status, settings, onSettingsChange, onToggle }: DictationButtonProps) {
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    // The side panel is too narrow for a flyout, so the language list replaces the menu's page instead.
    const [page, setPage] = useState<"main" | "language">("main");
    const active = status !== "idle";
    const displayIn = typeof navigator !== "undefined" ? navigator.language : "en";
    const autoLang = typeof navigator !== "undefined" ? navigator.language : "en-US";

    // Sorted by name; a saved language outside the built-in list still shows.
    const languages = useMemo(
        () => [...new Set([...DICTATION_LANGUAGES, settings.lang].filter(Boolean))]
            .map((code) => ({ code, name: languageName(code, displayIn) }))
            .sort((a, b) => a.name.localeCompare(b.name)),
        [settings.lang, displayIn],
    );

    // Device names only appear once the microphone has been allowed; until then they are numbered.
    const loadDevices = async () => {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            setDevices(all.filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default" && d.deviceId !== "communications"));
        } catch {
            setDevices([]);
        }
    };

    const currentLanguage = settings.lang ? languageName(settings.lang, displayIn) : `Auto · ${languageName(autoLang, displayIn)}`;

    const chosenDeviceMissing = !!settings.deviceId && devices.length > 0 && !devices.some((d) => d.deviceId === settings.deviceId);

    return (
        <div
            className={cn(
                "flex items-center rounded-md transition-colors",
                active && "bg-accent/15",
            )}
        >
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={onToggle}
                        aria-pressed={active}
                        aria-label={active ? "Stop dictation" : "Dictate"}
                        className={cn(
                            "text-muted-foreground hover:text-foreground",
                            active && "bg-accent text-accent-foreground hover:bg-accent/90 hover:text-accent-foreground",
                        )}
                    >
                        {status === "permission" ? <MicOff strokeWidth={1.75} /> : <Mic strokeWidth={1.75} />}
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top">{active ? "Stop dictation" : "Dictate"}</TooltipContent>
            </Tooltip>
            <DropdownMenu
                onOpenChange={(open) => {
                    if (!open) return;
                    setPage("main");
                    void loadDevices();
                }}
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                aria-label="Dictation options"
                                className="w-4 text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:text-foreground"
                            >
                                <ChevronDown className="size-3" strokeWidth={1.75} />
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="top">Dictation options</TooltipContent>
                </Tooltip>
                <DropdownMenuContent
                    side="top"
                    align="start"
                    sideOffset={6}
                    collisionPadding={8}
                    className="w-64 max-w-[calc(100vw-1rem)]"
                >
                    {page === "main" ? (
                        <>
                            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                                Microphone
                            </DropdownMenuLabel>
                            <DropdownMenuRadioGroup
                                value={chosenDeviceMissing || !settings.deviceId ? DEFAULT : settings.deviceId}
                                onValueChange={(deviceId) => onSettingsChange({ ...settings, deviceId: deviceId === DEFAULT ? "" : deviceId })}
                            >
                                <DropdownMenuRadioItem value={DEFAULT} className="text-[12.5px]">System default</DropdownMenuRadioItem>
                                {devices.map((device, i) => (
                                    <DropdownMenuRadioItem key={device.deviceId} value={device.deviceId} className="text-[12.5px]">
                                        <span className="truncate">{device.label || `Microphone ${i + 1}`}</span>
                                    </DropdownMenuRadioItem>
                                ))}
                            </DropdownMenuRadioGroup>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                                className="text-[12.5px]"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setPage("language");
                                }}
                            >
                                <span className="shrink-0">Language</span>
                                <span className="ml-auto min-w-0 truncate text-muted-foreground">{currentLanguage}</span>
                                <ChevronRight className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                            </DropdownMenuItem>
                            {active && (
                                <p className="px-2 pb-1 pt-1.5 text-[11px] leading-snug text-muted-foreground">
                                    Changes apply the next time you start dictating.
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            <DropdownMenuItem
                                className="text-[12.5px]"
                                onSelect={(e) => {
                                    e.preventDefault();
                                    setPage("main");
                                }}
                            >
                                <ChevronLeft className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                                <span>Language</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <div className="max-h-64 overflow-y-auto [scrollbar-width:thin]">
                                <DropdownMenuRadioGroup
                                    value={settings.lang || DEFAULT}
                                    onValueChange={(lang) => onSettingsChange({ ...settings, lang: lang === DEFAULT ? "" : lang })}
                                >
                                    <DropdownMenuRadioItem value={DEFAULT} className="text-[12.5px]">
                                        <span className="truncate">Auto · {languageName(autoLang, displayIn)}</span>
                                    </DropdownMenuRadioItem>
                                    {languages.map(({ code, name }) => (
                                        <DropdownMenuRadioItem key={code} value={code} className="text-[12.5px]">
                                            <span className="truncate">{name}</span>
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </div>
                        </>
                    )}
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
}
