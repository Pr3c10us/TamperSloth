import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, HelpCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
    answerPendingAsk,
    getPendingAsk,
    subscribeAskUser,
} from "../../lib/askUserBus";
import { Eyebrow, TODO_DUR, TODO_EASE } from "../todo/shared";

const OTHER_KEY = "__other__";

function usePendingAsk() {
    return useSyncExternalStore(
        subscribeAskUser,
        getPendingAsk,
        () => null,
    );
}

export function AskUserOverlay() {
    const pending = usePendingAsk();
    const [otherText, setOtherText] = useState("");
    const [focusedKey, setFocusedKey] = useState<string | null>(null);
    const otherInputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setOtherText("");
        setFocusedKey(null);
    }, [pending?.id]);

    useEffect(() => {
        if (focusedKey === OTHER_KEY) otherInputRef.current?.focus();
    }, [focusedKey]);

    if (!pending) return null;

    const submitOption = (label: string, emoji?: string) => {
        answerPendingAsk({ label, emoji, custom: false });
    };

    const submitCustom = () => {
        const text = otherText.trim();
        if (!text) return;
        answerPendingAsk({ label: text, custom: true });
    };

    return (
        <div
            ref={containerRef}
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `todoCardEnter ${TODO_DUR}ms ${TODO_EASE} both` }}
            role="dialog"
            aria-modal="false"
            aria-label="Question from Sloth"
        >
            <div className="flex flex-col gap-2.5 px-3 py-3">
                <header className="flex items-center gap-2">
                    <HelpCircle
                        className="size-3.5 text-muted-foreground"
                        strokeWidth={1.75}
                    />
                    <Eyebrow>Sloth needs an answer</Eyebrow>
                </header>

                <p className="font-heading text-[17px] italic leading-snug text-foreground">
                    {pending.question}
                </p>

                <ul className="flex flex-col gap-1.5">
                    {pending.options.map((opt, i) => (
                        <li key={`${opt.label}-${i}`}>
                            <button
                                type="button"
                                onClick={() => submitOption(opt.label, opt.emoji)}
                                className={cn(
                                    "group flex w-full items-center gap-2.5 rounded-md border border-border bg-background px-3 py-2 text-left text-sm leading-snug text-foreground transition-colors",
                                    "hover:border-foreground hover:bg-muted/40",
                                    "focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                                )}
                                style={{
                                    animation: `todoEnter ${TODO_DUR}ms ${TODO_EASE} ${i * 30}ms both`,
                                }}
                            >
                                {opt.emoji ? (
                                    <span
                                        aria-hidden
                                        className="shrink-0 text-base leading-none"
                                    >
                                        {opt.emoji}
                                    </span>
                                ) : (
                                    <span
                                        aria-hidden
                                        className="font-mono text-[10px] uppercase tracking-[.14em] text-muted-foreground"
                                    >
                                        {String.fromCharCode(65 + i)}
                                    </span>
                                )}
                                <span className="flex-1 truncate">{opt.label}</span>
                            </button>
                        </li>
                    ))}

                    <li>
                        {focusedKey === OTHER_KEY ? (
                            <div
                                className="flex items-center gap-2 rounded-md border border-foreground bg-background px-3 py-1.5 transition-colors"
                                style={{
                                    animation: `todoEnter ${TODO_DUR}ms ${TODO_EASE} both`,
                                }}
                            >
                                <Pencil
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                    strokeWidth={1.75}
                                />
                                <input
                                    ref={otherInputRef}
                                    value={otherText}
                                    onChange={(e) => setOtherText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                            e.preventDefault();
                                            submitCustom();
                                        } else if (e.key === "Escape") {
                                            e.preventDefault();
                                            setFocusedKey(null);
                                            setOtherText("");
                                        }
                                    }}
                                    placeholder="Type your answer…"
                                    className="flex-1 border-0 bg-transparent text-sm leading-snug text-foreground outline-none placeholder:text-muted-foreground"
                                />
                                <Button
                                    type="button"
                                    size="icon-sm"
                                    onClick={submitCustom}
                                    disabled={!otherText.trim()}
                                    aria-label="Send custom answer"
                                >
                                    <ArrowUp strokeWidth={2} />
                                </Button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setFocusedKey(OTHER_KEY)}
                                className={cn(
                                    "group flex w-full items-center gap-2.5 rounded-md border border-dashed border-border bg-background px-3 py-2 text-left text-sm leading-snug text-muted-foreground transition-colors",
                                    "hover:border-foreground hover:text-foreground",
                                    "focus-visible:border-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/40",
                                )}
                                style={{
                                    animation: `todoEnter ${TODO_DUR}ms ${TODO_EASE} ${pending.options.length * 30}ms both`,
                                }}
                            >
                                <Pencil
                                    className="size-3.5 shrink-0"
                                    strokeWidth={1.75}
                                />
                                <span className="flex-1 italic">Other — type your own answer</span>
                            </button>
                        )}
                    </li>
                </ul>
            </div>
        </div>
    );
}
