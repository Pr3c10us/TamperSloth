/** USD per million tokens. */
export type Rates = {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    /** Higher rates for a request whose input is above `above` tokens. */
    longContext?: Omit<Rates, "longContext"> & { above: number }
}

/** The provider model a Sloth model is served by. Swapping it changes nothing the extension sees. */
export type ModelTarget = {
    provider: string
    modelId: string
    /** Shown to users as "Powered by …". */
    label: string
}

export type SlothModel = {
    id: string
    name: string
    tagline: string
    target: ModelTarget
    /** What users are charged, against their plan's monthly credit. */
    rates: Rates
    contextWindow: number
    /**
     * The most the target can write in one request. Nothing here limits a reply to it:
     * it prices the credit set aside while a request runs.
     */
    providerMaxOutputTokens: number
}

// Rates match the target's first-party API pricing (checked 2026-10-21), with
// cache writes at the five-minute rate the extension uses.
export const SLOTH_MODELS: SlothModel[] = [
    {
        id: "sloth-mini",
        name: "Sloth Mini",
        tagline: "Quick and light for everyday browsing",
        target: {provider: "anthropic", modelId: "claude-haiku-5-5", label: "Claude Haiku"},
        rates: {
            input: .1, output: .5, cacheRead: .01, cacheWrite: .125,
            longContext: {above: 100_000, input: .5, output: 2.5, cacheRead: .05, cacheWrite: .625},
        },
        contextWindow: 1_000_000,
        providerMaxOutputTokens: 128_000,
    },
    {
        id: "sloth-pro",
        name: "Sloth Pro",
        tagline: "Superior performance for most tasks",
        target: {provider: "anthropic", modelId: "claude-sonnet-5-5", label: "Claude Sonnet"},
        rates: {input: 2, output: 10, cacheRead: .2, cacheWrite: 2.5},
        contextWindow: 1_000_000,
        providerMaxOutputTokens: 128_000,
    },
    {
        id: "sloth-max",
        name: "Sloth Max",
        tagline: "Deepest reasoning for long, tricky jobs",
        target: {provider: "anthropic", modelId: "claude-opus-5-5", label: "Claude Opus"},
        rates: {input: 4, output: 20, cacheRead: .2, cacheWrite: 5},
        contextWindow: 1_000_000,
        providerMaxOutputTokens: 128_000,
    },
]

export function findSlothModel(id: string): SlothModel | undefined {
    return SLOTH_MODELS.find(model => model.id === id)
}

export type TokenUsage = {
    /** All input tokens, cached or not. */
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
}

/** Cost in millionths of a dollar. Integer so monthly sums never drift. */
export function costMicros(rates: Rates, usage: TokenUsage): number {
    const r = rates.longContext && usage.input > rates.longContext.above ? rates.longContext : rates
    const cacheRead = Math.min(usage.input, usage.cacheRead)
    const cacheWrite = Math.min(usage.input - cacheRead, usage.cacheWrite)
    const fresh = usage.input - cacheRead - cacheWrite
    // Rates are per million tokens, so tokens × rate is already in micro-dollars.
    return Math.ceil(fresh * r.input + cacheRead * r.cacheRead + cacheWrite * r.cacheWrite + usage.output * r.output)
}
