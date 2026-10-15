import { useSyncExternalStore } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { answerConfirmation, getPendingConfirmation, subscribeConfirmations } from "../lib/confirmBus";
import { Eyebrow, CARD_DUR, CARD_EASE } from "./askUser/shared";

/** An action held by safety screening, waiting for the user to allow or deny it. */
export function ActionConfirmOverlay({ conversationId }: { conversationId: string }) {
    const pending = useSyncExternalStore(
        subscribeConfirmations,
        () => getPendingConfirmation(conversationId),
        () => null,
    );
    if (!pending) return null;

    const Icon = pending.injection ? ShieldAlert : ShieldCheck;
    return (
        <div
            key={pending.id}
            className={cn(
                "border-t bg-card/95 backdrop-blur-sm",
                pending.injection ? "border-destructive/50" : "border-muted",
            )}
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="alertdialog"
            aria-modal="false"
            aria-labelledby={`confirm-${pending.id}`}
        >
            <div className="flex flex-col gap-2.5 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Icon
                        className={cn("size-3.5", pending.injection ? "text-destructive" : "text-muted-foreground")}
                        strokeWidth={1.75}
                    />
                    <Eyebrow className={pending.injection ? "text-destructive" : undefined}>
                        {pending.injection ? "Possible prompt injection" : "Approve this action?"}
                    </Eyebrow>
                </header>

                <p id={`confirm-${pending.id}`} className="font-heading text-[17px] italic leading-snug text-foreground">
                    {pending.title}
                </p>

                {pending.target && (
                    <p className="truncate rounded-md bg-muted px-2 py-1 font-mono text-[11px] text-muted-foreground" title={pending.target}>
                        {pending.target}
                    </p>
                )}

                <ul className="flex flex-col gap-1 text-[12.5px] leading-snug text-muted-foreground">
                    {pending.reasons.map((reason, i) => (
                        <li key={i} className="flex gap-1.5">
                            <span aria-hidden className="select-none">·</span>
                            <span>{reason}</span>
                        </li>
                    ))}
                    {pending.injection && (
                        <li className="flex gap-1.5 text-foreground">
                            <span aria-hidden className="select-none">·</span>
                            <span>Allow it only if this is what you asked Sloth to do.</span>
                        </li>
                    )}
                </ul>

                <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => answerConfirmation(conversationId, "deny")}>
                        Deny
                    </Button>
                    {pending.allowAll && (
                        <Button type="button" variant="outline" size="sm" onClick={() => answerConfirmation(conversationId, "allow-all")}>
                            Allow all for this task
                        </Button>
                    )}
                    <Button
                        type="button"
                        size="sm"
                        variant={pending.injection ? "destructive" : "default"}
                        onClick={() => answerConfirmation(conversationId, "allow")}
                    >
                        Allow
                    </Button>
                </div>
            </div>
        </div>
    );
}
