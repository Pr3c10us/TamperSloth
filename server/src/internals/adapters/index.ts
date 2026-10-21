import {SQL} from "bun";
import AppSecrets from "../../packages/secret";
import type UserRepository from "../domain/user/repository.ts";
import UserRepositoryPG from "./user";
import type {UsageRepository} from "../domain/usage";
import UsageRepositoryPG from "./usage";
import type {ModelProviders, RateLimiter} from "../domain/model/provider.ts";
import ModelProviderRegistry from "./llm";
import MemoryRateLimiter from "./ratelimit/memory.ts";
import type {GoogleTokenVerifier} from "../domain/user/googleIdentity.ts";
import GoogleTokenVerifierHTTP from "./google";

export type AdapterParameters = {
    postgresClient: SQL
    appSecrets: AppSecrets
}

export default class Adapters {
    parameters: AdapterParameters
    userRepository: UserRepository
    usageRepository: UsageRepository
    modelProviders: ModelProviders
    rateLimiter: RateLimiter
    googleTokenVerifier: GoogleTokenVerifier

    constructor(parameters: AdapterParameters) {
        this.parameters = parameters
        this.userRepository = new UserRepositoryPG(parameters.postgresClient)
        this.usageRepository = new UsageRepositoryPG(parameters.postgresClient)
        this.modelProviders = new ModelProviderRegistry(parameters.appSecrets)
        this.rateLimiter = new MemoryRateLimiter()
        this.googleTokenVerifier = new GoogleTokenVerifierHTTP(parameters.appSecrets.googleExtensionClientIds)
    }
}
