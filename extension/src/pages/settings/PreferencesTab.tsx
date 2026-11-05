import {useEffect, useRef, useState, type ReactNode} from "react";
import {Check, Monitor, Moon, Sun, type LucideIcon} from "lucide-react";
import {Input} from "@/ui/shadcn/input";
import {Slider} from "@/ui/shadcn/slider";
import {Switch} from "@/ui/shadcn/switch";
import {cn} from "@/ui/utils";
import {DEFAULT_AGENT_SETTINGS, loadAgentSettings, saveAgentSettings, type AgentSettings} from "@/agent/agentSettings";
import {THINKING_LEVELS} from "@/agent/models/thinkingLevel";
import {saveThemePreference, useThemePreference, type ThemePreference} from "@/ui/theme";
import {SettingRow, SettingsGroup, SettingsSection, TabIntro} from "./Section";
import {loadUserscriptPrefs, saveUserscriptPrefs, type UserscriptPrefs} from "@/userscripts/prefs";

const BUDGET_PRESETS = [
    {value: 100_000, label: "100k"},
    {value: 250_000, label: "250k"},
    {value: 500_000, label: "500k"},
    {value: 1_000_000, label: "1M"},
    {value: 0, label: "No limit"},
];

const APPROVAL_OPTIONS: {value: AgentSettings["actionApproval"]; label: string; hint: string}[] = [
    {value: "auto", label: "Automatically approve",
        hint: "Sloth checks each action for risk and for hidden instructions from web pages before running it. Lower-risk actions run; anything that looks unsafe is blocked or waits for you."},
    {value: "ask", label: "Ask before acting",
        hint: "Actions that save, send, submit, delete or run code wait for your approval; browsing and typing don't. One approval covers that action's follow-up steps on the same site, and you can allow the rest of a task at once."},
];

const THEME_OPTIONS: {value: ThemePreference; label: string; icon: LucideIcon}[] = [
    {value: "dark", label: "Dark", icon: Moon},
    {value: "light", label: "Light", icon: Sun},
    {value: "system", label: "System", icon: Monitor},
];

type SaveState = "idle" | "saved" | "error";

/** Pill-style single choice. Used for presets and the thinking level. */
function Choice({selected, disabled, onSelect, children}: {
    selected: boolean; disabled?: boolean; onSelect: () => void; children: ReactNode;
}) {
    return (
        <button type="button" role="radio" aria-checked={selected} disabled={disabled} onClick={onSelect}
            className={cn("h-7 whitespace-nowrap rounded-md px-2.5 text-[12px] font-medium transition-colors duration-[160ms] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
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
    const [userscriptPrefs, setUserscriptPrefs] = useState<UserscriptPrefs | null>(null);

    useEffect(() => { void loadUserscriptPrefs().then(setUserscriptPrefs); }, []);

    const updateUserscriptPrefs = (changes: Partial<UserscriptPrefs>) => {
        setUserscriptPrefs(current => current && {...current, ...changes});
        void saveUserscriptPrefs(changes);
    };

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

                    <SettingRow stacked label="Tabs per task"
                        description="Most tabs a task can have open at once, not counting the tab you started in. Sloth closes ones it no longer needs to open more.">
                        <div className="flex items-center gap-3">
                            <Slider id="maxTaskTabs" aria-label="Tabs per task" min={1} max={20} step={1} disabled={!ready}
                                value={[settings.maxTaskTabs]} onValueChange={([value]) => update({maxTaskTabs: value})} />
                            <span className="w-9 shrink-0 text-right font-mono text-[13px] tabular-nums">{settings.maxTaskTabs}</span>
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

            <SettingsSection title="Safety"
                description="Downloads, entering passwords or payment details, payments and deletions always ask first, in either mode. Page text that looks like instructions to an AI is flagged and never followed.">
                <SettingsGroup>
                    <SettingRow stacked label="Action approval"
                        description={APPROVAL_OPTIONS.find(o => o.value === settings.actionApproval)!.hint}>
                        <div role="radiogroup" aria-label="Action approval" className="flex gap-0.5 [&>*]:flex-1 rounded-lg bg-muted p-[3px]">
                            {APPROVAL_OPTIONS.map(option => (
                                <Choice key={option.value} disabled={!ready} selected={settings.actionApproval === option.value}
                                    onSelect={() => update({actionApproval: option.value})}>
                                    {option.label}
                                </Choice>
                            ))}
                        </div>
                    </SettingRow>
                </SettingsGroup>
            </SettingsSection>

            <SettingsSection title="Reasoning">
                <SettingsGroup>
                    <SettingRow stacked label="Default thinking level"
                        description={`${THINKING_LEVELS.find(o => o.value === settings.thinkingLevel)!.hint} New chats start here. Picking a level in a chat, beside the model picker, updates this too.`}>
                        <div role="radiogroup" aria-label="Default thinking level" className="grid grid-cols-4 gap-0.5 rounded-lg bg-muted p-[3px]">
                            {THINKING_LEVELS.map(option => (
                                <Choice key={option.value} disabled={!ready} selected={settings.thinkingLevel === option.value}
                                    onSelect={() => update({thinkingLevel: option.value})}>
                                    {option.label}
                                </Choice>
                            ))}
                        </div>
                    </SettingRow>
                </SettingsGroup>
            </SettingsSection>

            <SettingsSection title="Userscripts">
                <SettingsGroup>
                    <SettingRow label="Open .user.js links here" htmlFor="captureUserscriptLinks"
                        description="Show TamperSloth's install page for userscript links. Turn off if another manager should handle them.">
                        <Switch id="captureUserscriptLinks" disabled={!userscriptPrefs} checked={userscriptPrefs?.captureLinks ?? true}
                            onCheckedChange={checked => updateUserscriptPrefs({captureLinks: checked})} />
                    </SettingRow>
                    <SettingRow label="Update automatically" htmlFor="autoUpdateUserscripts"
                        description="Checks daily. A version asking for new permissions always waits for your review.">
                        <Switch id="autoUpdateUserscripts" disabled={!userscriptPrefs} checked={userscriptPrefs?.autoUpdate ?? true}
                            onCheckedChange={checked => updateUserscriptPrefs({autoUpdate: checked})} />
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
