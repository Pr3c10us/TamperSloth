import {useEffect, useState} from "react";
import {ArrowUpRight, Check, Loader2, Lock, LogIn, LogOut} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {ProviderLogo} from "@/src/chat/components/ProviderLogo";
import {PlanBadge, SlothUsageMeter, TierGlyph, useSlothSignIn} from "@/src/chat/components/SlothModels";
import {reconcileSelectedModel} from "@/src/chat/lib/modelFallback";
import {openPricing, refreshAccount, signOut} from "../lib/account";
import {useAccount} from "../lib/useAccount";
import {SettingsGroup, SettingsSection} from "./Section";

/** The TamperSloth account: sign in for Sloth models, then plan, credit and sign out. */
export function AccountCard() {
    const {loaded, signedIn, account} = useAccount();
    const {pending, error, start} = useSlothSignIn();
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => {
        if (signedIn) void refreshAccount();
    }, [signedIn]);

    const handleSignOut = async () => {
        setSigningOut(true);
        try {
            await signOut();
            // A Sloth selection would otherwise sit there unable to send.
            await reconcileSelectedModel();
        } finally {
            setSigningOut(false);
        }
    };

    if (!loaded) return null;

    return (
        <SettingsSection title="TamperSloth account" action={signedIn && account && <PlanBadge account={account}/>}>
            <SettingsGroup className="relative">
                {!signedIn ? (
                    <div className="relative overflow-hidden px-4 py-4">
                        <div aria-hidden className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-accent/10 blur-2xl"/>
                        <div className="relative flex items-start gap-3.5">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-accent/25 bg-background shadow-sm">
                                <ProviderLogo provider="tampersloth" className="size-6"/>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="font-heading text-[20px] leading-tight text-foreground">
                                    Sloth models, <em>no keys.</em>
                                </div>
                                <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                                    Sign in to use Sloth Mini, Pro and Max straight away. The free plan comes with monthly credit.
                                </p>
                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                                    {["sloth-mini", "sloth-pro", "sloth-max"].map((id) => (
                                        <span key={id} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                                            <TierGlyph modelId={id}/>
                                            {id === "sloth-mini" ? "Mini" : id === "sloth-pro" ? "Pro" : "Max"}
                                        </span>
                                    ))}
                                </div>
                                <Button size="sm" className="mt-3.5" onClick={start} disabled={pending}>
                                    {pending ? <Loader2 className="animate-spin" strokeWidth={1.75}/> : <LogIn strokeWidth={1.75}/>}
                                    {pending ? "Waiting for Google…" : "Continue with Google"}
                                </Button>
                                {error && <p role="alert" className="mt-2 text-[12px] text-destructive">{error}</p>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center gap-3 px-3.5 py-3">
                            <div className="relative shrink-0">
                                <div className="flex size-9 items-center justify-center rounded-full bg-accent font-medium text-[14px] uppercase text-accent-foreground">
                                    {account?.user.email.charAt(0) ?? "·"}
                                </div>
                                <span aria-hidden className="absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full border-2 border-card bg-background">
                                    <ProviderLogo provider="tampersloth" className="size-2.5"/>
                                </span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[13.5px] font-medium leading-snug text-foreground">
                                    {account?.user.email ?? "Signed in"}
                                </div>
                                <div className="truncate font-mono text-[11px] text-muted-foreground">
                                    {account ? `${account.plan.name} plan · ${account.plan.requestsPerMinute} requests/min` : "Loading plan…"}
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={signingOut}>
                                <LogOut strokeWidth={1.75}/>
                                Sign out
                            </Button>
                        </div>

                        {account && (
                            <>
                                <SlothUsageMeter account={account} className="px-3.5 py-3"/>
                                <div className="grid grid-cols-3 divide-x divide-muted">
                                    {account.models.map((m) => (
                                        <div key={m.id} className={cn("flex flex-col gap-1 px-3 py-2.5", !m.available && "opacity-60")}>
                                            <div className="flex items-center justify-between gap-1">
                                                <TierGlyph modelId={m.id}/>
                                                {m.available
                                                    ? <Check className="size-3 text-accent" strokeWidth={2.25}/>
                                                    : <Lock className="size-3 text-muted-foreground" strokeWidth={2}/>}
                                            </div>
                                            <div className="truncate text-[12.5px] font-medium text-foreground">{m.name}</div>
                                            <div className="truncate text-[10.5px] text-muted-foreground">{m.poweredBy}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                    <span className="text-[11.5px] text-muted-foreground">
                                        {account.plan.id === "free" ? "More credit and models on Go and Pro." : "Switch plans, update your card or cancel."}
                                    </span>
                                    <Button variant="outline" size="xs" onClick={() => void openPricing()}>
                                        {account.plan.id === "free" ? "Upgrade" : "Manage plan"}
                                        <ArrowUpRight strokeWidth={1.75}/>
                                    </Button>
                                </div>
                            </>
                        )}
                    </>
                )}
            </SettingsGroup>
        </SettingsSection>
    );
}
