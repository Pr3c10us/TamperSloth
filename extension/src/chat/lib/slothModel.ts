import type {
    LanguageModelV4,
    LanguageModelV4CallOptions,
    LanguageModelV4Content,
    LanguageModelV4FinishReason,
    LanguageModelV4GenerateResult,
    LanguageModelV4StreamPart,
    LanguageModelV4StreamResult,
    LanguageModelV4Usage,
    SharedV4ProviderMetadata,
    SharedV4Warning,
} from "@ai-sdk/provider";
import {APICallError} from "ai";
import {accountFetch, SLOTH_API_URL} from "../../settings/lib/account";

/**
 * A Sloth model, served by the TamperSloth API. The server runs the same
 * LanguageModelV4 interface against whichever provider backs the model, so
 * this just ships call options up as JSON and reads stream parts back as
 * NDJSON. Billing, plan limits and the provider's key all live server-side.
 */

/** Names the agent run a request is a step of, so the server can hold each run to the plan's token budget. */
export const RUN_HEADER = "X-Sloth-Run";

/** The run id from call headers, which the SDK passes on lowercased. */
function runIdFrom(headers: Record<string, string | undefined> | undefined): string | undefined {
    return Object.entries(headers ?? {}).find(([name]) => name.toLowerCase() === RUN_HEADER.toLowerCase())?.[1];
}

function toBase64(bytes: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

/** JSON-safe copy: bytes become base64 (which every provider accepts) and URLs strings. */
function encode(value: unknown): unknown {
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        return toBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
    }
    if (value instanceof URL) return value.href;
    if (Array.isArray(value)) return value.map(encode);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)]));
    }
    return value;
}

function decodePart(part: any): LanguageModelV4StreamPart {
    if (part.type === "response-metadata" && typeof part.timestamp === "string") {
        return {...part, timestamp: new Date(part.timestamp)};
    }
    if (part.type === "error") {
        return {type: "error", error: new Error(part.error?.message ?? "The model stopped unexpectedly")};
    }
    return part;
}

function ndjson(): TransformStream<string, LanguageModelV4StreamPart> {
    let buffer = "";
    const emit = (line: string, controller: TransformStreamDefaultController<LanguageModelV4StreamPart>) => {
        if (line.trim()) controller.enqueue(decodePart(JSON.parse(line)));
    };
    return new TransformStream({
        transform(chunk, controller) {
            buffer += chunk;
            let newline: number;
            while ((newline = buffer.indexOf("\n")) >= 0) {
                emit(buffer.slice(0, newline), controller);
                buffer = buffer.slice(newline + 1);
            }
        },
        flush(controller) {
            emit(buffer, controller);
        },
    });
}

async function toApiError(response: Response, url: string, body: unknown): Promise<APICallError> {
    const text = await response.text().catch(() => "");
    let message = `TamperSloth answered ${response.status}`;
    try {
        const parsed = JSON.parse(text) as { message?: string };
        if (parsed.message) message = parsed.message;
    } catch { /* Not JSON: a proxy or network page. */ }
    return new APICallError({
        message,
        url,
        requestBodyValues: body,
        statusCode: response.status,
        responseHeaders: Object.fromEntries(response.headers),
        responseBody: text,
        isRetryable: response.status >= 500 && response.status !== 503,
    });
}

const EMPTY_USAGE: LanguageModelV4Usage = {
    inputTokens: {total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined},
    outputTokens: {total: undefined, text: undefined, reasoning: undefined},
};

function mergeMetadata(a: SharedV4ProviderMetadata | undefined, b: SharedV4ProviderMetadata | undefined) {
    if (!a) return b;
    if (!b) return a;
    const merged: SharedV4ProviderMetadata = {...a};
    for (const [key, value] of Object.entries(b)) merged[key] = {...merged[key], ...value};
    return merged;
}

export class SlothLanguageModel implements LanguageModelV4 {
    readonly specificationVersion = "v4";
    readonly provider = "tampersloth";
    // No URL passes through: the SDK downloads files, so the server only ever gets bytes.
    readonly supportedUrls = {};
    readonly modelId: string;
    private transport?: typeof fetch;

    constructor(modelId: string, transport?: typeof fetch) {
        this.modelId = modelId;
        this.transport = transport;
    }

    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
        const {abortSignal, headers, ...callOptions} = options;
        const path = `/api/v1/models/${encodeURIComponent(this.modelId)}/stream`;
        const runId = runIdFrom(headers);
        const response = await accountFetch(path, {
            method: "POST",
            headers: {"Content-Type": "application/json", ...(runId && {[RUN_HEADER]: runId})},
            body: JSON.stringify({options: encode(callOptions)}),
            signal: abortSignal,
        }, this.transport);
        if (!response.ok || !response.body) throw await toApiError(response, `${SLOTH_API_URL}${path}`, callOptions);
        return {
            stream: response.body.pipeThrough(new TextDecoderStream()).pipeThrough(ndjson()),
            request: {body: callOptions},
            response: {headers: Object.fromEntries(response.headers)},
        };
    }

    /** One-shot calls (titles, safety screening) read the same stream to its end. */
    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
        const {stream, request, response} = await this.doStream(options);
        const content: LanguageModelV4Content[] = [];
        const open = new Map<string, { type: "text" | "reasoning"; text: string; providerMetadata?: SharedV4ProviderMetadata }>();
        let usage = EMPTY_USAGE;
        let finishReason: LanguageModelV4FinishReason = {unified: "other", raw: undefined};
        let providerMetadata: SharedV4ProviderMetadata | undefined;
        let warnings: SharedV4Warning[] = [];
        let metadata: { id?: string; timestamp?: Date; modelId?: string } = {};

        const reader = stream.getReader();
        while (true) {
            const {done, value: part} = await reader.read();
            if (done) break;
            switch (part.type) {
                case "text-start":
                case "reasoning-start":
                    open.set(part.id, {type: part.type === "text-start" ? "text" : "reasoning", text: "", providerMetadata: part.providerMetadata});
                    break;
                case "text-delta":
                case "reasoning-delta": {
                    const block = open.get(part.id);
                    if (block) {
                        block.text += part.delta;
                        block.providerMetadata = mergeMetadata(block.providerMetadata, part.providerMetadata);
                    }
                    break;
                }
                case "text-end":
                case "reasoning-end": {
                    const block = open.get(part.id);
                    if (block) {
                        open.delete(part.id);
                        const blockMetadata = mergeMetadata(block.providerMetadata, part.providerMetadata);
                        content.push({type: block.type, text: block.text, ...(blockMetadata && {providerMetadata: blockMetadata})});
                    }
                    break;
                }
                case "tool-input-start":
                case "tool-input-delta":
                case "tool-input-end":
                case "raw":
                    break;
                case "stream-start":
                    warnings = part.warnings;
                    break;
                case "response-metadata":
                    metadata = {id: part.id, timestamp: part.timestamp, modelId: part.modelId};
                    break;
                case "finish":
                    usage = part.usage;
                    finishReason = part.finishReason;
                    providerMetadata = part.providerMetadata;
                    break;
                case "error":
                    throw part.error;
                default:
                    content.push(part);
            }
        }
        return {content, finishReason, usage, providerMetadata, warnings, request, response: {...metadata, ...response}};
    }
}
