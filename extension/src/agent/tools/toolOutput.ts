export const RESULT_CHARS = 6000;

export function serialize(value: unknown): string {
    if (typeof value === "string") return value;
    try { return JSON.stringify(value) ?? "null"; }
    catch { return "[Result could not be serialized]"; }
}

export function clip(text: string, limit: number): string {
    return text.length <= limit ? text : text.slice(0, limit) + "…[truncated]";
}

function clipEncoded(text: string, budget: number): string {
    if (JSON.stringify(text).length <= budget) return text;
    let low = 0, high = Math.min(text.length, budget);
    while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (JSON.stringify(clip(text, mid)).length <= budget) low = mid;
        else high = mid - 1;
    }
    return clip(text, low);
}

// Keep identifiers and errors ahead of the preview, so compression never hides
// whether an action succeeded or how to retrieve the object it created.
export function resultReceipt(output: unknown, resultId: string, previewChars = 600) {
    const record = output && typeof output === "object" ? output as Record<string, unknown> : {};
    const facts: Record<string, unknown> = {};
    for (const key of ["error", "success", "ok", "url", "finalUrl", "newUrl", "title", "scriptId", "path", "sourcePath", "status", "urlMatchPattern", "runAt", "truncated"]) {
        if (record[key] !== undefined) facts[key] = typeof record[key] === "boolean" || typeof record[key] === "number"
            ? record[key] : clipEncoded(serialize(record[key]), 300);
    }
    return {resultId, ...facts, archived: true, preview: clip(serialize(output), previewChars),
        hint: "Use readToolResult(resultId, offset) for the original result. Archived page data may be stale."};
}

export function compactToolOutput(output: unknown, resultId: string): unknown {
    if (serialize(output).length <= RESULT_CHARS) return output ?? null;
    const receipt = resultReceipt(output, resultId, 0);
    receipt.preview = clipEncoded(serialize(output), Math.max(30, RESULT_CHARS - serialize(receipt).length - 100));
    return receipt;
}

export function isFailed(output: unknown): boolean {
    if (!output || typeof output !== "object") return false;
    const value = output as Record<string, unknown>;
    return Boolean(value.error) || value.success === false || value.ok === false;
}
