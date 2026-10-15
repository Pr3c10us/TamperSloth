import type {ModelMessage} from "ai";
import type {ProviderId} from "./provider";

// Each option below also asks the provider for readable reasoning, which the
// chat renders as thinking blocks (see reasoning.ts). Without them Claude
// streams empty thinking, OpenAI only encrypted items and Gemini no thoughts.
export function agentProviderOptions(providerId: ProviderId, reasoning: "balanced" | "thorough"): NonNullable<ModelMessage["providerOptions"]> {
    switch (providerId) {
        case "anthropic":
            // Current Claude models default to display "omitted" (empty thinking text).
            return {anthropic: {thinking: {type: "adaptive", display: "summarized"}}};
        case "openai":
            // Replay complete items instead of relying on persisted item references.
            // Explicit include also covers new model IDs unknown to this SDK.
            return {openai: {store: false, include: ["reasoning.encrypted_content"], reasoningSummary: "auto"}};
        case "deepseek":
            return {deepseek: {thinking: {type: "enabled"}, reasoningEffort: reasoning === "thorough" ? "max" : "high"}};
        case "kimi":
            // Kimi K3 always reasons; the effort is ignored by older Kimi models.
            return {moonshotai: {reasoningEffort: reasoning === "thorough" ? "max" : "high"}};
        case "grok":
            // Replay complete reasoning items rather than stored response ids.
            return {xai: {store: false, include: ["reasoning.encrypted_content"], reasoningSummary: "auto",
                reasoningEffort: reasoning === "thorough" ? "xhigh" : "high"}};
        case "google":
            return {google: {thinkingConfig: {includeThoughts: true}}};
        case "vertex":
            // The Vertex model reads options under "vertex"/"googleVertex", not "google".
            return {vertex: {thinkingConfig: {includeThoughts: true}}};
    }
}
