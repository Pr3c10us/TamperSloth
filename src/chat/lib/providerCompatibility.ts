import type {ModelMessage} from "ai";
import type {ProviderId} from "./provider";

export function agentProviderOptions(providerId: ProviderId, reasoning: "balanced" | "thorough"): NonNullable<ModelMessage["providerOptions"]> {
    switch (providerId) {
        case "anthropic":
            return {anthropic: {thinking: {type: "adaptive"}}};
        case "openai":
            // Replay complete items instead of relying on persisted item references.
            // Explicit include also covers new model IDs unknown to this SDK.
            return {openai: {store: false, include: ["reasoning.encrypted_content"]}};
        case "deepseek":
            return {deepseek: {thinking: {type: "enabled"}, reasoningEffort: reasoning === "thorough" ? "max" : "high"}};
        case "google":
            return {};
    }
}

