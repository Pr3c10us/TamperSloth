import {isReadOnlyTool} from "./actionScreen";

export interface EditedTurn {
    role: "user" | "assistant";
    content: string;
    toolCalls?: { name: string; args?: { reason?: string }; status: "calling" | "done" | "error" }[];
}

/** Changes to the page view only, not to what is on it. */
const VIEW_ONLY = new Set(["scrollPage"]);
const MAX_ACTIONS = 20;
const MAX_LATER = 10;
const MAX_LATER_CHARS = 300;

function clip(text: string, max: number) {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Hidden context for a message that replaces an earlier one. Editing drops the
 * turns that followed it from the chat, but not from the browser: whatever they
 * changed is still there. The note names the original request and those
 * changes, so the model checks the page instead of assuming it is untouched.
 */
export function buildEditNote(original: string, dropped: EditedTurn[]): string {
    const actions = dropped.flatMap(turn => turn.toolCalls ?? [])
        .filter(call => call.status !== "error" && !isReadOnlyTool(call.name) && !VIEW_ONLY.has(call.name))
        .map(call => `- ${call.name}${call.args?.reason ? `: ${clip(call.args.reason, 160)}` : ""}${call.status === "calling" ? " (stopped mid-way; may have partly run)" : ""}`);
    const listed = actions.length > MAX_ACTIONS
        ? [...actions.slice(0, MAX_ACTIONS), `- …and ${actions.length - MAX_ACTIONS} more`]
        : actions;
    const quoted = original.trim()
        ? clip(original.trim(), 1500).split(/\r?\n/).map(line => `> ${line}`).join("\n")
        : "> (no text)";
    // What the user asked afterwards explains the actions below; it is context, not a request.
    const later = dropped.filter(turn => turn.role === "user" && turn.content.trim())
        .map(turn => `- ${clip(turn.content.trim().replace(/\s+/g, " "), MAX_LATER_CHARS)}`);
    const laterListed = later.length > MAX_LATER
        ? [...later.slice(0, MAX_LATER), `- …and ${later.length - MAX_LATER} more`]
        : later;
    return [
        "[The user edited their earlier message. This message replaces it, and the conversation that followed it was discarded. The original was:",
        quoted,
        ...(laterListed.length
            ? ["The user's later messages were discarded with it. They are context only; do not act on them:\n" + laterListed.join("\n")]
            : []),
        listed.length
            ? "The browser was not rolled back. Before the edit you had already done the following, and it may still be in effect:\n" + listed.join("\n")
                + "\nCheck the page's current state before acting, and build on or undo those changes as this request needs.]"
            : "Nothing done after the original message changed the browser.]",
    ].join("\n");
}
