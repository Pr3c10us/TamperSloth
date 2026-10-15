import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createDeepSeek } from '@ai-sdk/deepseek';
// The edge entry has no Node dependencies, so it bundles for the extension.
import { createVertex } from "@ai-sdk/google-vertex/edge";
import type { LanguageModel } from "ai";

export type ProviderId = "openai" | "anthropic" | "google" | "vertex" | "deepseek" ;

export interface ProviderConfig {
    id: ProviderId;
    name: string;
    defaultModel: string;
    models: string[];
    icon: string;
}

// Gemini API and Vertex AI serve the same model IDs.
const GEMINI_MODELS = [
    "gemini-4-argon",
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.1-pro-preview",
    "gemini-3-flash-preview",
];

// Chat/tool-use model IDs verified 2026-10-15 against the official catalogs below.
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
        models: GEMINI_MODELS,
        icon: "/googlegemini.svg",
    },
    {
        id: "vertex",
        name: "Google Vertex AI",
        // https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/model-versions
        defaultModel: "gemini-3.8-flash",
        models: GEMINI_MODELS,
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

const MODEL_WORDS: Record<string, string> = {gpt: "GPT", deepseek: "DeepSeek"};

/** Human-readable model name: "claude-opus-5-5" → "Claude Opus 5.5", "gpt-6.1-sol" → "GPT 6.1 Sol". */
export function formatModelName(modelId: string): string {
    const parts: string[] = [];
    for (const part of modelId.split("-")) {
        // Consecutive numeric segments are a dashed version number ("5-5" → "5.5").
        if (/^\d+$/.test(part) && /^\d+(\.\d+)*$/.test(parts.at(-1) ?? "")) {
            parts[parts.length - 1] += `.${part}`;
        } else {
            parts.push(part);
        }
    }
    return parts
        .map((w) => MODEL_WORDS[w] ?? (/^v\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
}

/** True when `modelId` is in this provider's current picker catalog. */
export function isKnownModel(providerId: ProviderId, modelId: string): boolean {
    const config = MODELPROVIDERS.find((p) => p.id === providerId);
    return !!config?.models.includes(modelId);
}

// The bare express endpoint serves from the key's regional default (europe-west1
// for some accounts), where these models don't exist. They need the project-scoped
// `global` location instead.
const VERTEX_GLOBAL_ONLY = new Set(["gemini-4-argon"]);

export interface ModelOptions {
    /** Vertex project ID or number; required for models in VERTEX_GLOBAL_ONLY. */
    vertexProject?: string;
}

export function getModel(providerId: ProviderId, apiKey: string, modelId?: string, transport?: typeof fetch, options: ModelOptions = {}): LanguageModel {
    const config = MODELPROVIDERS.find((p) => p.id === providerId)!;
    const model = modelId ?? config.defaultModel;

    switch (providerId) {
        case "openai": {
            const openai = createOpenAI({ apiKey, fetch: transport });
            return openai(model);
        }
        case "anthropic": {
            const anthropic = createAnthropic({
                apiKey,
                fetch: transport,
                headers: { "anthropic-dangerous-direct-browser-access": "true" },
            });
            return anthropic(model);
        }
        case "google": {
            const google = createGoogle({ apiKey, fetch: transport });
            return google(model);
        }
        case "vertex": {
            // Express mode: a Vertex API key needs no project, location or OAuth.
            let baseURL: string | undefined;
            if (VERTEX_GLOBAL_ONLY.has(model)) {
                const project = options.vertexProject?.trim();
                if (!project) {
                    throw new Error(`${formatModelName(model)} on Vertex AI needs a Project ID.`);
                }
                baseURL = `https://aiplatform.googleapis.com/v1beta1/projects/${encodeURIComponent(project)}/locations/global/publishers/google`;
            }
            const vertex = createVertex({ apiKey, fetch: transport, baseURL });
            return vertex(model);
        }
        case "deepseek": {
            const deepseek =createDeepSeek({apiKey, fetch: transport})
            return deepseek(model)
        }
    }
}
