import { useNavigate } from "react-router-dom";
import { ArrowUpRight, CloudOff, CreditCard, Gauge, KeyRound, SlidersHorizontal, Wallet } from "lucide-react";
import { Button } from "@/ui/shadcn/button";
import { openPricing } from "@/account/account";
import { useAccount } from "@/account/useAccount";
import { useCreditsExhausted } from "@/agent/models/credits";
import { formatCredits } from "@/agent/models/pricing";
import { Eyebrow, CARD_DUR, CARD_EASE } from "@/pages/chat/cardParts";

const compactTokens = new Intl.NumberFormat("en-US", { notation: "compact" });

/**
 * Shown when this chat's run was stopped by a limit: a Sloth plan's monthly credit or per-run
 * token budget, the user's own run budget from Preferences (on any model), or Sloth models
 * being paused for everyone.
 */
export function CreditsNotice({ conversationId, sloth }: { conversationId: string; sloth: boolean }) {
    const exhausted = useCreditsExhausted(conversationId);
    const { account } = useAccount();
    const navigate = useNavigate();

    if (!exhausted) return null;
    if (exhausted.limit === "userBudget") return (
        <NoticeCard icon={SlidersHorizontal} title="Token budget reached">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Stopped at your{exhausted.budget ? <> <span className="font-medium text-foreground">{compactTokens.format(exhausted.budget)}</span>-token</> : ""} run
                budget. Send a message to continue.
            </p>
            <div className="flex gap-1.5">
                <Button variant="outline" size="xs" onClick={() => navigate("/settings?tab=preferences")}>
                    <SlidersHorizontal strokeWidth={1.75} />
                    Change budget
                </Button>
            </div>
        </NoticeCard>
    );
    if (!sloth) return null;
    if (exhausted.limit === "pastDue") return (
        <NoticeCard icon={CreditCard} title="Payment failed">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Your last payment didn't go through, so your Sloth credit is paused. Update your card to pick up where you
                left off, or switch to a model on your own API key meanwhile.
            </p>
            <div className="flex gap-1.5">
                <Button size="xs" onClick={() => void openPricing()}>
                    Update card
                    <ArrowUpRight strokeWidth={1.75} />
                </Button>
                <Button variant="outline" size="xs" onClick={() => navigate("/settings?tab=connections")}>
                    <KeyRound strokeWidth={1.75} />
                    Use your own key
                </Button>
            </div>
        </NoticeCard>
    );
    if (exhausted.limit === "unavailable") return (
        <NoticeCard icon={CloudOff} title="Model unavailable">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Sloth models aren't available at the moment. Try again later, or switch to a model on
                your own API key to keep going now.
            </p>
            <div className="flex gap-1.5">
                <Button variant="outline" size="xs" onClick={() => navigate("/settings?tab=connections")}>
                    <KeyRound strokeWidth={1.75} />
                    Use your own key
                </Button>
            </div>
        </NoticeCard>
    );
    const renews = account && new Date(account.usage.periodEnd).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    // Pro is the top plan, so there is nothing to upgrade to.
    const canUpgrade = !account || account.plan.id !== "pro";
    const credits = exhausted.limit === "credits" || exhausted.limit === "creditsLow";
    const Icon = credits ? Wallet : Gauge;
    const title = exhausted.limit === "creditsLow" ? "Not enough credit left" : credits ? "Out of credits"
        : exhausted.limit === "runBudget" ? "Run limit reached" : "Chat too long";
    // Sloth runs are metered in credits, so the run-limit cards never quote token counts.
    const aside = credits ? renews && `Renews ${renews}` : undefined;

    return (
        <NoticeCard icon={Icon} title={title} aside={aside || undefined}>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
                {!account || exhausted.limit === "creditsLow" ? exhausted.message : exhausted.limit === "runBudget" ? (
                    <>
                        This reply reached the {account.plan.name} plan's limit for one run. Send a message to pick up
                        where it stopped{canUpgrade ? ", or upgrade for longer runs." : "."}
                    </>
                ) : exhausted.limit === "runTooLong" ? (
                    <>
                        This chat is now longer than one run allows on the {account.plan.name} plan. Start a new
                        chat, {canUpgrade ? "upgrade, " : ""}or switch to a model on your own API key.
                    </>
                ) : (
                    <>
                        You've used this month's{" "}
                        <span className="font-medium text-foreground">{formatCredits(account.usage.creditUsd)}</span> on the{" "}
                        {account.plan.name} plan. {canUpgrade ? "Upgrade for more, or" : "Until it renews,"} switch
                        to a model on your own API key.
                    </>
                )}
            </p>
            <div className="flex gap-1.5">
                {canUpgrade && (
                    <Button size="xs" onClick={() => void openPricing()}>
                        Upgrade
                        <ArrowUpRight strokeWidth={1.75} />
                    </Button>
                )}
                <Button variant="outline" size="xs" onClick={() => navigate("/settings?tab=connections")}>
                    <KeyRound strokeWidth={1.75} />
                    Use your own key
                </Button>
            </div>
        </NoticeCard>
    );
}

function NoticeCard({ icon: Icon, title, aside, children }: {
    icon: typeof Wallet;
    title: string;
    aside?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="status"
        >
            <div className="flex flex-col gap-2 px-3 py-3">
                <header className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
                    <Eyebrow>{title}</Eyebrow>
                    {aside && (
                        <span className="ml-auto font-mono text-[10px] uppercase tracking-[.1em] text-muted-foreground">
                            {aside}
                        </span>
                    )}
                </header>
                {children}
            </div>
        </div>
    );
}
