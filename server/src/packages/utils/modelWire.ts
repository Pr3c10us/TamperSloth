import type {
    LanguageModelV4CallOptions,
    LanguageModelV4FunctionTool,
    LanguageModelV4Prompt,
    LanguageModelV4StreamPart,
    SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import {BadRequestError} from "../errors";
import type {Effort} from "../../internals/domain/model/provider.ts";

/**
 * The extension runs the AI SDK's LanguageModel interface against this server:
 * it posts LanguageModelV4CallOptions as JSON (bytes as base64) and reads back
 * LanguageModelV4StreamPart objects as NDJSON. Everything here treats the body
 * as untrusted: only fields that can't run up cost or reach other systems pass.
 */

const EFFORTS: Effort[] = ["low", "medium", "high", "max"]
const MAX_STOP_SEQUENCES = 4

const isRecord = (value: unknown): value is Record<string, any> =>
    typeof value === "object" && value !== null && !Array.isArray(value)

/** Keeps only the upstream vendor's namespace; drops cache TTLs, which bill at a higher write rate. */
function filterOptions(options: unknown, namespace: string): SharedV4ProviderOptions | undefined {
    if (!isRecord(options) || !isRecord(options[namespace])) return undefined
    const scoped = {...options[namespace]}
    if (isRecord(scoped.cacheControl)) scoped.cacheControl = {type: "ephemeral"}
    return {[namespace]: scoped}
}

function withOptions<T extends Record<string, any>>(part: T, namespace: string): T {
    const {providerOptions, ...rest} = part
    const filtered = filterOptions(providerOptions, namespace)
    return (filtered ? {...rest, providerOptions: filtered} : rest) as T
}

/** File bytes only: a URL or provider file reference would make the vendor fetch or read on our account. */
function checkFileData(data: unknown) {
    if (!isRecord(data) || !["data", "text"].includes(data.type)) {
        throw new BadRequestError("files must be sent inline")
    }
    if (data.type === "data" && typeof data.data !== "string") throw new BadRequestError("file data must be base64")
}

function sanitizePart(part: unknown, namespace: string): any {
    if (!isRecord(part) || typeof part.type !== "string") throw new BadRequestError("invalid message part")
    if (part.type === "file" || part.type === "reasoning-file") checkFileData(part.data)
    if (part.type === "tool-result" && isRecord(part.output) && part.output.type === "content" && Array.isArray(part.output.value)) {
        for (const item of part.output.value) {
            if (isRecord(item) && item.type === "file") checkFileData(item.data)
        }
    }
    return withOptions(part, namespace)
}

function sanitizePrompt(prompt: unknown, namespace: string): LanguageModelV4Prompt {
    if (!Array.isArray(prompt) || prompt.length === 0) throw new BadRequestError("prompt is required")
    return prompt.map(message => {
        if (!isRecord(message) || !["system", "user", "assistant", "tool"].includes(message.role)) {
            throw new BadRequestError("invalid message")
        }
        if (message.role === "system") {
            if (typeof message.content !== "string") throw new BadRequestError("invalid system message")
            return withOptions(message, namespace)
        }
        if (!Array.isArray(message.content)) throw new BadRequestError("invalid message content")
        return withOptions({...message, content: message.content.map(part => sanitizePart(part, namespace))}, namespace)
    }) as LanguageModelV4Prompt
}

function sanitizeTools(tools: unknown, namespace: string): LanguageModelV4FunctionTool[] | undefined {
    if (tools === undefined) return undefined
    if (!Array.isArray(tools)) throw new BadRequestError("tools must be an array")
    // Function tools only: provider-run tools (web search, code execution) bill per use.
    return tools.map(tool => {
        if (!isRecord(tool) || tool.type !== "function" || typeof tool.name !== "string" || !isRecord(tool.inputSchema)) {
            throw new BadRequestError("only function tools are supported")
        }
        return withOptions({
            type: "function",
            name: tool.name,
            description: typeof tool.description === "string" ? tool.description : undefined,
            inputSchema: tool.inputSchema,
            ...(Array.isArray(tool.inputExamples) && {inputExamples: tool.inputExamples}),
            ...(typeof tool.strict === "boolean" && {strict: tool.strict}),
            providerOptions: tool.providerOptions,
        }, namespace) as LanguageModelV4FunctionTool
    })
}

export type ModelRequest = {
    options: Omit<LanguageModelV4CallOptions, "abortSignal">
    effort: Effort
    /** Rough prompt size in tokens, for billing a request that ends before the provider reports usage. */
    estimatedInputTokens: number
}

export function parseModelRequest(body: unknown, namespace: string): ModelRequest {
    if (!isRecord(body) || !isRecord(body.options)) throw new BadRequestError("options are required")
    const raw = body.options
    const requestedEffort = raw.providerOptions?.tampersloth?.effort
    const effort: Effort = EFFORTS.includes(requestedEffort) ? requestedEffort : "medium"

    const options: ModelRequest["options"] = {
        prompt: sanitizePrompt(raw.prompt, namespace),
        // Left unset, the provider SDK asks for the model's own maximum.
        maxOutputTokens: Number.isInteger(raw.maxOutputTokens) && raw.maxOutputTokens > 0 ? raw.maxOutputTokens : undefined,
        tools: sanitizeTools(raw.tools, namespace),
        includeRawChunks: false,
    }
    if (isRecord(raw.toolChoice) && ["auto", "none", "required", "tool"].includes(raw.toolChoice.type)) {
        options.toolChoice = raw.toolChoice as LanguageModelV4CallOptions["toolChoice"]
    }
    if (Array.isArray(raw.stopSequences)) {
        options.stopSequences = raw.stopSequences.filter((s: unknown) => typeof s === "string").slice(0, MAX_STOP_SEQUENCES)
    }
    if (isRecord(raw.responseFormat) && (raw.responseFormat.type === "text" || raw.responseFormat.type === "json")) {
        options.responseFormat = raw.responseFormat as LanguageModelV4CallOptions["responseFormat"]
    }

    return {options, effort, estimatedInputTokens: estimateTokens(options)}
}

// Images bill at roughly this many tokens each; base64 length says nothing useful.
const TOKENS_PER_FILE = 1600

function estimateTokens(options: ModelRequest["options"]): number {
    let chars = JSON.stringify(options.tools ?? []).length
    let files = 0
    const visit = (value: unknown) => {
        if (typeof value === "string") chars += value.length
        else if (Array.isArray(value)) value.forEach(visit)
        else if (isRecord(value)) {
            if (value.type === "file" && isRecord(value.data) && value.data.type === "data") {
                files++
                return
            }
            Object.values(value).forEach(visit)
        }
    }
    visit(options.prompt)
    return Math.ceil(chars / 4) + files * TOKENS_PER_FILE
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")

/** One stream part as an NDJSON line, or null for parts the client never sees. */
export function encodeStreamPart(part: LanguageModelV4StreamPart, slothModelId: string): string | null {
    switch (part.type) {
        case "raw":
            return null
        case "response-metadata":
            // The client knows the model as its Sloth id, whatever serves it.
            return JSON.stringify({...part, modelId: slothModelId}) + "\n"
        case "error":
            return JSON.stringify({type: "error", error: {message: "The model stopped unexpectedly, try again"}}) + "\n"
        case "file":
        case "reasoning-file":
            if (part.data.type === "data" && part.data.data instanceof Uint8Array) {
                return JSON.stringify({...part, data: {type: "data", data: toBase64(part.data.data)}}) + "\n"
            }
            return JSON.stringify(part) + "\n"
        default:
            return JSON.stringify(part) + "\n"
    }
}
