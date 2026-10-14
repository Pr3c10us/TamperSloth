import { Hourglass, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openConversation, stopConversation, useChatTitle } from "../hooks/useAgent";
import { useTabWait } from "../lib/tabLease";
import { Eyebrow, CARD_DUR, CARD_EASE } from "./askUser/shared";

/** Shown while this chat's next page action waits for another chat to finish with the tab. */
export function TabWaitNotice({ conversationId }: { conversationId: string }) {
    const holderId = useTabWait(conversationId);
    const holderTitle = useChatTitle(holderId);
    if (!holderId) return null;

    return (
        <div
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="status"
        >
            <div className="flex flex-col gap-2 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Hourglass className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <Eyebrow>Waiting for the tab</Eyebrow>
                </header>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => { void openConversation(holderId); }}
                        title="Open that chat"
                        className="font-medium text-foreground underline underline-offset-2 hover:text-accent"
                    >
                        {holderTitle ?? "Another chat"}
                    </button>{" "}
                    is using this tab. This chat picks up where it left off once that one finishes.
                </p>
                <div>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => stopConversation(holderId)}
                        className="text-destructive hover:border-destructive hover:bg-destructive hover:text-white"
                    >
                        <Square strokeWidth={1.75} className="fill-current" />
                        Stop that chat
                    </Button>
                </div>
            </div>
        </div>
    );
}
