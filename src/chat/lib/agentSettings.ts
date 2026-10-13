import type {UsageRecord} from "./efficiency";

export interface AgentSettings {
    maxSteps: number;
    tokenBudget: number;
    reasoning: "balanced" | "thorough";
    /** Show the run's total input/output tokens under each reply. */
    showRunTokens: boolean;
    /** Show estimated tokens on each tool call. */
    showToolTokens: boolean;
}

const KEY = "ts_agent_settings";
export const DEFAULT_AGENT_SETTINGS: AgentSettings = {maxSteps: 200, tokenBudget: 250000, reasoning: "balanced",
    showRunTokens: false, showToolTokens: false};

export function runStopReason(settings: AgentSettings, steps: UsageRecord[], failure = ""): string {
    if (failure) return failure;
    // Provider totals already include cached input and reasoning output.
    const total = steps.reduce((sum, step) => sum + (step.input ?? 0) + (step.output ?? 0), 0);
    return settings.tokenBudget > 0 && total >= settings.tokenBudget
        ? `Reached the ${settings.tokenBudget.toLocaleString()}-token run budget.` : "";
}

export function normalizeAgentSettings(value: Partial<AgentSettings> = {}): AgentSettings {
    return {
        maxSteps: Number.isFinite(value.maxSteps) ? Math.max(5, Math.min(200, Math.round(value.maxSteps!))) : 200,
        tokenBudget: Number.isFinite(value.tokenBudget) ? Math.max(0, Math.round(value.tokenBudget!)) : 250000,
        reasoning: value.reasoning === "thorough" ? "thorough" : "balanced",
        showRunTokens: value.showRunTokens === true,
        showToolTokens: value.showToolTokens === true,
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


/** Calls back with fresh settings whenever they are saved from another page. */
export function onAgentSettingsChange(callback: (settings: AgentSettings) => void): () => void {
    if (typeof chrome === "undefined" || !chrome.storage?.onChanged) return () => {};
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
        if (area === "local" && changes[KEY]) callback(normalizeAgentSettings(changes[KEY].newValue ?? {}));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
}
