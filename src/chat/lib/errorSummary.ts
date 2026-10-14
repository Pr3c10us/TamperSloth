/**
 * Turns raw provider/SDK error text into one short, plain sentence. The raw
 * text stays available as `details` for anyone who wants to dig in.
 */

export interface ErrorSummary {
    summary: string;
    /** The full original message, present only when it differs from the summary. */
    details?: string;
}

const MAX_SUMMARY = 100;
/** Plain prose up to this length is already readable, e.g. our own "Reached the step limit…" notices. */
const MAX_PLAIN = 220;

const RULES: Array<[RegExp, string]> = [
    [/InvalidToolInputError|TypeValidationError|invalid (?:input|arguments) for tool/i,
        "The model sent a malformed tool request."],
    [/NoSuchToolError|unavailable tool|tool .{0,40} (?:not found|does not exist)/i,
        "The model tried to use a tool that doesn't exist."],
    [/context (?:length|window)|maximum context|prompt is too long|too many tokens|input is too long/i,
        "This chat is too long for the model. Start a new chat to continue."],
    [/\b429\b|rate.?limit|quota|resource.?exhausted|too many requests/i,
        "The provider is rate-limiting requests. Try again shortly."],
    [/\b40[13]\b|unauthori[sz]ed|invalid.{0,20}(?:api.?key|token)|api.?key.{0,30}(?:invalid|missing|not valid)|permission.?denied|authentication/i,
        "The provider rejected the API key. Check it in Settings."],
    [/model.{0,60}(?:not found|does not exist|is not supported|unknown)|unknown model/i,
        "The selected model isn't available from this provider."],
    [/failed to fetch|network ?error|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timed out|timeout/i,
        "Couldn't reach the provider. Check your connection."],
    [/overloaded|internal server error|service unavailable|bad gateway|gateway timeout|status(?:code)?\W{0,3}5\d\d/i,
        "The provider is having trouble right now. Try again in a moment."],
];

/** First sentence or line, clipped to a readable length. */
function firstSentence(text: string): string {
    const line = text.split(/\r?\n/)[0].trim();
    const sentence = line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line;
    return sentence.length > MAX_SUMMARY ? `${sentence.slice(0, MAX_SUMMARY - 1).trimEnd()}…` : sentence;
}

export function summarizeError(raw: string | null | undefined): ErrorSummary {
    const text = (raw ?? "").trim();
    if (!text) return {summary: "Something went wrong."};

    for (const [pattern, summary] of RULES) {
        if (pattern.test(text)) return {summary, details: text};
    }

    if (text.length <= MAX_PLAIN && !text.includes("\n") && !/[{[]/.test(text)) return {summary: text};

    return {summary: firstSentence(text), details: text};
}
