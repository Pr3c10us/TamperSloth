import {tool} from "ai";
import {z} from "zod";
import {setTaskStatus} from "./browserTools";
import {type AskUserAnswer, rejectPendingAsk, setPendingAsk} from "./askUserBus";
import type {ToolContext} from "./toolContext";

export function createAskUserTool(context: ToolContext) {
    return {
        askUser: tool({
            description:
                "Ask a concrete question with 2–5 choices and wait. The UI adds Other; do not include it. Add a short description when a label alone doesn't show what the choice means.",
            inputSchema: z.object({
                question: z.string().min(1).describe("The question to ask the user."),
                options: z
                    .array(
                        // Weaker models (e.g. Gemini Flash Lite) send bare strings; accept both shapes.
                        z.union([
                            z.string().min(1),
                            z.object({
                                label: z.string().min(1).describe("Short option label."),
                                description: z
                                    .string()
                                    .max(120)
                                    .optional()
                                    .describe("One plain line on what this choice means or looks like. Aim for under 80 characters."),
                                emoji: z
                                    .string()
                                    .optional()
                                    .describe("Optional single emoji shown alongside the label."),
                            }),
                        ]),
                    )
                    .min(2)
                    .max(5)
                    .describe("The options to present. Do not include an \"Other\" option."),
            }),
            execute: async ({question, options: rawOptions}, {toolCallId, abortSignal}) => {
                const options = rawOptions.map((opt) => (typeof opt === "string" ? {label: opt} : opt));
                void setTaskStatus(context.conversationId, 'waiting');
                return new Promise<{ answer: AskUserAnswer }>((resolve, reject) => {
                    const onAbort = () => {
                        rejectPendingAsk(context.conversationId, new Error("aborted"));
                    };
                    abortSignal?.addEventListener("abort", onAbort, {once: true});
                    setPendingAsk(context.conversationId, {
                        id: toolCallId,
                        question,
                        options,
                        resolve: (answer) => {
                            abortSignal?.removeEventListener("abort", onAbort);
                            resolve({answer});
                        },
                        reject: (err) => {
                            abortSignal?.removeEventListener("abort", onAbort);
                            reject(err);
                        },
                    });
                }).finally(() => { void setTaskStatus(context.conversationId, 'working'); });
            },
        }),
    };
}
