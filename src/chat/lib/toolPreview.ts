/** Display helpers for tool call rows. */

const SCREENSHOT_TOOLS = new Set(["takeScreenshot", "takeMarkedScreenshot"]);

/** The captured image of a screenshot tool's result, if any. */
export function screenshotSource(name: string, result: unknown): string | undefined {
    if (!SCREENSHOT_TOOLS.has(name) || !result || typeof result !== "object") return undefined;
    const screenshot = (result as {screenshot?: unknown}).screenshot;
    return typeof screenshot === "string" && /^data:image\/(png|jpe?g|webp);base64,/.test(screenshot) ? screenshot : undefined;
}

/** The message of a failed call, from a thrown error or an `{error}` result. */
export function toolErrorMessage(result: unknown): string | undefined {
    if (!result) return undefined;
    if (typeof result === "string") return result;
    if (result instanceof Error) return result.message || result.name;
    if (typeof result === "object") {
        const error = (result as {error?: unknown; message?: unknown}).error ?? (result as {message?: unknown}).message;
        if (typeof error === "string") return error;
        if (error && typeof error === "object" && typeof (error as {message?: unknown}).message === "string") return (error as {message: string}).message;
    }
    return undefined;
}

/** Short step duration: tenths under 10s, then whole seconds/minutes. */
export function formatStepDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "";
    if (ms < 100) return "<0.1s";
    if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`;
    const seconds = Math.round(ms / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
