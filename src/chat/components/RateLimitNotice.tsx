import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useRateLimitWait } from "../lib/rateLimit";
import { Eyebrow, CARD_DUR, CARD_EASE } from "./askUser/shared";

/** Shown while this chat's run waits for the model's rate limit to reset. */
export function RateLimitNotice({ conversationId }: { conversationId: string }) {
    const wait = useRateLimitWait(conversationId);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!wait) return;
        setNow(Date.now());
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [wait]);

    if (!wait) return null;
    const seconds = Math.max(0, Math.ceil((wait.until - now) / 1000));
    const countdown = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

    return (
        <div
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="status"
        >
            <div className="flex flex-col gap-2 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Timer className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <Eyebrow>Rate limited</Eyebrow>
                    <span className="ml-auto font-mono text-[12px] tabular-nums text-muted-foreground">
                        {countdown}
                    </span>
                </header>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">{wait.modelName}</span> hit its rate limit.
                    Retrying shortly ({wait.retry}/{wait.maxRetries}).
                </p>
            </div>
        </div>
    );
}
