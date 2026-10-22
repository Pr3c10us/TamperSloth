import {SQL} from "bun";
import type Redis from "ioredis";
import AppSecrets from "../../packages/secret";
import type UserRepository from "../domain/user/repository.ts";
import UserRepositoryPG from "./user";
import type {UsageRepository} from "../domain/usage";
import UsageRepositoryPG from "./usage";
import type {ModelProviders, RateLimiter} from "../domain/model/provider.ts";
import ModelProviderRegistry from "./llm";
import RedisRateLimiter from "./ratelimit/redis.ts";
import type {GoogleTokenVerifier} from "../domain/user/googleIdentity.ts";
import GoogleTokenVerifierHTTP from "./google";
import type {SpendLimitRepository} from "../domain/spend";
import SpendLimitRepositoryPG from "./spend";
import type {Mailer} from "../domain/mail";
import SMTPMailer from "./mail/smtp.ts";
import type {PaymentGateway, SubscriptionRepository} from "../domain/billing";
import PaddleGateway from "./paddle";
import SubscriptionRepositoryPG from "./billing";

export type AdapterParameters = {
    postgresClient: SQL
    redisClient: Redis
    appSecrets: AppSecrets
}

export default class Adapters {
    parameters: AdapterParameters
    userRepository: UserRepository
    usageRepository: UsageRepository
    modelProviders: ModelProviders
    rateLimiter: RateLimiter
    googleTokenVerifier: GoogleTokenVerifier
    spendLimitRepository: SpendLimitRepository
    mailer: Mailer
    paymentGateway: PaymentGateway
    subscriptionRepository: SubscriptionRepository

    constructor(parameters: AdapterParameters) {
        this.parameters = parameters
        this.userRepository = new UserRepositoryPG(parameters.postgresClient)
        this.usageRepository = new UsageRepositoryPG(parameters.postgresClient)
        this.modelProviders = new ModelProviderRegistry(parameters.appSecrets)
        this.rateLimiter = new RedisRateLimiter(parameters.redisClient)
        this.googleTokenVerifier = new GoogleTokenVerifierHTTP(parameters.appSecrets.googleExtensionClientIds)
        this.spendLimitRepository = new SpendLimitRepositoryPG(parameters.postgresClient)
        this.mailer = new SMTPMailer(parameters.appSecrets.smtpCredential)
        this.paymentGateway = new PaddleGateway(parameters.appSecrets.paddleCredentials)
        this.subscriptionRepository = new SubscriptionRepositoryPG(parameters.postgresClient)
    }
}
