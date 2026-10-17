/** How hard the model thinks before each step. Mapped per provider in providerCompatibility.ts. */
export type ThinkingLevel = "low" | "medium" | "high" | "max";

export const THINKING_LEVELS: {value: ThinkingLevel; label: string; hint: string}[] = [
    {value: "low", label: "Low", hint: "Quick replies, light reasoning."},
    {value: "medium", label: "Medium", hint: "Some reasoning on each step."},
    {value: "high", label: "High", hint: "Careful reasoning on each step."},
    {value: "max", label: "Max", hint: "The deepest reasoning the model offers. Slower and uses more tokens."},
];

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "high";

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
    return THINKING_LEVELS.some(level => level.value === value);
}
