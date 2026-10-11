import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createDeepSeek } from '@ai-sdk/deepseek';
import type { LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic" | "google" | "deepseek" ;

export interface ProviderConfig {
    id: ProviderId;
    name: string;
    defaultModel: string;
    models: string[];
    icon: string;
}

// Model IDs verified 2026-08-22 against each provider's own docs. Retired IDs
// are dropped rather than kept as aliases — a saved selection that no longer
// appears here falls back to the provider's defaultModel (see ModelSelector).
export const MODELPROVIDERS: ProviderConfig[] = [
    {
        id: "openai",
        name: "OpenAI",
        defaultModel: "gpt-5.6-sol",
        models: ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5-pro", "gpt-5.4-mini"],
        icon: "/openai.svg",
    },
    {
        id: "anthropic",
        name: "Anthropic",
        defaultModel: "claude-opus-5",
        models: ["claude-opus-5", "claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8", "claude-fable-5"],
        icon: "/anthropic.svg",
    },
    {
        id: "google",
        name: "Google Gemini",
        defaultModel: "gemini-3.7-flash",
        models: ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-3.1-pro-preview"],
        icon: "/googlegemini.svg",
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        defaultModel: "deepseek-v4-flash",
        // vision-exp is the only DeepSeek model that can read takeScreenshot output.
        models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-v4-flash-vision-exp"],
        icon: "/deepseek.svg",
    },
];

/** True when `modelId` is still offered by that provider. */
export function isKnownModel(providerId: ProviderId, modelId: string): boolean {
    const config = MODELPROVIDERS.find((p) => p.id === providerId);
    return !!config?.models.includes(modelId);
}

export function getModel(providerId: ProviderId, apiKey: string, modelId?: string): LanguageModel {
    const config = MODELPROVIDERS.find((p) => p.id === providerId)!;
    const model = modelId ?? config.defaultModel;

    switch (providerId) {
        case "openai": {
            const openai = createOpenAI({ apiKey });
            return openai(model);
        }
        case "anthropic": {
            const anthropic = createAnthropic({
                apiKey,
                headers: { "anthropic-dangerous-direct-browser-access": "true" },
            });
            return anthropic(model);
        }
        case "google": {
            const google = createGoogleGenerativeAI({ apiKey });
            return google(model);
        }
        case "deepseek": {
            const deepseek =createDeepSeek({apiKey})
            return deepseek(model)
        }
    }
}
