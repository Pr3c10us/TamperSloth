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
import type {AlertThrottle, Mailer} from "../domain/mail";
import SMTPMailer from "./mail/smtp.ts";
import RedisAlertThrottle from "./mail/throttle.ts";
import type {PaymentGateway, SubscriptionRepository} from "../domain/billing";
import PaddleGateway from "./paddle";
import SubscriptionRepositoryPG from "./billing";
import type {CreditHolds} from "../domain/usage";
import RedisCreditHolds from "./credit/redis.ts";

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
    alertThrottle: AlertThrottle
    paymentGateway: PaymentGateway
    subscriptionRepository: SubscriptionRepository
    creditHolds: CreditHolds

    constructor(parameters: AdapterParameters) {
        this.parameters = parameters
        this.userRepository = new UserRepositoryPG(parameters.postgresClient)
        this.usageRepository = new UsageRepositoryPG(parameters.postgresClient)
        this.modelProviders = new ModelProviderRegistry(parameters.appSecrets)
        this.rateLimiter = new RedisRateLimiter(parameters.redisClient)
        this.googleTokenVerifier = new GoogleTokenVerifierHTTP(parameters.appSecrets.googleExtensionClientIds)
        this.spendLimitRepository = new SpendLimitRepositoryPG(parameters.postgresClient)
        this.mailer = new SMTPMailer(parameters.appSecrets.smtpCredential)
        this.alertThrottle = new RedisAlertThrottle(parameters.redisClient)
        this.paymentGateway = new PaddleGateway(parameters.appSecrets.paddleCredentials)
        this.subscriptionRepository = new SubscriptionRepositoryPG(parameters.postgresClient)
        this.creditHolds = new RedisCreditHolds(parameters.redisClient)
    }
}
