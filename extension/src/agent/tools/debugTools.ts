import {tool} from "ai";
import {z} from "zod";
import {type ToolContext, responseFormatSchema} from "./toolContext";
import {captureNetworkRequests} from "@/injected/tools/networkCapture";

// Output budget. Every tool result stays in the message history and is re-sent
// on each subsequent step, so an uncapped result is charged many times over.
const MAX_CONSOLE_LOGS = 50;

export function createDebugTools(context: ToolContext) {
    const {chrome} = context;
    return {
        getDebugInfo: tool({
            description:
                "Observe console output and/or network activity. Console capture lasts 5s: reproduce during capture. Network hooks install on first call; filter with urlFilter.",
            inputSchema: z.object({
                sources: z
                    .array(z.enum(["console", "network"]))
                    .describe(
                        'Which debug sources to capture. E.g. ["console"], ["network"], or ["console", "network"] for both.'
                    ),
                clear: z
                    .boolean()
                    .optional()
                    .default(true)
                    .describe(
                        "Clear the network buffer after reading (default: true). Set false to accumulate. Only applies to network source."
                    ),
                urlFilter: z
                    .string()
                    .optional()
                    .describe(
                        'Only return network requests whose URL contains this substring (e.g. "/api/", "graphql"). Only applies to network source.'
                    ),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({sources, clear, urlFilter, responseFormat}) => {
                const result: any = {};
                const concise = responseFormat === "concise";

                if (sources.includes("console")) {
                    const response = await chrome.runtime.sendMessage({
                        type: "GET_CONSOLE",
                        tabId: context.tabId,
                        duration: 5000,
                    });
                    if (response?.error) throw new Error(response.error);
                    const logs = response.logs as Array<{
                        type: string;
                        args: any[];
                        timestamp: number;
                    }>;
                    if (concise) {
                        const errorCount = logs.filter((l) => l.type === "error" || l.type === "uncaught-error" || l.type === "unhandled-rejection").length;
                        const warnCount = logs.filter((l) => l.type === "warn").length;
                        const firstError = logs.find((l) => l.type === "error" || l.type === "uncaught-error");
                        result.console = {
                            count: logs.length,
                            errorCount,
                            warningCount: warnCount,
                            ...(firstError && {firstError: {type: firstError.type, args: firstError.args}}),
                        };
                    } else {
                        // Was unbounded — a chatty page could return thousands of
                        // entries. Errors and warnings are what debugging needs, so
                        // they survive truncation; the rest fills the remainder with
                        // the most recent entries.
                        const isSevere = (l: { type: string }) =>
                            l.type === "error" ||
                            l.type === "uncaught-error" ||
                            l.type === "unhandled-rejection" ||
                            l.type === "warn";
                        const severe = logs.filter(isSevere).slice(0, MAX_CONSOLE_LOGS);
                        const remaining = MAX_CONSOLE_LOGS - severe.length;
                        const filler = remaining > 0 ? logs
                            .filter((l) => !isSevere(l))
                            .slice(-remaining) : [];
                        const kept = [...severe, ...filler];

                        result.console = {
                            logs: kept,
                            count: logs.length,
                            ...(kept.length < logs.length && {
                                truncated: true,
                                omitted: logs.length - kept.length,
                                hint:
                                    `Showing ${kept.length} of ${logs.length} entries, errors and ` +
                                    "warnings first. Re-run after reproducing a narrower case if you " +
                                    "need the rest.",
                            }),
                        };
                    }
                }

                if (sources.includes("network")) {
                    const [netResult] = await chrome.scripting.executeScript({
                        target: {tabId: context.tabId},
                        world: "MAIN",
                        func: captureNetworkRequests,
                        args: [clear ?? true, urlFilter ?? null],
                    });
                    const netData = netResult.result as any;
                    if (concise) {
                        const failed = (netData.requests ?? []).filter((r: any) => r.status >= 400 || r.error);
                        result.network = {
                            requestCount: netData.captured ?? 0,
                            failedCount: failed.length,
                            ...(failed.length > 0 && {firstFailedUrl: failed[0].url}),
                        };
                    } else {
                        result.network = {
                            ...netData,
                            ...((netData.captured ?? 0) > 50 && {
                                hint: "Many requests captured. Use urlFilter to narrow results.",
                            }),
                        };
                    }
                }

                return result;
            },
        }),
    };
}
