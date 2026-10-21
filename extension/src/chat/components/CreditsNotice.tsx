import { useNavigate } from "react-router-dom";
import { ArrowUpRight, KeyRound, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UPGRADE_URL, useAccount } from "@/src/settings/lib/account";
import { useCreditsExhausted } from "../lib/credits";
import { formatUsd } from "./SlothModels";
import { Eyebrow, CARD_DUR, CARD_EASE } from "./askUser/shared";

/** Shown when this chat's Sloth run was refused because the month's credit is spent. */
export function CreditsNotice({ conversationId }: { conversationId: string }) {
    const exhausted = useCreditsExhausted(conversationId);
    const { account } = useAccount();
    const navigate = useNavigate();

    if (!exhausted) return null;
    const renews = account && new Date(account.usage.periodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    // Pro is the top plan, so there is nothing to upgrade to.
    const canUpgrade = !account || account.plan.id === "free";

    return (
        <div
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="status"
        >
            <div className="flex flex-col gap-2 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Wallet className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <Eyebrow>Out of credits</Eyebrow>
                    {renews && (
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                            Renews {renews}
                        </span>
                    )}
                </header>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {account ? (
                        <>
                            You've used this month's{" "}
                            <span className="font-medium text-foreground">{formatUsd(account.usage.creditUsd)}</span> of{" "}
                            {account.plan.name} credit. {canUpgrade ? "Upgrade for more, or" : "Until it renews,"} switch
                            to a model on your own API key.
                        </>
                    ) : exhausted.message}
                </p>
                <div className="flex gap-1.5">
                    {canUpgrade && (
                        <Button size="xs" onClick={() => window.open(UPGRADE_URL, "_blank", "noopener")}>
                            Upgrade
                            <ArrowUpRight strokeWidth={1.75} />
                        </Button>
                    )}
                    <Button variant="outline" size="xs" onClick={() => navigate("/settings?tab=connections")}>
                        <KeyRound strokeWidth={1.75} />
                        Use your own key
                    </Button>
                </div>
            </div>
        </div>
    );
}
