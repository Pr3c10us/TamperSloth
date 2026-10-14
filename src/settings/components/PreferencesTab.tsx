import {useEffect, useRef, useState, type ReactNode} from "react";
import {Check, Monitor, Moon, Sun, type LucideIcon} from "lucide-react";
import {Input} from "@/components/ui/input";
import {Slider} from "@/components/ui/slider";
import {Switch} from "@/components/ui/switch";
import {cn} from "@/lib/utils";
import {DEFAULT_AGENT_SETTINGS, loadAgentSettings, saveAgentSettings, type AgentSettings} from "@/src/chat/lib/agentSettings";
import {saveThemePreference, useThemePreference, type ThemePreference} from "../lib/theme";
import {SettingRow, SettingsGroup, SettingsSection, TabIntro} from "./Section";

const BUDGET_PRESETS = [
    {value: 100_000, label: "100k"},
    {value: 250_000, label: "250k"},
    {value: 500_000, label: "500k"},
    {value: 1_000_000, label: "1M"},
    {value: 0, label: "No limit"},
];

const REASONING_OPTIONS: {value: AgentSettings["reasoning"]; label: string; hint: string}[] = [
    {value: "balanced", label: "Balanced", hint: "Lower effort, faster replies."},
    {value: "thorough", label: "Thorough", hint: "Maximum effort on every step."},
];

const THEME_OPTIONS: {value: ThemePreference; label: string; icon: LucideIcon}[] = [
    {value: "dark", label: "Dark", icon: Moon},
    {value: "light", label: "Light", icon: Sun},
    {value: "system", label: "System", icon: Monitor},
];

type SaveState = "idle" | "saved" | "error";

/** Pill-style single choice. Used for presets and the reasoning mode. */
function Choice({selected, disabled, onSelect, children}: {
    selected: boolean; disabled?: boolean; onSelect: () => void; children: ReactNode;
}) {
    return (
        <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
            className={cn("h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors duration-[160ms] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
                selected ? "bg-background text-foreground shadow-sm dark:bg-input/40" : "text-muted-foreground hover:text-foreground")}>
            {children}
        </button>
    );
}

