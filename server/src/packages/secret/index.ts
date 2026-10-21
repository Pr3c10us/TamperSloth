export type PostgresCredentials = {
    user: string
    password: string
    db: string
    host: string
    port: number
    ssl: boolean
}

export type ModelProviderKeys = {
    anthropic: string
}

export default class AppSecrets {
    port: number;
    clientOrigins: string[]
    jwtExpires: number
    jwtSecret: string
    refreshJWTExpires: number
    refreshJWTSecret: string
    wsUrl: string
    postgresCredentials: PostgresCredentials
    googleAPIKey: string
    maxYoutubeLength: number
    maxVideoLength: number
    baseYoutubeApiUrl: string
    modelProviderKeys: ModelProviderKeys
    /** Chrome extension IDs allowed to call the API; empty allows any (development only). */
    extensionIds: string[]
    /** OAuth client IDs (type "Chrome extension") whose Google tokens may sign in. */
    googleExtensionClientIds: string[]

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
        this.wsUrl = this.getEnvironmentVariableOrFallback("WS_URL", "ws://localhost:1364");

        this.postgresCredentials = {
            user: this.getEnvironmentVariable("POSTGRES_USER"),
            password: this.getEnvironmentVariable("POSTGRES_PASSWORD"),
            db: this.getEnvironmentVariable("POSTGRES_DB"),
            host: this.getEnvironmentVariable("POSTGRES_HOST"),
            port: this.getEnvironmentVariableAsNumber("POSTGRES_PORT", 5432),
            ssl: this.getEnvironmentVariableAsBool("POSTGRES_SSL", false)
        }

        this.googleAPIKey = this.getEnvironmentVariable("GOOGLE_API_KEY")

        // Optional so the server boots without one: Sloth models answer 503 until it is set.
        this.modelProviderKeys = {
            anthropic: this.getEnvironmentVariableOrFallback("ANTHROPIC_API_KEY", ""),
        }
        this.extensionIds = this.getEnvironmentVariableOrFallback("EXTENSION_IDS", "")
            .split(",")
            .map(id => id.trim())
            .filter(id => id.length > 0)
        this.googleExtensionClientIds = this.getEnvironmentVariableOrFallback("GOOGLE_EXTENSION_CLIENT_ID", "")
            .split(",")
            .map(id => id.trim())
            .filter(id => id.length > 0)

        this.maxYoutubeLength = this.getEnvironmentVariableAsNumber("MAX_YOUTUBE_LENGTH", 3000)
        this.maxVideoLength = this.getEnvironmentVariableAsNumber("MAX_VIDEO_LENGTH", 120)
        this.baseYoutubeApiUrl = this.getEnvironmentVariableOrFallback("BASE_YOUTUBE_API_URL", "https://www.googleapis.com/youtube/v3/videos")
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