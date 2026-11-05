import type {LanguageModelUsage} from "ai";

export function formatElapsedTime(milliseconds: number): string {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return "—";
    if (milliseconds > 0 && milliseconds < 1000) return "<1s";
    const seconds = Math.floor(milliseconds / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ${seconds % 60}s`;
}

export interface UsageRecord {
    input?: number;
    output?: number;
    reasoning?: number;
    cacheRead?: number;
    cacheWrite?: number;
}

export function usageRecord(usage: LanguageModelUsage): UsageRecord {
    return {input: usage.inputTokens, output: usage.outputTokens,
        reasoning: usage.outputTokenDetails?.reasoningTokens,
        cacheRead: usage.inputTokenDetails?.cacheReadTokens,
        cacheWrite: usage.inputTokenDetails?.cacheWriteTokens};
}

/** Run total from completed steps, for runs that end without a finish event (e.g. stopped early). */
export function sumUsage(steps: UsageRecord[]): UsageRecord | undefined {
    if (!steps.length) return undefined;
    const add = (key: keyof UsageRecord) => steps.some(step => step[key] !== undefined)
        ? steps.reduce((sum, step) => sum + (step[key] ?? 0), 0) : undefined;
    return {input: add("input"), output: add("output"), reasoning: add("reasoning"),
        cacheRead: add("cacheRead"), cacheWrite: add("cacheWrite")};
}

export interface ToolMetric {
    /** Tool call ID; absent on records saved before per-call display. */
    id?: string;
    name: string;
    inputChars: number;
    outputChars: number;
    modelOutputChars: number;
    /** Estimated tokens of the arguments the model wrote. */
    inputTokens?: number;
    /** Estimated tokens the projected result adds to the model's context. */
    modelOutputTokens?: number;
    elapsedMs: number;
    failed: boolean;
    repeated: boolean;
}

export interface RunMetrics {
    providerId?: string;
    modelId?: string;
    startedAt?: number;
    steps: (UsageRecord & {activeTools: number; contextChars: number; recordedAt?: number})[];
    tools: ToolMetric[];
    total?: UsageRecord;
    compactedResults: number;
    elapsedMs: number;
    stopReason?: string;
}

// Providers report usage per request, not per tool, so per-tool counts are
// estimates: ~4 characters per text token, and Anthropic's (w*h)/750 image rule
// (images are downscaled to about 1,600 tokens). Other providers tile differently.
const CHARS_PER_TOKEN = 4;
const MAX_IMAGE_TOKENS = 1600;

export function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateImageTokens(pixels?: {width?: number; height?: number}): number {
    if (!pixels?.width || !pixels?.height) return MAX_IMAGE_TOKENS;
    return Math.min(MAX_IMAGE_TOKENS, Math.ceil(pixels.width * pixels.height / 750));
}

/** Older records only stored character counts. */
export function toolCallTokens(metric: ToolMetric): {input: number; output: number} {
    return {input: metric.inputTokens ?? Math.ceil(metric.inputChars / CHARS_PER_TOKEN),
        output: metric.modelOutputTokens ?? Math.ceil(metric.modelOutputChars / CHARS_PER_TOKEN)};
}

/** A run's numbers, and the part of its reply being written now: a mid-run message splits the reply into parts. */
export function createRunMeter(base: {providerId: string; modelId: string; startedAt: number}) {
    const metrics: RunMetrics = {...base, steps: [], tools: [], compactedResults: 0, elapsedMs: 0};
    // The part of the reply now being written: its first step and when it began.
    let segment = {step: 0, startedAt: base.startedAt};
    // Each part of a reply split by mid-run messages shows the steps, tokens and time it covered.
    const metricsFor = (from: number, to: number | undefined, since: number, until = Date.now()): RunMetrics => {
        if (from === 0 && to === undefined) return {...metrics, steps: [...metrics.steps], tools: [...metrics.tools]};
        const steps = metrics.steps.slice(from, to);
        return {...metrics, startedAt: since, steps, tools: [...metrics.tools],
            total: steps.length ? sumUsage(steps) : undefined, elapsedMs: until - since};
    };
    return {
        metrics,
        get segment() { return segment; },
        current: () => metricsFor(segment.step, undefined, segment.startedAt),
        /** Ends the current part. Steps can finish before the stream shows the split, so both parts are measured from the boundary. */
        endSegment(step: number, endedAt: number): RunMetrics {
            const boundary = Math.max(segment.step, step);
            const ended = metricsFor(segment.step, boundary, segment.startedAt, endedAt);
            segment = {step: boundary, startedAt: endedAt};
            return ended;
        },
    };
}

export type RunMeter = ReturnType<typeof createRunMeter>;