export function PreferencesTab() {
    const theme = useThemePreference();
    const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
    const [ready, setReady] = useState(false);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    // While the budget field is focused it shows raw digits; otherwise a formatted number.
    const [budgetDraft, setBudgetDraft] = useState<string | null>(null);
    const latest = useRef(settings);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => { let active = true; void loadAgentSettings().then(value => {
        if (active) { latest.current = value; setSettings(value); setReady(true); }
    }); return () => { active = false; }; }, []);

    const persist = async () => {
        timer.current = null;
        try { await saveAgentSettings(latest.current); setSaveState("saved"); }
        catch { setSaveState("error"); }
    };

    // Flush a pending save if the page closes mid-debounce.
    useEffect(() => () => { if (timer.current) { clearTimeout(timer.current); void persist(); } }, []);

    const update = (patch: Partial<AgentSettings>) => {
        const next = {...latest.current, ...patch};
        latest.current = next;
        setSettings(next);
        setSaveState("idle");
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { void persist(); }, 400);
    };

    const budgetText = budgetDraft ?? (settings.tokenBudget > 0 ? settings.tokenBudget.toLocaleString() : "");

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <TabIntro title={<>How hard should it <em>work?</em></>}>
                    Limits and display options for the agent. Changes save automatically.
                </TabIntro>
                <p role="status" aria-live="polite" className={cn("flex h-4 items-center gap-1 px-0.5 font-mono text-[11px] transition-opacity duration-300",
                    saveState === "idle" ? "opacity-0" : "opacity-100",
                    saveState === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {saveState === "saved" && <><Check strokeWidth={2} className="size-3 text-accent" /> Saved · applies to the next run</>}
                    {saveState === "error" && "Couldn't save preferences. Try again."}
                </p>
            </div>

            <SettingsSection title="Appearance">
                <SettingsGroup>
                    <SettingRow stacked label="Theme"
                        description={theme === "system" ? "Follows your system setting." : "Applies to the panel and settings."}>
                        <div role="radiogroup" aria-label="Theme" className="grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-[3px]">
                            {THEME_OPTIONS.map(({value, label, icon: Icon}) => (
                                <Choice key={value} selected={theme === value}
                                    onSelect={() => { void saveThemePreference(value).catch(() => setSaveState("error")); }}>
                                    <span className="inline-flex items-center justify-center gap-1.5">
                                        <Icon strokeWidth={1.75} className="size-3.5" />{label}
                                    </span>
                                </Choice>
                            ))}
                        </div>
                    </SettingRow>
                </SettingsGroup>
            </SettingsSection>

            <SettingsSection title="Run limits">
                <SettingsGroup>
                    <SettingRow stacked label="Maximum steps"
                        description="A step is one model response and its tool calls.">
                        <div className="flex items-center gap-3">
                            <Slider id="maxSteps" aria-label="Maximum steps" min={5} max={200} step={5} disabled={!ready}
                                value={[settings.maxSteps]} onValueChange={([value]) => update({maxSteps: value})} />
                            <span className="w-9 shrink-0 text-right font-mono text-[13px] tabular-nums">{settings.maxSteps}</span>
                        </div>
                    </SettingRow>

                    <SettingRow stacked label="Token budget per run" htmlFor="tokenBudget"
                        description="Input and output across all steps, including cached input. Checked after each step, so the last one can run over. Continue stopped work with another message.">
                        <div className="flex flex-col gap-2">
                            <div className="relative">
                                <Input id="tokenBudget" inputMode="numeric" autoComplete="off" disabled={!ready}
                                    placeholder="No limit" value={budgetText}
                                    className="h-9 bg-background pr-16 font-mono text-[13px] tabular-nums"
                                    onFocus={() => setBudgetDraft(settings.tokenBudget > 0 ? String(settings.tokenBudget) : "")}
                                    onBlur={() => setBudgetDraft(null)}
                                    onChange={e => {
                                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                                        setBudgetDraft(digits);
                                        update({tokenBudget: Number(digits || 0)});
                                    }} />
                                <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-[12px] text-muted-foreground">
                                    tokens
                                </span>
                            </div>
                            <div role="radiogroup" aria-label="Token budget presets" className="flex flex-wrap gap-0.5 self-start rounded-lg bg-muted p-[3px]">
                                {BUDGET_PRESETS.map(preset => (
                                    <Choice key={preset.value} disabled={!ready} selected={settings.tokenBudget === preset.value}
                                        onSelect={() => { setBudgetDraft(null); update({tokenBudget: preset.value}); }}>
                                        {preset.label}
                                    </Choice>
                                ))}
                            </div>
                        </div>
                    </SettingRow>
                </SettingsGroup>
            </SettingsSection>

            <SettingsSection title="Reasoning">
                <SettingsGroup>
                    <SettingRow stacked label="DeepSeek reasoning"
                        description={`${REASONING_OPTIONS.find(o => o.value === settings.reasoning)!.hint} Other providers keep their own settings.`}>
                        <div role="radiogroup" aria-label="DeepSeek reasoning" className="grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-[3px]">
                            {REASONING_OPTIONS.map(option => (
                                <Choice key={option.value} disabled={!ready} selected={settings.reasoning === option.value}
                                    onSelect={() => update({reasoning: option.value})}>
                                    {option.label}
                                </Choice>
                            ))}
                        </div>
                    </SettingRow>
                </SettingsGroup>
            </SettingsSection>

            <SettingsSection title="Display"
                description="Hiding usage doesn't change the token budget.">
                <SettingsGroup>
                    <SettingRow label="Run token usage" htmlFor="showRunTokens"
                        description="Input and output totals under each reply.">
                        <Switch id="showRunTokens" disabled={!ready} checked={settings.showRunTokens}
                            onCheckedChange={checked => update({showRunTokens: checked})} />
                    </SettingRow>
                    <SettingRow label="Tool token usage" htmlFor="showToolTokens"
                        description="Estimated tokens on each tool call.">
                        <Switch id="showToolTokens" disabled={!ready} checked={settings.showToolTokens}
                            onCheckedChange={checked => update({showToolTokens: checked})} />
                    </SettingRow>
                </SettingsGroup>
            </SettingsSection>
        </div>
    );
}
