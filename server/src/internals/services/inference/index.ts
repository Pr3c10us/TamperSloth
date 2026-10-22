import type Adapters from "../../adapters";
import StreamModel from "./commands/streamModel.ts";
import GetAccount from "./query/getAccount.ts";

export class Commands {
    streamModel: StreamModel

    constructor(adapters: Adapters) {
        this.streamModel = new StreamModel(adapters.modelProviders, adapters.usageRepository, adapters.rateLimiter,
            adapters.parameters.appSecrets.runTokenBudgets, adapters.parameters.appSecrets.creditsPerUsd)
    }
}

export class Queries {
    getAccount: GetAccount

    constructor(adapters: Adapters) {
        this.getAccount = new GetAccount(adapters.usageRepository, adapters.parameters.appSecrets.runTokenBudgets,
            adapters.parameters.appSecrets.creditsPerUsd)
    }
}

export default class InferenceService {
    commands: Commands
    queries: Queries

    constructor(adapters: Adapters) {
        this.commands = new Commands(adapters)
        this.queries = new Queries(adapters)
    }
}
