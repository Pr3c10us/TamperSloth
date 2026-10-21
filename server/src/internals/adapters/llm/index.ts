import type AppSecrets from "../../../packages/secret";
import type {ModelProvider, ModelProviders} from "../../domain/model/provider.ts";
import AnthropicProvider from "./anthropic.ts";

export default class ModelProviderRegistry implements ModelProviders {
    private providers: Map<string, ModelProvider>

    constructor(appSecrets: AppSecrets) {
        const providers: ModelProvider[] = [
            new AnthropicProvider(appSecrets.modelProviderKeys.anthropic),
        ]
        this.providers = new Map(providers.map(provider => [provider.id, provider]))
        for (const provider of providers) {
            if (!provider.configured) console.warn(`Model provider "${provider.id}" has no API key; its Sloth models will answer 503.`)
        }
    }

    get(id: string) {
        return this.providers.get(id)
    }
}
