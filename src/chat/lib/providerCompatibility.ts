import type {ModelMessage} from "ai";
import type {ProviderId} from "./provider";
import {THINKING_LEVELS, type ThinkingLevel} from "./thinkingLevel";

// The effort each level sends, verified 2026-10-17 against each provider's docs.
// A provider only offers the levels listed for it; see thinkingLevelsFor.
// - Anthropic output_config.effort: low…max on every current Claude model.
// - OpenAI reasoning.effort: low…max on every GPT-6 model.
// - xAI reasoning_effort: low, medium, high, xhigh (its top step).
// - DeepSeek and Kimi K3 reasoning_effort: low, high, max (no medium).
// - Gemini thinkingLevel: low, medium, high (nothing above high).
const EFFORT: Record<"anthropic" | "openai" | "grok" | "deepseek" | "kimi" | "gemini", Partial<Record<ThinkingLevel, string>>> = {
    anthropic: {low: "low", medium: "medium", high: "high", max: "max"},
    openai: {low: "low", medium: "medium", high: "high", max: "max"},
    grok: {low: "low", medium: "medium", high: "high", max: "xhigh"},
    deepseek: {low: "low", high: "high", max: "max"},
    kimi: {low: "low", high: "high", max: "max"},
    gemini: {low: "low", medium: "medium", high: "high"},
};

function effortTable(providerId: ProviderId, modelId?: string) {
    switch (providerId) {
        case "google":
        case "vertex":
            return EFFORT.gemini;
        // Only Kimi K3 takes an effort; K2.x models ignore it.
        case "kimi":
            return !modelId || modelId.startsWith("kimi-k3") ? EFFORT.kimi : {};
        default:
            return EFFORT[providerId];
    }
}

/** The levels this model offers, in order. Empty when its reasoning can't be tuned. */
export function thinkingLevelsFor(providerId: ProviderId, modelId?: string): ThinkingLevel[] {
    const table = effortTable(providerId, modelId);
    return THINKING_LEVELS.map(l => l.value).filter(level => level in table);
}

/** The offered level nearest the chosen one; ties go to the deeper level. */
export function resolveThinkingLevel(level: ThinkingLevel, providerId: ProviderId, modelId?: string): ThinkingLevel | undefined {
    const offered = thinkingLevelsFor(providerId, modelId);
    if (offered.includes(level)) return level;
    const order = THINKING_LEVELS.map(l => l.value);
    const target = order.indexOf(level);
    return offered.reduce<ThinkingLevel | undefined>((best, candidate) => {
        if (!best) return candidate;
        const distance = Math.abs(order.indexOf(candidate) - target);
        const bestDistance = Math.abs(order.indexOf(best) - target);
        return distance < bestDistance || (distance === bestDistance && order.indexOf(candidate) > order.indexOf(best)) ? candidate : best;
    }, undefined);
}

// Each option below also asks the provider for readable reasoning, which the
// chat renders as thinking blocks (see reasoning.ts). Without them Claude
// streams empty thinking, OpenAI only encrypted items and Gemini no thoughts.
export function agentProviderOptions(providerId: ProviderId, level: ThinkingLevel, modelId?: string): NonNullable<ModelMessage["providerOptions"]> {
    const resolved = resolveThinkingLevel(level, providerId, modelId);
    const effort = resolved && effortTable(providerId, modelId)[resolved];
    switch (providerId) {
        case "anthropic":
            // Current Claude models default to display "omitted" (empty thinking text).
            return {anthropic: {thinking: {type: "adaptive", display: "summarized"}, effort}};
        case "openai":
            // Replay complete items instead of relying on persisted item references.
            // Explicit include also covers new model IDs unknown to this SDK.
            return {openai: {store: false, include: ["reasoning.encrypted_content"], reasoningSummary: "auto",
                reasoningEffort: effort}};
        case "deepseek":
            return {deepseek: {thinking: {type: "enabled"}, reasoningEffort: effort}};
        case "kimi":
            // Kimi K3 always reasons.
            return {moonshotai: effort ? {reasoningEffort: effort} : {}};
        case "grok":
            // Replay complete reasoning items rather than stored response ids.
            return {xai: {store: false, include: ["reasoning.encrypted_content"], reasoningSummary: "auto",
                reasoningEffort: effort}};
        case "google":
            return {google: {thinkingConfig: {includeThoughts: true, thinkingLevel: effort}}};
        case "vertex":
            // The Vertex model reads options under "vertex"/"googleVertex", not "google".
            return {vertex: {thinkingConfig: {includeThoughts: true, thinkingLevel: effort}}};
    }
}
