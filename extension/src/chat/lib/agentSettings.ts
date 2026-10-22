import type {UsageRecord} from "./efficiency";
import type {ApprovalMode} from "./actionScreen";
import {DEFAULT_THINKING_LEVEL, isThinkingLevel, type ThinkingLevel} from "./thinkingLevel";

export interface AgentSettings {
    maxSteps: number;
    tokenBudget: number;
    /** Thinking level a new chat starts with: the last one picked in any chat. */
    thinkingLevel: ThinkingLevel;
    /** Show the run's total input/output tokens under each reply. */
    showRunTokens: boolean;
    /** Show estimated tokens on each tool call. */
    showToolTokens: boolean;
    /**
     * "auto": actions run after automatic safety screening; only high-risk or
     * suspicious ones stop for approval. "ask": every action that changes
     * something waits for approval.
     */
    actionApproval: ApprovalMode;
    /** Most tabs one task may have open at once, besides the tab the chat started in. */
    maxTaskTabs: number;
}

const KEY = "ts_agent_settings";
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {maxSteps: 200, tokenBudget: 1000000, thinkingLevel: DEFAULT_THINKING_LEVEL,
    showRunTokens: false, showToolTokens: false, actionApproval: "auto", maxTaskTabs: 6};

export function runStopReason(settings: AgentSettings, steps: UsageRecord[], failure = ""): string {
    if (failure) return failure;
    // Provider totals already include cached input and reasoning output.
    const total = steps.reduce((sum, step) => sum + (step.input ?? 0) + (step.output ?? 0), 0);
    return settings.tokenBudget > 0 && total >= settings.tokenBudget
        ? `Reached the ${settings.tokenBudget.toLocaleString()}-token run budget.` : "";
}

/** A Sloth plan's run budget caps the user's own: whichever is lower applies (0 means no limit). */
export function withPlanRunBudget(settings: AgentSettings, planBudget: number | undefined): AgentSettings {
    if (!planBudget || planBudget <= 0) return settings;
    const tokenBudget = settings.tokenBudget > 0 ? Math.min(settings.tokenBudget, planBudget) : planBudget;
    return {...settings, tokenBudget};
}

/** Settings saved before thinking levels had a DeepSeek-only `reasoning` mode instead. */
type SavedAgentSettings = Partial<AgentSettings> & {reasoning?: "balanced" | "thorough"};

export function normalizeAgentSettings(value: SavedAgentSettings = {}): AgentSettings {
    return {
        maxSteps: Number.isFinite(value.maxSteps) ? Math.max(5, Math.min(200, Math.round(value.maxSteps!))) : 200,
        tokenBudget: Number.isFinite(value.tokenBudget) ? Math.max(0, Math.round(value.tokenBudget!)) : 1000000,
        thinkingLevel: isThinkingLevel(value.thinkingLevel) ? value.thinkingLevel
            : value.reasoning === "thorough" ? "max" : DEFAULT_THINKING_LEVEL,
        showRunTokens: value.showRunTokens === true,
        showToolTokens: value.showToolTokens === true,
        actionApproval: value.actionApproval === "ask" ? "ask" : "auto",
        maxTaskTabs: Number.isFinite(value.maxTaskTabs) ? Math.max(1, Math.min(20, Math.round(value.maxTaskTabs!))) : 6,
    };
}

export async function loadAgentSettings(): Promise<AgentSettings> {
    try {
        const value = typeof chrome !== "undefined" && chrome.storage?.local
            ? (await chrome.storage.local.get(KEY))[KEY]
            : JSON.parse(localStorage.getItem(KEY) ?? "{}");
        return normalizeAgentSettings(value ?? {});
    } catch { return {...DEFAULT_AGENT_SETTINGS}; }
}

export async function saveAgentSettings(settings: AgentSettings) {
    const value = normalizeAgentSettings(settings);
    if (typeof chrome !== "undefined" && chrome.storage?.local) await chrome.storage.local.set({[KEY]: value});
    else localStorage.setItem(KEY, JSON.stringify(value));
}

/** Remembers a level picked in a chat, so the next new chat starts with it. */
export async function saveLastThinkingLevel(thinkingLevel: ThinkingLevel) {
    await saveAgentSettings({...await loadAgentSettings(), thinkingLevel});
}

/** Calls back with fresh settings whenever they are saved from another page. */
export function onAgentSettingsChange(callback: (settings: AgentSettings) => void): () => void {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === "local" && changes[KEY]) callback(normalizeAgentSettings(changes[KEY].newValue ?? {}));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
