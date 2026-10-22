import {useState} from "react";
import {Check, Loader2, Lock, LogIn} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {ProviderLogo} from "./ProviderLogo";
import {signIn, type Account, type SlothModelInfo} from "@/src/settings/lib/account";
import {reconcileSelectedModel} from "../lib/modelFallback";
import {formatCredits, usdToCredits} from "../lib/pricing";

/** Shown before the account response arrives (first open, offline). */
const FALLBACK: Record<string, Pick<SlothModelInfo, "name" | "tagline">> = {
    "sloth-mini": {name: "Sloth Mini", tagline: "Quick and light for everyday browsing"},
    "sloth-pro": {name: "Sloth Pro", tagline: "Superior performance for most tasks"},
    "sloth-max": {name: "Sloth Max", tagline: "Deepest reasoning for long, tricky jobs"},
};

const TIER: Record<string, number> = {"sloth-mini": 1, "sloth-pro": 2, "sloth-max": 3};

export function slothModelInfo(modelId: string, account: Account | null) {
    const live = account?.models.find((m) => m.id === modelId);
    return {
        ...FALLBACK[modelId],
        ...live,
        // Unknown until the account loads; the server has the final say either way.
        locked: live ? !live.available : false,
    };
}

/** Three rising bars: how much model this is. */
export function TierGlyph({modelId, className}: { modelId: string; className?: string }) {
    const tier = TIER[modelId] ?? 1;
    return (
        <span aria-hidden className={cn("flex h-3.5 items-end gap-[2px]", className)}>
            {[1, 2, 3].map((bar) => (
                <span
                    key={bar}
                    className={cn(
                        "w-[3px] rounded-full transition-colors",
                        bar <= tier ? "bg-accent" : "bg-border",
                    )}
                    style={{height: `${4 + bar * 3}px`}}
                />
            ))}
        </span>
    );
}

/** One Sloth model in the picker list. */
export function SlothModelRow({modelId, account, selected, highlighted, index, onSelect, onHover}: {
    modelId: string;
    account: Account | null;
    selected: boolean;
    highlighted: boolean;
    index: number;
    onSelect: () => void;
    onHover: () => void;
}) {
    const info = slothModelInfo(modelId, account);
    return (
        <button
            type="button"
            role="option"
            aria-selected={selected}
            aria-disabled={info.locked || undefined}
            data-index={index}
            onClick={onSelect}
            onMouseMove={onHover}
            className={cn(
                "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left outline-none transition-colors",
                info.locked ? "cursor-not-allowed" : "cursor-pointer",
                highlighted && "bg-muted",
            )}
        >
            <TierGlyph modelId={modelId} className={cn(info.locked && "opacity-50")}/>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                    <span className={cn("truncate text-[13px] font-medium", info.locked ? "text-muted-foreground" : "text-foreground")}>
                        {info.name}
                    </span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{info.tagline}</div>
            </div>
            {info.locked ? (
                <span className="flex shrink-0 items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-1.5 py-px font-mono text-[9px] uppercase tracking-[.1em] text-accent">
                    <Lock className="size-2.5" strokeWidth={2}/>
                    Pro
                </span>
            ) : selected && (
                <Check className="size-3.5 shrink-0 text-accent" strokeWidth={2}/>
            )}
        </button>
    );
}

/** Plan name and this month's spend against its credit. */
export function SlothUsageMeter({account, className}: { account: Account; className?: string }) {
    const {spentUsd, creditUsd, periodEnd} = account.usage;
    const share = creditUsd > 0 ? Math.min(1, spentUsd / creditUsd) : 1;
    const renews = new Date(periodEnd).toLocaleDateString(undefined, {month: "short", day: "numeric"});
    return (
        <div className={className}>
            <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">
                    <span className="tabular-nums text-foreground">{usdToCredits(spentUsd).toLocaleString("en-US", {maximumFractionDigits: 2})}</span> of {formatCredits(creditUsd)} used
                </span>
                <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-muted-foreground">Renews {renews}</span>
            </div>
            <div
                role="meter"
                aria-label="Monthly credit used"
                aria-valuemin={0}
                aria-valuemax={usdToCredits(creditUsd)}
                aria-valuenow={usdToCredits(Math.min(spentUsd, creditUsd))}
                className="mt-1.5 h-1 overflow-hidden rounded-full bg-border"
            >
                <div
                    className={cn("h-full rounded-full transition-[width] duration-500 ease-out", share >= .9 ? "bg-destructive" : "bg-accent")}
                    style={{width: `${Math.max(share * 100, spentUsd > 0 ? 2 : 0)}%`}}
                />
            </div>
        </div>
    );
}

export function PlanBadge({account}: { account: Account }) {
    const paid = account.plan.id !== "free";
    return (
        <span className={cn(
            "rounded-full px-1.5 py-px font-mono text-[9px] uppercase tracking-[.1em]",
            paid ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground",
        )}>
            {account.plan.name}
        </span>
    );
}

/** Google sign-in, with its own pending and error states. */
export function useSlothSignIn(onSignedIn?: (account: Account | null) => void) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const start = async () => {
        setPending(true);
        setError(null);
        try {
            // Not `onSignedIn?.(await signIn())`: an optional call skips its arguments when
            // there is no callback, so Settings (which passes none) would never sign in.
            const account = await signIn();
            // A BYOK model already in use stays; otherwise this lands on the plan's default.
            await reconcileSelectedModel();
            onSignedIn?.(account);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn("[Tampersloth] Google sign-in failed", e);
            // Chrome reports a closed consent window and a refused OAuth client alike as
            // "did not approve", so say what happened rather than staying silent.
            setError(/did not approve/i.test(message)
                ? `Google didn't finish signing you in (${message.replace(/\.$/, "")}). Try again, and allow access when Google asks.`
                : message);
        } finally {
            setPending(false);
        }
    };
    return {pending, error, start};
}

/** The empty Sloth pane: what you get, and one button to get it. */
export function SlothSignInCard({onSignedIn}: { onSignedIn: (account: Account | null) => void }) {
    const {pending, error, start} = useSlothSignIn(onSignedIn);
    return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 pb-3 text-center">
            <div className="relative mb-1">
                <div aria-hidden className="absolute inset-0 -m-2 rounded-full bg-accent/15 blur-md"/>
                <div className="relative flex size-11 items-center justify-center rounded-full border border-accent/25 bg-background text-foreground shadow-sm">
                    <ProviderLogo provider="tampersloth" className="size-6"/>
                </div>
            </div>
            <div className="font-heading text-[19px] leading-tight text-foreground">
                Sloth <em>models</em>
            </div>
            <div className="text-[11.5px] leading-relaxed text-muted-foreground">
                Mini, Pro and Max, with no API key to manage. Free includes monthly credit.
            </div>
            <Button type="button" size="sm" className="mt-1" onClick={start} disabled={pending}>
                {pending ? <Loader2 className="animate-spin" strokeWidth={1.75}/> : <LogIn strokeWidth={1.75}/>}
                {pending ? "Waiting for Google…" : "Continue with Google"}
            </Button>
            {error && <div role="alert" className="text-[11px] leading-snug text-destructive">{error}</div>}
        </div>
    );
}
