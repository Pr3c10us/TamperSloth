import type {ModelMaker} from "./provider";

type VertexApi = "anthropic" | "openapi" | "mistral";

export interface VertexPartnerModel {
    api: VertexApi;
    id: string;
    location: string;
    maker: ModelMaker;
}

export const VERTEX_PARTNER_MODELS: Record<string, VertexPartnerModel> = {
    "claude-fable-5-1": {api: "anthropic", id: "claude-fable-5-1", location: "global", maker: "anthropic"},
    "claude-opus-5-5": {api: "anthropic", id: "claude-opus-5-5", location: "global", maker: "anthropic"},
    "claude-sonnet-5-5": {api: "anthropic", id: "claude-sonnet-5-5", location: "global", maker: "anthropic"},
    "claude-haiku-5-5": {api: "anthropic", id: "claude-haiku-5-5", location: "global", maker: "anthropic"},
    "grok-4.7": {api: "openapi", id: "xai/grok-4.7", location: "global", maker: "grok"},
    "mistral-medium-3": {api: "mistral", id: "mistral-medium-3", location: "us-central1", maker: "mistral"},
    "mistral-small-3.1": {api: "mistral", id: "mistral-small-2503", location: "us-central1", maker: "mistral"},
    "codestral-2": {api: "mistral", id: "codestral-2", location: "us-central1", maker: "mistral"},
    "llama-4-maverick": {api: "openapi", id: "meta/llama-4-maverick-17b-128e-instruct-maas", location: "us-east5", maker: "meta"},
    "llama-4-scout": {api: "openapi", id: "meta/llama-4-scout-17b-16e-instruct-maas", location: "us-east5", maker: "meta"},
    "deepseek-v4.1-flash": {api: "openapi", id: "deepseek-ai/deepseek-v4.1-flash-maas", location: "global", maker: "deepseek"},
    "qwen3-coder-480b": {api: "openapi", id: "qwen/qwen3-coder-480b-a35b-instruct-maas", location: "global", maker: "qwen"},
    "qwen3-235b": {api: "openapi", id: "qwen/qwen3-235b-a22b-instruct-2507-maas", location: "global", maker: "qwen"},
    "qwen3-next-80b-thinking": {api: "openapi", id: "qwen/qwen3-next-80b-a3b-thinking-maas", location: "global", maker: "qwen"},
    "glm-5.2": {api: "openapi", id: "zai-org/glm-5.2-maas", location: "global", maker: "zai"},
    "gpt-oss-120b": {api: "openapi", id: "openai/gpt-oss-120b-maas", location: "global", maker: "openai"},
    "gpt-oss-20b": {api: "openapi", id: "openai/gpt-oss-20b-maas", location: "us-central1", maker: "openai"},
    "kimi-k2-thinking": {api: "openapi", id: "moonshotai/kimi-k2-thinking-maas", location: "global", maker: "kimi"},
    "minimax-m2": {api: "openapi", id: "minimaxai/minimax-m2-maas", location: "global", maker: "minimax"},
};

/** The wire protocol a Vertex model speaks: Gemini's own unless it is a partner or open model. */
export function vertexProtocol(modelId?: string): "gemini" | VertexApi {
    return (modelId && VERTEX_PARTNER_MODELS[modelId]?.api) || "gemini";
}
