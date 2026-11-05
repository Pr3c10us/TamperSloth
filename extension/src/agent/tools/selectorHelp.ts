import {explainNoMatch} from "@/injected/tools/selectorHelp";

/**
 * querySelector throws a SyntaxError inside the injected script for Playwright/jQuery
 * syntax or unescaped utility classes (".hover:bg-muted", ".w-[32px]"); the model then
 * only sees an opaque injection failure. Validate here so it gets a fixable hint.
 */
export function selectorError(selector: string | null | undefined) {
    if (!selector || typeof document === "undefined") return null;
    try {
        document.createDocumentFragment().querySelector(selector);
        return null;
    } catch {
        return {
            error: `Invalid CSS selector: ${selector}`,
            hint: "Use standard CSS only (no :has-text(), :contains() or text=). Escape special characters in class names " +
                "(.hover\\:bg-muted) or use attribute selectors such as [aria-label=\"Profile\"], [data-testid=\"avatar\"] or [class~=\"w-[32px]\"].",
        };
    }
}

export async function withSelectorHelp<T>(tabId: number, selector: string | null | undefined, output: T): Promise<T> {
    const error = (output as {error?: unknown} | null)?.error;
    if (!selector || typeof error !== "string" || !error.startsWith("No element")) return output;
    try {
        const [help] = await chrome.scripting.executeScript({target: {tabId}, func: explainNoMatch, args: [selector]});
        return {...output, ...help.result};
    } catch {
        return output;
    }
}
