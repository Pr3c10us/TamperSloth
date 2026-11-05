import {tool} from "ai";
import {z} from "zod";
import {type ToolContext, responseFormatSchema} from "./toolContext";
import {selectorError, withSelectorHelp} from "./selectorHelp";
import {readElementDetails, readPageStructure, readPageText} from "@/injected/tools/pageInspection";
import {browserImageOutput} from "./browserTools";

// Output budget. Every tool result stays in the message history and is re-sent
// on each subsequent step, so an uncapped result is charged many times over.
const MAX_DOM_NODES = 250;

export function createPageInspectionTools(context: ToolContext) {
    const {chrome} = context;
    return {
        getCurrentTab: tool({
            description:
                "Refresh the attached tab URL and title. Initial tab metadata is already supplied.",
            inputSchema: z.object({
            }),
            execute: async () => {
                const tab = await chrome.tabs.get(context.tabId);
                return {tabId: tab.id, url: tab.url, title: tab.title};
            },
        }),

        getPageStructure: tool({
            description:
                "Inspect scoped DOM for selectors and links. Prefer getPageText for text. Expand maxNodes or scope when truncated.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .optional()
                    .describe(
                        "CSS selector to scope the capture to a specific section"
                    ),
                responseFormat: responseFormatSchema,
                maxNodes: z.number().int().min(20).max(1500).default(MAX_DOM_NODES),
                tabId: z.number().int().positive().optional()
                    .describe("Read another tab (e.g. a reference tab) without changing which tab page actions target. Omit for the target tab."),
            }),
            execute: async ({selector, responseFormat, maxNodes, tabId: readTabId}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: readTabId ?? context.tabId},
                    func: readPageStructure,
                    args: [selector ?? null, responseFormat ?? "concise", maxNodes ?? MAX_DOM_NODES],
                });

                return result.result;
            },
        }),

        getElementDetails: tool({
            description:
                "Inspect elements matching a selector. Detailed includes HTML, positions and computed styles.",
            inputSchema: z.object({
                selector: z.string(),
                responseFormat: responseFormatSchema,
            }),
            execute: async ({selector, responseFormat}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: readElementDetails,
                    args: [selector, responseFormat ?? "concise"],
                });
                return withSelectorHelp(context.tabId, selector, result.result);
            },
        }),

        getPageText: tool({
            description:
                "Read visible page text, scoped to selector or main/article. Follow nextOffset for more; offsets refer to current text.",
            inputSchema: z.object({
                selector: z
                    .string()
                    .optional()
                    .describe(
                        'CSS selector to scope extraction to a specific container (e.g. "main", "#content"). ' +
                        "Omit to get the full page text."
                    ),
                maxLength: z
                    .number()
                    .int().min(100).max(20000)
                    .optional()
                    .describe("Characters per page: default 3000 concise, 10000 detailed; maximum 20000."),
                offset: z.number().int().min(0).default(0).describe('Character offset for the next page of text.'),
                responseFormat: responseFormatSchema,
                tabId: z.number().int().positive().optional()
                    .describe("Read another tab (e.g. a reference tab) without changing which tab page actions target. Omit for the target tab."),
            }),
            execute: async ({selector, maxLength, responseFormat, offset, tabId: readTabId}) => {
                const invalid = selectorError(selector);
                if (invalid) return invalid;
                const effectiveMax = maxLength ?? (responseFormat === "detailed" ? 10000 : 3000);
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: readTabId ?? context.tabId},
                    func: readPageText,
                    args: [selector ?? null, effectiveMax, responseFormat ?? "concise", offset ?? 0],
                });
                return result.result;
            },
        }),

        takeScreenshot: tool({
            description:
                "Capture the visible viewport as an image. Use for visual verification.",
            inputSchema: z.object({
                detail: z.enum(["standard", "full"]).default("standard").describe('Standard caps width at 1280px; full preserves resolution for fine detail.'),
            }),
            execute: async ({detail}) => {
                const response = await chrome.runtime.sendMessage({
                    type: "TAKE_SCREENSHOT",
                    tabId: context.tabId,
                    maxWidth: detail === "full" ? undefined : 1280,
                });
                if (response?.error) throw new Error(response.error);
                return {screenshot: response.dataUrl as string, metadata: response.metadata};
            },
            toModelOutput: ({output}) => {
                return browserImageOutput(output);
            },
        }),
    };
}
