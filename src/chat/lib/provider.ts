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

export const MODELPROVIDERS: ProviderConfig[] = [
    {
        id: "openai",
        name: "OpenAI",
        defaultModel: "gpt-5.5",
        models: ["gpt-5.5", "gpt-5.5-pro", "gpt-5.4-mini"],
        icon: "/openai.svg",
    },
    {
        id: "anthropic",
        name: "Anthropic",
        defaultModel: "claude-sonnet-4-6",
        models: ["claude-sonnet-4-6", "claude-haiku-4-5", "claude-opus-4-7"],
        icon: "/anthropic.svg",
    },
    {
        id: "google",
        name: "Google Gemini",
        defaultModel: "gemini-3.5-flash",
        models: ["gemini-3.1-pro-preview", "gemini-3.5-flash", "gemini-3.1-flash-lite"],
        icon: "/googlegemini.svg",
    },
    {
        id: "deepseek",
        name: "DeepSeek",
        defaultModel: "deepseek-v4-flash",
        models: ["deepseek-v4-pro","deepseek-v4-flash"],
        icon: "/deepseek.svg",
    },
];

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
