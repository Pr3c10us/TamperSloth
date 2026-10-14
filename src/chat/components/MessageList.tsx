import {forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import { ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "../hooks/useAgent";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { EmptyState } from "./EmptyState";
import { Hint } from "./Hint";
import { ErrorNotice } from "./ErrorNotice";
import {DEFAULT_AGENT_SETTINGS, loadAgentSettings, onAgentSettingsChange} from "../lib/agentSettings";

interface MessageListProps {
    messages: ChatMessage[];
    isLoading: boolean;
    error: string | null;
}

// Within this many px of the end counts as "at the bottom" (fractional scroll positions).
const BOTTOM_SLACK = 4;

const distanceFromBottom = (element: HTMLElement) => element.scrollHeight - element.scrollTop - element.clientHeight;

/**
 * Follow mode: the list stays pinned to the bottom while content streams in.
 * Scrolling up pauses it immediately; reaching the bottom again, or the
 * scroll-to-bottom button, resumes it.
 */
export const MessageList = forwardRef<HTMLDivElement, MessageListProps>(
    function MessageList({ messages, isLoading, error }, forwardedRef) {

        const [settings, setSettings] = useState(DEFAULT_AGENT_SETTINGS);
        const scrollRef = useRef<HTMLDivElement | null>(null);
        const contentRef = useRef<HTMLDivElement>(null);
        const followRef = useRef(true);
        const lastTopRef = useRef(0);
        const touchYRef = useRef<number | null>(null);
        const [showJump, setShowJump] = useState(false);

        useEffect(() => {
            let active = true;
            void loadAgentSettings().then(value => { if (active) setSettings(value); });
            const unsubscribe = onAgentSettingsChange(setSettings);
            return () => { active = false; unsubscribe(); };
        }, []);

        const pin = useCallback(() => {
            const element = scrollRef.current;
            if (element && followRef.current) element.scrollTop = element.scrollHeight;
        }, []);

        const pause = useCallback(() => {
            const element = scrollRef.current;
            // Nothing to read above when the content fits; keep following.
            if (!element || element.scrollHeight <= element.clientHeight) return;
            followRef.current = false;
        }, []);

        // A new chat, a loaded conversation, or a newly sent message starts following again.
        const userMessages = messages.filter(message => message.role === "user").length;
        const firstId = messages[0]?.id;
        useLayoutEffect(() => {
            followRef.current = true;
            setShowJump(false);
            pin();
        }, [userMessages, firstId, pin]);

        useLayoutEffect(pin, [messages, isLoading, error, pin]);

        // Content also grows without a message update: expanding steps, images
        // loading, the composer resizing. Re-pin whenever either box changes size.
        useEffect(() => {
            const element = scrollRef.current, content = contentRef.current;
            if (!element || !content) return;
            const observer = new ResizeObserver(pin);
            observer.observe(element);
            observer.observe(content);
            return () => observer.disconnect();
        }, [pin]);

        const onScroll = () => {
            const element = scrollRef.current;
            if (!element) return;
            const distance = distanceFromBottom(element);
            if (distance <= BOTTOM_SLACK) followRef.current = true;
            // Upward movement pauses; content shrinking while pinned stays at the bottom above.
            else if (element.scrollTop < lastTopRef.current - 1) followRef.current = false;
            lastTopRef.current = element.scrollTop;
            setShowJump(!followRef.current && distance > BOTTOM_SLACK);
        };

        const jumpToBottom = () => {
            const element = scrollRef.current;
            if (!element) return;
            followRef.current = true;
            setShowJump(false);
            element.scrollTo({top: element.scrollHeight, behavior: "smooth"});
        };

        return (
            <>
                <div
                    ref={node => {
                        scrollRef.current = node;
                        if (typeof forwardedRef === "function") forwardedRef(node);
                        else if (forwardedRef) forwardedRef.current = node;
                    }}
                    onScroll={onScroll}
                    // Pause on the intent itself, before the scroll lands, so streaming
                    // content can't pull the view back down in between.
                    onWheel={event => { if (event.deltaY < 0) pause(); }}
                    onTouchStart={event => { touchYRef.current = event.touches[0]?.clientY ?? null; }}
                    onTouchMove={event => {
                        const y = event.touches[0]?.clientY;
                        if (y !== undefined && touchYRef.current !== null && y > touchYRef.current + 2) pause();
                        touchYRef.current = y ?? null;
                    }}
                    className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 pt-5 pb-[calc(var(--composer-height,8rem)+1.5rem)]"
                >
                    <div ref={contentRef} className="flex flex-col gap-6">
                        {messages.length === 0 && <EmptyState />}
                        {messages.map((m, i) =>
                            m.role === "user" ? (
                                <UserMessage key={m.id} msg={m} />
                            ) : (
                                <AssistantMessage
                                    key={m.id}
                                    msg={m}
                                    isLoading={isLoading}
                                    isLast={i === messages.length - 1}
                                    showRunTokens={settings.showRunTokens}
                                    showToolTokens={settings.showToolTokens}
                                />
                            )
                        )}
                        {error && !isLoading && (
                            <ErrorNotice message={error} className="px-1"/>
                        )}
                    </div>
                </div>
                <Hint label={showJump ? "Scroll to bottom" : undefined}>
                    <button
                        type="button"
                        onClick={jumpToBottom}
                        aria-label="Scroll to bottom"
                        aria-hidden={!showJump}
                        tabIndex={showJump ? 0 : -1}
                        className={cn(
                            "fixed left-1/2 cursor-pointer z-30 inline-flex size-8 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md",
                            "bottom-[calc(var(--composer-height,8rem)+1rem)] transition-[opacity,transform,background-color] duration-200 hover:bg-muted",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none",
                            showJump ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
                        )}
                    >
                        <ArrowDown className="size-4" strokeWidth={1.75} />
                    </button>
                </Hint>
            </>
        );
    }
);
