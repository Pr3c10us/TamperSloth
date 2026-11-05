import {z} from "zod";

export const REASON_MAX = 80;

/**
 * Every tool takes a model-written `reason`, shown as the call's title in chat.
 * The JSON schema marks it required so models reliably write it, but parsing
 * never rejects a call for it: a missing or overlong reason is a cosmetic gap,
 * not worth a failed tool step.
 */
export const reasonField = z.preprocess(
    value => typeof value === "string" ? value.trim().slice(0, REASON_MAX) : "",
    z.string().max(REASON_MAX),
).describe("What this call does and why, in 3-8 words; shown to the user as the step's one-line summary.");

/** Adds `reason` as the first property, so streaming models write it first. */
export function withReason<T extends z.ZodObject>(schema: T): z.ZodObject {
    const {reason: _reason, description: _legacy, ...shape} = schema.shape;
    const rebuilt = z.object({reason: reasonField, ...shape});
    const catchall = schema._zod.def.catchall;
    return catchall ? rebuilt.catchall(catchall) : rebuilt;
}

/** Drops UI-only fields before a call reaches its implementation or dedupe signature. */
export function stripReason(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== "object") return {};
    const {reason: _reason, description: _legacy, ...rest} = input as Record<string, unknown>;
    return rest;
}

/**
 * Reads `reason` out of a tool call's partially streamed JSON arguments, so the
 * title can appear while the rest of the input is still being written.
 */
export function partialReason(json: string): string | undefined {
    const match = json.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)("?)/);
    if (!match) return undefined;
    // Drop a dangling escape or half-written \u sequence before decoding.
    const body = match[2] ? match[1] : match[1].replace(/\\(u[0-9a-fA-F]{0,3})?$/, "");
    try {
        return (JSON.parse(`"${body}"`) as string).trim() || undefined;
    } catch {
        return undefined;
    }
}

/**
 * The call's title. Older conversations stored an optional `description`
 * instead; when neither exists the caller shows the tool's identifier.
 */
export function toolReason(args: Record<string, unknown> | undefined): string | undefined {
    for (const value of [args?.reason, args?.description]) {
        if (typeof value === "string" && value.trim()) return value.trim();
    }
    return undefined;
}
