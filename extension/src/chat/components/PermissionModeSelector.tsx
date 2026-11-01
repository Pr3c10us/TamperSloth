import { useEffect, useState } from "react";
import { Check, ChevronUp, Hand, Zap, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
    DEFAULT_AGENT_SETTINGS,
    loadAgentSettings,
    onAgentSettingsChange,
    saveAgentSettings,
} from "../lib/agentSettings";
import type { ApprovalMode } from "../lib/actionScreen";

const MODES: { value: ApprovalMode; label: string; hint: string; icon: LucideIcon }[] = [
    { value: "ask", label: "Manual", hint: "Ask before editing or deleting anything", icon: Hand },
    { value: "auto", label: "Auto", hint: "Sloth handles permission decisions", icon: Zap },
];

/**
 * The composer's permission mode: the same setting as Settings → Safety, so a
 * change here applies everywhere, including to a run already in progress.
 */
export function PermissionModeSelector() {
    const [mode, setMode] = useState<ApprovalMode>(DEFAULT_AGENT_SETTINGS.actionApproval);

    useEffect(() => {
        void loadAgentSettings().then((s) => setMode(s.actionApproval));
        return onAgentSettingsChange((s) => setMode(s.actionApproval));
    }, []);

    const choose = async (actionApproval: ApprovalMode) => {
        setMode(actionApproval);
        try {
            await saveAgentSettings({ ...await loadAgentSettings(), actionApproval });
        } catch (error) {
            console.warn("[Tampersloth] Could not save the permission mode:", error);
        }
    };

    const current = MODES.find((m) => m.value === mode)!;
    const Icon = current.icon;
    return (
        <DropdownMenu>
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            aria-label={`Permissions: ${current.label}`}
                            className="gap-1 px-1.5 font-sans text-[12.5px] font-normal text-muted-foreground hover:bg-transparent hover:text-foreground aria-expanded:text-foreground"
                        >
                            <Icon className="size-3.5" strokeWidth={1.75} />
                            <span>{current.label}</span>
                            <ChevronUp className="size-3 text-muted-foreground" strokeWidth={1.5} />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">{current.hint}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
                side="top"
                align="end"
                sideOffset={6}
                collisionPadding={8}
                className="w-64 max-w-[calc(100vw-1rem)]"
            >
                <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                    Permissions
                </DropdownMenuLabel>
                {MODES.map((option) => {
                    const selected = option.value === mode;
                    return (
                        <DropdownMenuItem
                            key={option.value}
                            role="menuitemradio"
                            aria-checked={selected}
                            onSelect={() => void choose(option.value)}
                            className={cn("items-start gap-2.5 py-1.5", selected && "bg-muted/60")}
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium text-foreground">{option.label}</div>
                                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{option.hint}</div>
                            </div>
                            <Check className={cn("mt-0.5 size-3.5 shrink-0 text-accent", !selected && "invisible")} strokeWidth={2} />
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
