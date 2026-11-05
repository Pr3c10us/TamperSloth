import { useSyncExternalStore } from "react";
import { Hand } from "lucide-react";
import { getUserWait, showUserWait, subscribeUserWait } from "@/agent/tools/userWaitBus";
import { Eyebrow, CARD_DUR, CARD_EASE } from "@/pages/chat/cardParts";

/** Shown while Sloth waits for the user to do something on the page, such as signing in. */
export function UserWaitNotice({ conversationId }: { conversationId: string }) {
    const wait = useSyncExternalStore(subscribeUserWait, () => getUserWait(conversationId), () => null);
    if (!wait) return null;

    return (
        <div
            key={wait.id}
            className="border-t border-accent/50 bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="status"
        >
            <div className="flex flex-col gap-2 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Hand className="size-3.5 text-accent" strokeWidth={1.75} />
                    <Eyebrow>Waiting for you{wait.host ? ` on ${wait.host}` : ""}</Eyebrow>
                </header>
                <p className="font-heading text-[17px] italic leading-snug text-foreground">{wait.text}</p>
                <p className="text-[12.5px] leading-snug text-muted-foreground">
                    Sloth continues on its own once you're done.{" "}
                    <button
                        type="button"
                        onClick={() => showUserWait(conversationId)}
                        className="font-medium text-foreground underline underline-offset-2 hover:text-accent"
                    >
                        Show me where
                    </button>
                </p>
            </div>
        </div>
    );
}
