import { useEffect, useState } from "react";
import { Check, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_AGENT_SETTINGS, loadAgentSettings, onAgentSettingsChange } from "../lib/agentSettings";
import { THINKING_LEVELS, type ThinkingLevel } from "../lib/thinkingLevel";

/** The level new chats start with (the last one picked), kept current when it changes. */
export function useDefaultThinkingLevel(): ThinkingLevel {
    const [fallback, setFallback] = useState<ThinkingLevel>(DEFAULT_AGENT_SETTINGS.thinkingLevel);
    useEffect(() => {
        void loadAgentSettings().then((s) => setFallback(s.thinkingLevel));
        return onAgentSettingsChange((s) => setFallback(s.thinkingLevel));
    }, []);
    return fallback;
}

interface ThinkingLevelPageProps {
    level: ThinkingLevel;
    /** The levels the selected model offers. */
    levels: ThinkingLevel[];
    onSelect: (level: ThinkingLevel) => void;
    onBack: () => void;
}

/** The model picker's thinking page: this chat's level, applied from the next message on. */
export function ThinkingLevelPage({ level, levels, onSelect, onBack }: ThinkingLevelPageProps) {
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1 border-b border-border px-2.5 py-2 text-left text-[12.5px] font-medium text-foreground outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
            >
                <ChevronLeft className="size-3.5 text-muted-foreground" strokeWidth={1.75}/>
                Thinking
            </button>
            <div role="radiogroup" aria-label="Thinking level" className="min-h-0 flex-1 overflow-y-auto p-1">
                {THINKING_LEVELS.filter((option) => levels.includes(option.value)).map((option) => {
                    const selected = option.value === level;
                    return (
                        <button
                            key={option.value}
                            type="button"
                            role="radio"
                            aria-checked={selected}
                            onClick={() => onSelect(option.value)}
                            className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                        >
                            <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium text-foreground">{option.label}</div>
                                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{option.hint}</div>
                            </div>
                            <Check className={cn("mt-0.5 size-3.5 shrink-0 text-accent", !selected && "invisible")} strokeWidth={2}/>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
