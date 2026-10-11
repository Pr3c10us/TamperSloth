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

// Chat/tool-use model IDs verified 2026-10-11 against the official catalogs below.
// Superseded entries are dropped — a saved selection that no longer appears
// here falls back to the provider's defaultModel (see ModelSelector).
export const MODELPROVIDERS: ProviderConfig[] = [
    {
        id: "openai",
        name: "OpenAI",
        // https://developers.openai.com/api/docs/models
        defaultModel: "gpt-6.1-sol",
        models: ["gpt-6.1-sol", "gpt-6-astra", "gpt-6-luna"],
        icon: "/openai.svg",
    },
    {
        id: "anthropic",
        name: "Anthropic",
        // https://platform.claude.com/docs/en/models/overview
        defaultModel: "claude-opus-5-5",
        models: [
            "claude-opus-5-5",
            "claude-sonnet-5-5",
            "claude-haiku-5-5",
            "claude-fable-5-1",
        ],
        icon: "/anthropic.svg",
    },
    {
        id: "google",
        name: "Google Gemini",
        // https://ai.google.dev/gemini-api/docs/models
        defaultModel: "gemini-3.8-flash",
        models: [
            "gemini-3.8-flash",
            "gemini-3.6-flash",
            "gemini-3.5-flash-lite",
            "gemini-3.1-flash-lite",
            "gemini-3.1-pro-preview",
            "gemini-3-flash-preview",
        ],
        icon: "/googlegemini.svg",
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        // https://api-docs.deepseek.com/quick_start/pricing/
        defaultModel: "deepseek-flash",
        // Flash (V4.1) supports vision, including takeScreenshot output; Pro is text-only.
        models: ["deepseek-flash", "deepseek-v4-pro"],
        icon: "/deepseek.svg",
    },
];

/** True when `modelId` is in this provider's current picker catalog. */
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
