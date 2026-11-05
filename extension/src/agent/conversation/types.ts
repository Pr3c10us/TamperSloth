import type {ProviderId} from "@/agent/models/provider";
import type {ThinkingContent} from "@/agent/models/reasoning";
import type {ThinkingLevel} from "@/agent/models/thinkingLevel";
import type {RunMetrics} from "@/agent/run/runMetrics";
import type {ToolSafety} from "@/agent/safety/safetyGate";
import type {Quote} from "@/shared/panelRequests";
import type {PendingAttachment} from "./attachments";

export interface StoredAttachment {
    /** Key of the attachment's bytes in IndexedDB; absent on chats saved before attachments were stored. */
    id?: string;
    kind: "image" | "file";
    name: string;
    size: string;
    ext?: string;
    mediaType?: string;
}

export interface ToolCall {
    id: string;
    name: string;
    /** Model arguments; `reason` is the call's displayed title. */
    args: { reason?: string; [key: string]: unknown };
    result: unknown;
    status: "calling" | "done" | "error";
    startedAt?: number;
    endedAt?: number;
    /** Safety screening around this call: flagged content, approvals and blocks. */
    safety?: ToolSafety;
}

export type ContentBlock =
    | { type: "text"; text: string }
    | ({ type: "thinking" } & ThinkingContent)
    | { type: "tool_call"; toolCall: ToolCall };

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    toolCalls: ToolCall[];
    blocks: ContentBlock[];
    /** Picked elements' HTML: what the model receives. */
    pickedElements?: string[];
    /** Attachment ids of the picked elements' screenshots, by index; shown in the chat only. */
    pickedElementShots?: (string | null)[];
    attachments?: StoredAttachment[];
    /** Page text quoted with "Ask Sloth"; sent ahead of the message's own text. */
    quotes?: Quote[];
    taskState?: string;
    runMetrics?: RunMetrics;
    /** The user stopped this reply before it finished. */
    stopped?: boolean;
    /** Not shown: tells the model this message replaced an edited one, and what the dropped turns did. */
    editNote?: string;
    /** Not shown: what this reply left part-written, so the next message resumes it. */
    resumeNote?: string;
}

/** A picked element in the composer: the HTML goes to the model, the screenshot is only shown here. */
export interface PickedElement {
    html: string;
    /** Data URL of the element's visible area, when the capture succeeded. */
    screenshot?: string | null;
}

/** What the composer holds for one chat before it is sent. */
export interface Draft {
    text: string;
    pickedElements: PickedElement[];
    files: PendingAttachment[];
    /** Page text the user chose to ask about, shown above the input. */
    quotes: Quote[];
}

/** A message sent while the chat's run was working; the run reads it before its next step. */
export interface QueuedMessage {
    id: string;
    text: string;
    pickedElements?: PickedElement[];
    attachments?: PendingAttachment[];
    quotes?: Quote[];
    /** The model chosen when it was sent, for when it has to start a run of its own. */
    model: { providerId: ProviderId; apiKey: string; modelId?: string };
}

/** One chat's state. Replaced, never mutated, so it can be a React snapshot. */
export interface ChatSession {
    id: string;
    createdAt: number;
    /** Model-written title; `null` until the first request has been named. */
    title: string | null;
    messages: ChatMessage[];
    /** Chosen for this chat; `undefined` follows the default in settings. */
    thinkingLevel?: ThinkingLevel;
    isLoading: boolean;
    error: string | null;
    /** Sent while the run was working, waiting for its next step. */
    queued: QueuedMessage[];
    /**
     * Set while a sent message is being edited: it and everything after it are
     * hidden, and dropped for good on the next send. `previousDraft` is what the
     * composer held before, restored if the edit is cancelled.
     */
    editing?: { messageId: string; previousDraft: Draft };
}
