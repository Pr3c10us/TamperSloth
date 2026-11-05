import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createMoonshotAI } from "@ai-sdk/moonshotai";
import { createXai } from "@ai-sdk/xai";
// The edge entry has no Node dependencies, so it bundles for the extension.
import { createVertex } from "@ai-sdk/google-vertex/edge";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic/edge";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { SlothLanguageModel } from "./slothModel";
import { VERTEX_PARTNER_MODELS, type VertexPartnerModel } from "./vertexModels";

export type ProviderId = "tampersloth" | "openai" | "anthropic" | "google" | "vertex" | "deepseek" | "kimi" | "grok";

/**
 * Who made a model. Brands that are also providers share their ID, so one logo
 * serves both; the rest are only ever served through an aggregator.
 */
export type ModelMaker = Exclude<ProviderId, "tampersloth" | "vertex"> | "gemma" | "mistral" | "meta" | "qwen" | "zai" | "minimax";

export const MODEL_MAKER_NAMES: Record<ModelMaker, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    google: "Google",
    gemma: "Google",
    deepseek: "DeepSeek",
    kimi: "Moonshot AI",
    grok: "xAI",
    mistral: "Mistral AI",
    meta: "Meta",
    qwen: "Qwen",
    zai: "Z.ai",
    minimax: "MiniMax",
};

export interface ProviderConfig {
    id: ProviderId;
    name: string;
    defaultModel: string;
    models: string[];
    icon: string;
    /** Set on aggregators, which serve other companies' models: who made each one. */
    makerOf?: (modelId: string) => ModelMaker;
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
        // Our own models, served by the TamperSloth API under the user's plan.
        // The server's account response adds pricing, plan access and "powered by".
        id: "tampersloth",
        name: "TamperSloth",
        defaultModel: "sloth-pro",
        models: ["sloth-mini", "sloth-pro", "sloth-max"],
        icon: "/icon.svg",
    },
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
        models: [...GEMINI_MODELS, ...Object.keys(VERTEX_PARTNER_MODELS)],
        icon: "/googlegemini.svg",
        makerOf: (modelId) => VERTEX_PARTNER_MODELS[modelId]?.maker ?? "google",
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
    {
        id: "kimi",
        name: "Kimi",
        // https://platform.kimi.ai/docs/pricing/chat
        defaultModel: "kimi-k3",
        models: ["kimi-k3", "kimi-k2.7-code", "kimi-k2.6"],
        icon: "/kimi.svg",
    },
    {
        id: "grok",
        name: "xAI Grok",
        // https://docs.x.ai/developers/models
        defaultModel: "grok-4.7",
        models: ["grok-4.7", "grok-4.3"],
        icon: "/grok.svg",
    },
];

const MODEL_WORDS: Record<string, string> = {gpt: "GPT", oss: "OSS", deepseek: "DeepSeek", glm: "GLM", minimax: "MiniMax"};

/** Human-readable model name: "claude-opus-5-5" → "Claude Opus 5.5", "llama-3.3-70b" → "Llama 3.3 70B". */
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
        .map((w) => MODEL_WORDS[w] ?? (/^v\d|^\d+b$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
        .join(" ");
}

/** Who made a model an aggregator serves; undefined when the provider made it. */
export function modelMaker(providerId: ProviderId, modelId: string): ModelMaker | undefined {
    return MODELPROVIDERS.find((p) => p.id === providerId)?.makerOf?.(modelId);
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
    /** Vertex project ID or number; required for VERTEX_GLOBAL_ONLY and VERTEX_PARTNER_MODELS. */
    vertexProject?: string;
}

function vertexProjectFor(model: string, options: ModelOptions): string {
    const project = options.vertexProject?.trim();
    if (!project) throw new Error(`${formatModelName(model)} on Vertex AI needs a Project ID.`);
    return encodeURIComponent(project);
}

// Partner and open models have no express-mode endpoint, so the key (bound to a
// service account in a standard project) goes to the project-scoped one instead.
function vertexPartnerModel(model: string, partner: VertexPartnerModel, apiKey: string,
                            transport: typeof fetch | undefined, options: ModelOptions): LanguageModel {
    const {location} = partner;
    const host = location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
    const base = `https://${host}/v1/projects/${vertexProjectFor(model, options)}/locations/${location}`;
    const headers = {"x-goog-api-key": apiKey};
    switch (partner.api) {
        case "anthropic": {
            // The edge provider always signs a bearer token; the key replaces it.
            const vertex = createVertexAnthropic({
                baseURL: `${base}/publishers/anthropic/models`,
                generateAuthToken: async () => "",
                headers: {...headers, Authorization: undefined},
                fetch: transport,
            });
            return vertex(partner.id);
        }
        case "openapi": {
            const vertex = createOpenAICompatible({
                name: "vertex.maas", baseURL: `${base}/endpoints/openapi`, headers, includeUsage: true, fetch: transport,
            });
            return vertex(partner.id);
        }
        case "mistral": {
            // Mistral takes Chat Completions bodies at its model's rawPredict methods.
            const modelURL = `${base}/publishers/mistralai/models/${partner.id}`;
            const send = transport ?? fetch;
            const vertex = createOpenAICompatible({
                name: "vertex.mistral", baseURL: modelURL, headers,
                fetch: (_url, init) => {
                    const stream = typeof init?.body === "string" && JSON.parse(init.body).stream === true;
                    return send(`${modelURL}:${stream ? "streamRawPredict" : "rawPredict"}`, init);
                },
            });
            return vertex(partner.id);
        }
    }
}

export function getModel(providerId: ProviderId, apiKey: string, modelId?: string, transport?: typeof fetch, options: ModelOptions = {}): LanguageModel {
    const config = MODELPROVIDERS.find((p) => p.id === providerId)!;
    const model = modelId ?? config.defaultModel;

    switch (providerId) {
        case "tampersloth":
            // Signs each request with the account session, not `apiKey`, so long runs survive a token refresh.
            return new SlothLanguageModel(model, transport);
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
            const partner = VERTEX_PARTNER_MODELS[model];
            if (partner) return vertexPartnerModel(model, partner, apiKey, transport, options);
            // Express mode: a Vertex API key needs no project, location or OAuth.
            let baseURL: string | undefined;
            if (VERTEX_GLOBAL_ONLY.has(model)) {
                baseURL = `https://aiplatform.googleapis.com/v1beta1/projects/${vertexProjectFor(model, options)}/locations/global/publishers/google`;
            }
            const vertex = createVertex({ apiKey, fetch: transport, baseURL });
            return vertex(model);
        }
        case "deepseek": {
            const deepseek =createDeepSeek({apiKey, fetch: transport})
            return deepseek(model)
        }
        case "kimi": {
            const moonshot = createMoonshotAI({ apiKey, fetch: transport });
            return moonshot(model);
        }
        case "grok": {
            const xai = createXai({ apiKey, fetch: transport });
            return xai(model);
        }
    }
}
