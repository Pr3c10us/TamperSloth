import {asMidRun, type InjectedMessages} from "@/agent/conversation/historyMessages";
import {getSession, patchSession, updateMessages} from "@/agent/conversation/sessions";
import type {ChatMessage, QueuedMessage} from "@/agent/conversation/types";
import {prepareUserMessage, toModelMessages} from "@/agent/conversation/userMessage";
import {closeThinking, type ReplyWriter} from "./replyWriter";
import type {RunMeter} from "./runMetrics";

/**
 * Messages the user sent mid-run: the model gets them before its next step, and
 * the chat shows them once the stream reaches that step.
 */
export function createMidRunMessages(options: {
    conversationId: string;
    signal: AbortSignal;
    reply: ReplyWriter;
    meter: RunMeter;
}) {
    const {conversationId, signal, reply, meter} = options;
    const injected: InjectedMessages[] = [];
    // Each batch keeps how many steps had finished when the model read it: where the reply splits.
    const unshown: { step: number; messages: ChatMessage[] }[] = [];

    return {
        /** What the model has read so far, for rebuilding its transcript. */
        injected,

        /** Reads what is queued, for the model's next step. Returns it, if there was any. */
        async read(at: number): Promise<QueuedMessage[] | undefined> {
            const queued = getSession(conversationId)?.queued ?? [];
            if (!queued.length || signal.aborted) return undefined;
            patchSession(conversationId, {queued: []});
            const prepared = await Promise.all(queued.map(q =>
                prepareUserMessage(conversationId, q.text, q.pickedElements, q.attachments, q.quotes)));
            await Promise.all(prepared.map(p => p.saved));
            const messages = await Promise.all(prepared.map(p => toModelMessages([p.message], p.files)));
            injected.push({at, messages: messages.flat().map(asMidRun)});
            unshown.push({step: meter.metrics.steps.length, messages: prepared.map(p => p.message)});
            return queued;
        },

        /** The reply so far ends where the user's messages arrived and resumes after them. */
        show() {
            if (!unshown.length) return;
            const batches = unshown.splice(0);
            const sent = batches.flatMap(b => b.messages);
            const current = getSession(conversationId)?.messages.find(m => m.id === reply.id);
            if (!current?.blocks.length) {
                updateMessages(conversationId, (messages) => {
                    const index = messages.findIndex(m => m.id === reply.id);
                    return index < 0 ? [...messages, ...sent] : [...messages.slice(0, index), ...sent, ...messages.slice(index)];
                });
                return;
            }
            const nextId = crypto.randomUUID();
            const endedAt = Date.now();
            const ended = meter.endSegment(batches[0].step, endedAt);
            updateMessages(conversationId, (messages) => messages.flatMap((m): ChatMessage[] => m.id !== reply.id ? [m] : [
                {...m, blocks: closeThinking(m.blocks, endedAt), runMetrics: ended},
                ...sent,
                {id: nextId, role: "assistant", content: "", toolCalls: [], blocks: [], runMetrics: meter.current(), taskState: m.taskState},
            ]));
            reply.continueAs(nextId);
        },
    };
}
