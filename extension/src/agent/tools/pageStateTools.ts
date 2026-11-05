import {tool} from "ai";
import {z} from "zod";
import {readWebStorage} from "@/injected/tools/pageState";
import type {ToolContext} from "./toolContext";

export function createPageStateTools(context: ToolContext) {
    const {chrome} = context;
    return {
        getLocalStorage: tool({
            description:
                "Read page local/session storage, optionally filtered by key prefix. Values are capped.",
            inputSchema: z.object({
                storageType: z
                    .enum(["local", "session", "both"])
                    .optional()
                    .default("local")
                    .describe(
                        'Which storage to read: "local" (default), "session", or "both". ' +
                        'Only ask for "both" when you actually need session storage too — it doubles the output.'
                    ),
                keyPrefix: z
                    .string()
                    .optional()
                    .describe(
                        'Only return keys starting with this prefix (e.g. "auth_", "user_"). ' +
                        "Strongly preferred over reading every key."
                    ),
                maxKeys: z
                    .number()
                    .optional()
                    .default(25)
                    .describe(
                        "Maximum number of keys to return per storage type (default: 25). " +
                        "Raise only when a prefix search has already narrowed the set."
                    ),
            }),
            execute: async ({storageType, keyPrefix, maxKeys}) => {
                const [result] = await chrome.scripting.executeScript({
                    target: {tabId: context.tabId},
                    func: readWebStorage,
                    args: [storageType ?? "local", keyPrefix ?? null, maxKeys ?? 25],
                });
                return result.result;
            },
        }),

        getCookies: tool({
            description:
                "Read cookies for the attached page, optionally filtered by name.",
            inputSchema: z.object({
                nameFilter: z
                    .string()
                    .optional()
                    .describe(
                        'Only return cookies whose name contains this substring (e.g. "session", "token"). ' +
                        "Case-insensitive. Omit to return all."
                    ),
            }),
            execute: async ({nameFilter}) => {
                const tab = await chrome.tabs.get(context.tabId);
                if (!tab.url) return {error: "Cannot access tab URL"};

                const url = new URL(tab.url);
                const allCookies = await chrome.cookies.getAll({
                    domain: url.hostname,
                });

                const filtered = nameFilter
                    ? allCookies.filter((c) =>
                        c.name.toLowerCase().includes(nameFilter.toLowerCase())
                    )
                    : allCookies;

                return {
                    domain: url.hostname,
                    total: allCookies.length,
                    returned: filtered.length,
                    cookies: filtered.slice(0, 50).map((c) => ({
                        name: c.name,
                        value:
                            c.value.length > 200
                                ? c.value.slice(0, 200) + "...[truncated]"
                                : c.value,
                        domain: c.domain,
                        path: c.path,
                        secure: c.secure,
                        httpOnly: c.httpOnly,
                        sameSite: c.sameSite,
                        expirationDate: c.expirationDate
                            ? new Date(c.expirationDate * 1000).toISOString()
                            : "session",
                    })),
                };
            },
        }),
    };
}
