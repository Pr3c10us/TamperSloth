import type {RunMetrics, UsageRecord} from "./efficiency";

interface Rates {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite?: number;
    longContext?: Rates & {above: number};
}

// USD per million tokens, standard direct API rates checked 2026-10-11.
// https://developers.openai.com/api/docs/pricing
// https://platform.claude.com/docs/en/about-claude/pricing
// https://ai.google.dev/gemini-api/docs/pricing
// https://api-docs.deepseek.com/quick_start/pricing/
// https://platform.kimi.ai/docs/pricing/chat
// https://docs.x.ai/developers/models
// Estimates exclude taxes, account discounts/free tiers, cache storage and
// non-token charges. Anthropic uses the app's default five-minute cache writes.
// Vertex AI lists the same per-token rates as the Gemini API.
const GEMINI_RATES: Record<string, Rates> = {
    // Introductory rates; they double on 2026-12-01 (see estimateUsageCost).
    "gemini-4-argon": {input: 2, output: 10, cacheRead: .1},
    "gemini-3.8-flash": {input: .75, output: 3.75, cacheRead: .075},
    "gemini-3.6-flash": {input: .75, output: 3.75, cacheRead: .075},
    "gemini-3.5-flash-lite": {input: .3, output: 2.5, cacheRead: .03},
    "gemini-3.1-flash-lite": {input: .25, output: 1.5, cacheRead: .025},
    "gemini-3.1-pro-preview": {input: 2, output: 12, cacheRead: .2,
        longContext: {above: 200000, input: 4, output: 18, cacheRead: .4}},
    "gemini-3-flash-preview": {input: .5, output: 3, cacheRead: .05},
};

const MODEL_RATES: Record<string, Record<string, Rates>> = {
    openai: {
        "gpt-6.1-sol": {input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5,
            longContext: {above: 272000, input: 4, output: 15, cacheRead: .2, cacheWrite: 5}},
        "gpt-6-astra": {input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5,
            longContext: {above: 272000, input: 20, output: 75, cacheRead: 2, cacheWrite: 25}},
        "gpt-6-luna": {input: .1, output: .5, cacheRead: .01, cacheWrite: .125,
            longContext: {above: 272000, input: .2, output: .75, cacheRead: .02, cacheWrite: .25}},
    },
    anthropic: {
        "claude-opus-5-5": {input: 4, output: 20, cacheRead: .2, cacheWrite: 5},
        "claude-sonnet-5-5": {input: 2, output: 10, cacheRead: .1, cacheWrite: 2.5},
        "claude-haiku-5-5": {input: .1, output: .5, cacheRead: .01, cacheWrite: .125,
            longContext: {above: 100000, input: .5, output: 2.5, cacheRead: .05, cacheWrite: .625}},
        "claude-fable-5-1": {input: 10, output: 50, cacheRead: .25, cacheWrite: 12.5},
    },
    google: GEMINI_RATES,
    vertex: GEMINI_RATES,
    deepseek: {
        "deepseek-flash": {input: .3, output: 1.2, cacheRead: .006},
        "deepseek-v4-pro": {input: 1.32, output: 3.96, cacheRead: .044},
    },
    kimi: {
        "kimi-k3": {input: 3, output: 15, cacheRead: .3, cacheWrite: 3},
        "kimi-k2.7-code": {input: .95, output: 4, cacheRead: .19},
        "kimi-k2.6": {input: .95, output: 4, cacheRead: .16},
    },
    grok: {
        "grok-4.7": {input: 2, output: 6, cacheRead: .5,
            longContext: {above: 200000, input: 4, output: 12, cacheRead: 1}},
        "grok-4.3": {input: 1.25, output: 2.5, cacheRead: .2,
            longContext: {above: 200000, input: 2.5, output: 5, cacheRead: .4}},
    },
};

export interface EstimatedCost {
    input?: number;
    output?: number;
}

function validTokens(value: number | undefined): value is number {
    return value !== undefined && Number.isFinite(value) && value >= 0;
}

export function estimateUsageCost(providerId: string, modelId: string, usage: UsageRecord, timestamp: number): EstimatedCost | undefined {
    let rates = MODEL_RATES[providerId]?.[modelId];
    if (!rates || !Number.isFinite(timestamp)) return undefined;
    if (rates.longContext && (usage.input ?? 0) > rates.longContext.above) rates = rates.longContext;
    let multiplier = 1;
    if (providerId === "google" || providerId === "vertex") {
        const doublesFrom = modelId === "gemini-4-argon" ? Date.UTC(2026, 11, 1)
            : ["gemini-3.8-flash", "gemini-3.6-flash"].includes(modelId) ? Date.UTC(2027, 0, 1) : undefined;
        if (doublesFrom !== undefined && timestamp >= doublesFrom) multiplier = 2;
    }
    if (providerId === "deepseek") {
        const date = new Date(timestamp);
        const weekday = date.getUTCDay();
        const hour = date.getUTCHours();
        // Holiday exemptions are account billing details unavailable here;
        // the weekday peak schedule is an estimate on Chinese public holidays.
        const peak = weekday >= 1 && weekday <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
        multiplier = peak ? 1 : .5;
    }
    let input: number | undefined;
    if (validTokens(usage.input)) {
        const cacheRead = Math.min(usage.input, validTokens(usage.cacheRead) ? usage.cacheRead : 0);
        const cacheWrite = Math.min(usage.input - cacheRead, validTokens(usage.cacheWrite) ? usage.cacheWrite : 0);
        input = ((usage.input - cacheRead - cacheWrite) * rates.input
            + cacheRead * rates.cacheRead + cacheWrite * (rates.cacheWrite ?? rates.input)) / 1e6 * multiplier;
    }
    // Reasoning tokens are already included in output; never bill them twice.
    const output = validTokens(usage.output) ? usage.output * rates.output / 1e6 * multiplier : undefined;
    return {input, output};
}

export function estimateRunCost(metrics: RunMetrics): EstimatedCost | undefined {
    if (!metrics.providerId || !metrics.modelId || metrics.startedAt === undefined) return undefined;
    // Context tiers apply per API request, not to the sum of all agent steps.
    const records: (UsageRecord & {recordedAt?: number})[] = metrics.steps.length ? metrics.steps : metrics.total ? [metrics.total] : [];
    if (!records.length) return undefined;
    const costs = records.map(usage => estimateUsageCost(metrics.providerId!, metrics.modelId!, usage,
        usage.recordedAt ?? metrics.startedAt!));
    if (costs.some(cost => !cost)) return undefined;
    return {
        input: costs.every(cost => cost?.input !== undefined) ? costs.reduce((sum, cost) => sum + cost!.input!, 0) : undefined,
        output: costs.every(cost => cost?.output !== undefined) ? costs.reduce((sum, cost) => sum + cost!.output!, 0) : undefined,
    };
}

export function formatCost(cost: number | undefined): string {
    if (cost === undefined || !Number.isFinite(cost) || cost < 0) return "unavailable";
    if (cost > 0 && cost < .0001) return "<$0.0001";
    return `$${cost.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 4})}`;
}
