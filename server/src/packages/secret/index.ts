export type PostgresCredentials = {
    user: string
    password: string
    db: string
    host: string
    port: number
    ssl: boolean
}

export type RedisCredentials = {
    user: string
    password: string
    host: string
    port: number
    tls: boolean
}

export type ModelProviderKeys = {
    anthropic: string
}
export type SMTPCredentials = {
    fromAddress: string
    host: string
    port: number
    username: string
    password: string
}

export type RunTokenBudgets = Record<string, number>

export type PaddleEnvironment = "sandbox" | "production"

export type PaddleCredentials = {
    /** Empty until Paddle is set up; billing routes answer 503 until then. */
    apiKey: string
    webhookSecret: string
    environment: PaddleEnvironment
    /** Paddle price ids (pri_...) for the paid plans. */
    prices: { go: string, pro: string }
}

export default class AppSecrets {
    port: number;
    clientOrigins: string[]
    jwtExpires: number
    jwtSecret: string
    refreshJWTExpires: number
    refreshJWTSecret: string
    postgresCredentials: PostgresCredentials
    redisCredentials: RedisCredentials
    modelProviderKeys: ModelProviderKeys
    runTokenBudgets: RunTokenBudgets
    creditsPerUsd: number
    extensionIds: string[]
    googleExtensionClientIds: string[]
    smtpCredential: SMTPCredentials
    /** Where the global daily spend limit's alerts go. */
    spendAlertEmail: string
    paddleCredentials: PaddleCredentials
    /** Signs the short-lived token the extension hands to the pricing page. */
    billingTokenSecret: string

    constructor() {
        this.port = this.getEnvironmentVariableAsNumber("PORT", 5000);
        this.clientOrigins = this.getEnvironmentVariableOrFallback("CLIENT_ORIGIN", "localhost:3000")
            .split(",")
            .map(origin => origin.trim())
            .filter(origin => origin.length > 0)
        this.jwtExpires = this.getEnvironmentVariableAsNumber("JWT_EXPIRES", 604_800);
        this.jwtSecret = this.getEnvironmentVariable("JWT_SECRET");
        this.refreshJWTExpires = this.getEnvironmentVariableAsNumber("REFRESH_JWT_EXPIRES", 2592000);
        this.refreshJWTSecret = this.getEnvironmentVariable("REFRESH_JWT_SECRET");
        this.postgresCredentials = {
            user: this.getEnvironmentVariable("POSTGRES_USER"),
            password: this.getEnvironmentVariable("POSTGRES_PASSWORD"),
            db: this.getEnvironmentVariable("POSTGRES_DB"),
            host: this.getEnvironmentVariable("POSTGRES_HOST"),
            port: this.getEnvironmentVariableAsNumber("POSTGRES_PORT", 5432),
            ssl: this.getEnvironmentVariableAsBool("POSTGRES_SSL", false)
        }
        this.redisCredentials = {
            user: this.getEnvironmentVariableOrFallback("REDIS_USER", ""),
            password: this.getEnvironmentVariableOrFallback("REDIS_PASSWORD", ""),
            host: this.getEnvironmentVariable("REDIS_HOST"),
            port: this.getEnvironmentVariableAsNumber("REDIS_PORT", 6379),
            tls: this.getEnvironmentVariableAsBool("REDIS_TLS", false)
        }
        this.modelProviderKeys = {
            anthropic: this.getEnvironmentVariableOrFallback("ANTHROPIC_API_KEY", ""),
        }
        this.runTokenBudgets = {
            free: this.getEnvironmentVariableAsNumber("FREE_RUN_TOKEN_BUDGET", 500_000),
            go: this.getEnvironmentVariableAsNumber("GO_RUN_TOKEN_BUDGET", 2_000_000),
            pro: this.getEnvironmentVariableAsNumber("PRO_RUN_TOKEN_BUDGET", 0),
        }
        this.creditsPerUsd = this.getEnvironmentVariableAsNumber("CREDITS_PER_USD", 10)
        this.extensionIds = this.getEnvironmentVariable("EXTENSION_IDS")
            .split(",")
            .map(id => id.trim())
            .filter(id => id.length > 0)
        this.googleExtensionClientIds = this.getEnvironmentVariable("GOOGLE_EXTENSION_CLIENT_ID")
            .split(",")
            .map(id => id.trim())
            .filter(id => id.length > 0)
        this.smtpCredential = {
            fromAddress: this.getEnvironmentVariable("SMTP_FROM_ADDRESS"),
            host: this.getEnvironmentVariable("SMTP_HOST"),
            password: this.getEnvironmentVariable("SMTP_PASSWORD"),
            port: this.getEnvironmentVariableAsNumber("SMTP_PORT", 587),
            username: this.getEnvironmentVariable("SMTP_USERNAME")
        }
        this.spendAlertEmail = this.getEnvironmentVariableOrFallback("SPEND_ALERT_EMAIL", this.smtpCredential.fromAddress)
        const paddleEnvironment = this.getEnvironmentVariableOrFallback("PADDLE_ENV", "sandbox")
        if (paddleEnvironment !== "sandbox" && paddleEnvironment !== "production") {
            console.error(`Error: Environment variable "PADDLE_ENV" value "${paddleEnvironment}" must be "sandbox" or "production".`);
            process.exit(1)
        }
        this.paddleCredentials = {
            apiKey: this.getEnvironmentVariableOrFallback("PADDLE_API_KEY", ""),
            webhookSecret: this.getEnvironmentVariableOrFallback("PADDLE_WEBHOOK_SECRET", ""),
            environment: paddleEnvironment,
            prices: {
                go: this.getEnvironmentVariableOrFallback("PADDLE_PRICE_GO", ""),
                pro: this.getEnvironmentVariableOrFallback("PADDLE_PRICE_PRO", ""),
            },
        }
        this.billingTokenSecret = this.getEnvironmentVariable("BILLING_TOKEN_SECRET")

    }

    getEnvironmentVariable(key: string): string {
        let value = process.env[key]
        if (!value) {
            console.error(`Error: Environment variable "${key}" is not available.`);
            process.exit(1)
        }
        return value
    }


    getEnvironmentVariableOrFallback(key: string, fallback: string): string {
        let value = process.env[key]
        if (!value) {
            return fallback
        }
        return value
    }

    getEnvironmentVariableAsNumber(key: string, fallback: number): number {
        let value = process.env[key];
        if (!value) {
            return fallback;
        }

        const valueNumber = Number(value);
        if (isNaN(valueNumber) || !isFinite(valueNumber)) {
            console.error(`Error: Environment variable "${key}" value "${value}" is not a valid number.`);
            process.exit(1);
        }

        return valueNumber;
    }

    getEnvironmentVariableAsBool(key: string, fallback: boolean): boolean {
        let value = process.env[key];
        if (!value) {
            return fallback;
        }

        const valueLower = value.toLowerCase();
        if (valueLower !== 'true' && valueLower !== 'false') {
            console.error(`Error: Environment variable "${key}" value "${value}" is not a valid boolean. Use "true" or "false".`);
            process.exit(1);
        }

        return valueLower === 'true';
    }

}