import type {ModelMessage} from "ai";

// Anthropic is the only provider here that needs explicit cache breakpoints —
// OpenAI, DeepSeek, Kimi, Grok and Gemini cache automatically server-side.
// providerOptions are namespaced per provider, so this is inert for the others.
export const ANTHROPIC_CACHE_BREAKPOINT = {
    anthropic: {cacheControl: {type: "ephemeral" as const}},
} as const;

/**
 * Rolling cache breakpoint at the tail of each step's message list.
 *
 * Anthropic only re-reads a cached prefix up to a breakpoint. The one on the
 * system message covers tools + system, but without a second one at the tail
 * every tool result accumulated so far is re-billed at full input rate on each
 * of the up-to-200 steps. With it, each step reads the whole prior prefix from
 * cache and only writes the delta.
 */
export function markCachePrefix({messages}: { messages: ModelMessage[] }) {
    if (messages.length === 0) return {};
    const last = messages[messages.length - 1];
    return {
        messages: [
            ...messages.slice(0, -1),
            {
                ...last,
                providerOptions: {...last.providerOptions, ...ANTHROPIC_CACHE_BREAKPOINT},
            } as ModelMessage,
        ],
    };
}
