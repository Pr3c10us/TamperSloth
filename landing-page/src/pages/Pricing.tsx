import { useCallback, useEffect, useRef, useState } from "react";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Nav } from "../components/Nav";
import { ArrowIcon } from "../components/brand";
import { observeReveals } from "../lib/reveal";
import { INSTALL_URL, PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "../lib/site";
import {
  type Billing,
  BillingError,
  changePlan,
  createCheckout,
  forgetBillingToken,
  getBilling,
  openPortal,
  type PlanId,
  rememberBillingToken,
  takeBillingToken,
} from "../lib/billing";
import { askExtensionForBillingToken } from "../lib/extension";
import "../styles/pricing.css";

type Tier = {
  id: PlanId;
  name: string;
  price: number;
  pitch: string;
  features: string[];
};

// Mirrors PLANS in server/src/internals/domain/plan; credits are USD × 10.
const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: 0,
    pitch: "Try Sloth models without a key.",
    features: ["5 credits every month", "Sloth Mini", "30 requests a minute", "Runs up to 500K tokens"],
  },
  {
    id: "go",
    name: "Go",
    price: 5,
    pitch: "For a few runs most days.",
    features: ["40 credits every month", "Sloth Mini and Sloth Pro", "60 requests a minute", "Runs up to 2M tokens"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 20,
    pitch: "Every model, no run limit.",
    features: ["200 credits every month", "Sloth Mini, Pro and Max", "120 requests a minute", "No limit on run length"],
  },
];

const PLAN_NAMES: Record<PlanId, string> = { free: "Free", go: "Go", pro: "Pro" };

type Notice = { tone: "info" | "success" | "error"; text: string };

export function Pricing() {
  const [token, setToken] = useState<string | null>(() => takeBillingToken());
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [confirming, setConfirming] = useState<PlanId | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const paddle = useRef<Paddle | null>(null);
  // The plan whose checkout is open, for Paddle's completion event.
  const pendingPlan = useRef<PlanId | null>(null);
  const settling = useRef(false);
  // The plan a visitor chose before the extension signed them in; checkout opens once billing loads.
  const chosenPlan = useRef<"go" | "pro" | null>(null);

  useEffect(() => observeReveals(), []);

  const fail = useCallback((error: unknown) => {
    if (error instanceof BillingError && error.expired) {
      forgetBillingToken();
      setToken(null);
      setBilling(null);
      setNotice({ tone: "error", text: "Your sign-in for this page expired. Press Upgrade again to continue." });
      return;
    }
    setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
  }, []);

  useEffect(() => {
    if (!token) return;
    getBilling(token).then(setBilling, fail);
  }, [token, fail]);

  /** Webhooks land a moment after Paddle says it's done, so wait for the server to show the new plan. */
  const settle = useCallback(
    async (plan: PlanId) => {
      if (!token || settling.current) return;
      settling.current = true;
      setNotice({ tone: "info", text: `Confirming your ${PLAN_NAMES[plan]} plan…` });
      try {
        for (let i = 0; i < 15; i++) {
          const next = await getBilling(token);
          setBilling(next);
          if (next.plan === plan) {
            setNotice({ tone: "success", text: `You're on ${PLAN_NAMES[plan]}. Your new credit is ready in the extension.` });
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        setNotice({ tone: "info", text: "Payment received. Your plan updates within a minute; refresh this page to check." });
      } catch (error) {
        fail(error);
      } finally {
        settling.current = false;
      }
    },
    [token, fail],
  );

  const loadPaddle = async (): Promise<Paddle> => {
    if (paddle.current) return paddle.current;
    const instance = await initializePaddle({
      environment: PADDLE_ENV,
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        if (event.name === "checkout.completed" && pendingPlan.current) void settle(pendingPlan.current);
      },
    });
    if (!instance) throw new Error("Checkout couldn't load. Turn off any blocker for paddle.com and try again.");
    paddle.current = instance;
    return instance;
  };

  const subscribe = async (plan: "go" | "pro") => {
    if (!token) return;
    setBusy(plan);
    setNotice(null);
    try {
      const [{ transactionId }, checkout] = await Promise.all([createCheckout(token, plan), loadPaddle()]);
      pendingPlan.current = plan;
      checkout.Checkout.open({ transactionId, settings: { displayMode: "overlay", theme: "dark" } });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const plan = chosenPlan.current;
    if (!billing || !plan) return;
    chosenPlan.current = null;
    // Already paying: the cards now offer a switch instead of a second subscription.
    if (billing.plan === "free" && PADDLE_CLIENT_TOKEN) void subscribe(plan);
  }, [billing]);

  /** Signs the page in through the installed extension, or sends the visitor to install it. */
  const upgradeViaExtension = async (plan: "go" | "pro") => {
    setBusy(plan);
    setNotice(null);
    const reply = await askExtensionForBillingToken();
    if (!reply) {
      location.assign(INSTALL_URL);
      return;
    }
    setBusy(null);
    if (reply.ok) {
      rememberBillingToken(reply.token);
      chosenPlan.current = plan;
      setToken(reply.token);
      return;
    }
    if (reply.reason === "signed-out") {
      setNotice({
        tone: "info",
        text: reply.panelOpened
          ? "Sign in to TamperSloth in the side panel that just opened, then press Upgrade again."
          : "Sign in to TamperSloth first: open it from Chrome's toolbar, go to Settings and continue with Google. Then press Upgrade again.",
      });
      return;
    }
    setNotice({ tone: "error", text: "TamperSloth couldn't reach its server. Try again in a moment." });
  };

  const switchPlan = async (plan: "go" | "pro") => {
    if (!token) return;
    if (confirming !== plan) {
      setConfirming(plan);
      return;
    }
    setConfirming(null);
    setBusy(plan);
    setNotice(null);
    try {
      await changePlan(token, plan);
      await settle(plan);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const manage = async (plan: PlanId) => {
    if (!token) return;
    setBusy(plan);
    setNotice(null);
    try {
      const { url } = await openPortal(token);
      location.assign(url);
    } catch (error) {
      fail(error);
      setBusy(null);
    }
  };

  const action = (tier: Tier): { label: string; run?: () => void; href?: string; primary?: boolean; note?: string } => {
    if (!token) {
      if (tier.id === "free") return { label: "Add to Chrome", href: INSTALL_URL };
      const paid = tier.id;
      return { label: `Upgrade to ${tier.name}`, run: () => void upgradeViaExtension(paid), primary: true };
    }
    if (!billing) return { label: "Loading…" };
    const current = billing.plan;
    if (tier.id === current) {
      if (current === "free") return { label: "Current plan" };
      return { label: "Manage billing", run: () => void manage(tier.id), note: renewalNote(billing) };
    }
    if (tier.id === "free") return { label: "Downgrade", run: () => void manage(tier.id), note: "Cancel in the billing portal; you keep your plan until the period ends." };
    const paid = tier.id;
    if (current === "free") {
      if (!PADDLE_CLIENT_TOKEN) return { label: "Checkout isn't set up" };
      return { label: `Get ${tier.name}`, run: () => void subscribe(paid), primary: true };
    }
    if (confirming === paid) {
      return {
        label: `Confirm switch to ${tier.name}`,
        run: () => void switchPlan(paid),
        primary: true,
        note: "The difference is charged or credited today, prorated.",
      };
    }
    return { label: `Switch to ${tier.name}`, run: () => void switchPlan(paid), primary: tier.id === "pro" };
  };

  return (
    <>
      <Nav page="pricing" />
      <main className="pricing container">
        <div className="section-head pricing-head">
          <div className="eyebrow tick" data-reveal>
            Pricing
          </div>
          <h1 data-reveal style={{ ["--d" as string]: "80ms" }}>
            Pick your <span className="accent">pace.</span>
          </h1>
          <p className="lead" data-reveal style={{ ["--d" as string]: "160ms" }}>
            With your own API key, TamperSloth is free and always will be. A plan adds Sloth models that need no key at
            all, paid monthly and cancellable whenever you like.
          </p>
        </div>

        <div className="pricing-status" data-reveal style={{ ["--d" as string]: "220ms" }} aria-live="polite">
          {token && billing && (
            <p className="pricing-account">
              Signed in as <strong>{billing.email}</strong> · {PLAN_NAMES[billing.plan]} plan
              {billing.status === "past_due" && <span className="pricing-warn"> · payment overdue, update your card</span>}
            </p>
          )}
          {notice && <p className={`pricing-notice is-${notice.tone}`}>{notice.text}</p>}
        </div>

        <div className="tiers">
          {TIERS.map((tier, i) => {
            const a = action(tier);
            const current = billing?.plan === tier.id;
            const disabled = (!a.run && !a.href) || busy !== null;
            return (
              <article
                key={tier.id}
                // Attributes, not classes: React rewriting className would drop the observer's is-in and hide the card.
                className="tier"
                data-featured={tier.id === "pro" || undefined}
                data-current={current || undefined}
                data-reveal
                style={{ ["--d" as string]: `${260 + i * 90}ms` }}
              >
                <header className="tier-head">
                  <h2>{tier.name}</h2>
                  {current ? <span className="tier-badge">Your plan</span> : tier.id === "pro" && <span className="tier-badge">Everything</span>}
                </header>
                <p className="tier-price">
                  <span className="tier-amount">${tier.price}</span>
                  <span className="tier-per">{tier.price ? "/ month" : "forever"}</span>
                </p>
                <p className="tier-pitch">{tier.pitch}</p>
                <ul className="tier-features">
                  {tier.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <div className="tier-action">
                  {a.href && !disabled ? (
                    <a
                      className={`btn ${tier.id === "free" ? "btn-ghost" : "btn-primary"}`}
                      href={a.href}
                      {...(a.href.startsWith("http") && { target: "_blank", rel: "noreferrer" })}
                    >
                      <span>{a.label}</span>
                      {tier.id !== "free" && (
                        <span className="btn-icon">
                          <ArrowIcon />
                        </span>
                      )}
                    </a>
                  ) : (
                    <button
                      type="button"
                      className={`btn ${a.primary ? "btn-primary" : "btn-ghost"}`}
                      onClick={a.run}
                      disabled={disabled}
                    >
                      <span>{busy === tier.id ? "One moment…" : a.label}</span>
                      {a.primary && (
                        <span className="btn-icon">
                          <ArrowIcon />
                        </span>
                      )}
                    </button>
                  )}
                  {a.note && <p className="tier-note">{a.note}</p>}
                </div>
              </article>
            );
          })}
        </div>

        {!token && (
          <section id="how-to-upgrade" className="how-to" data-reveal>
            <h2>
              Your plan lives in <span className="accent">the extension.</span>
            </h2>
            <p>
              A plan belongs to the account you sign into in TamperSloth, so Upgrade asks the extension who you are and
              opens checkout for that account. Not installed yet? Upgrade takes you to the Chrome Web Store first; sign in
              from Settings in the side panel, then come back here.
            </p>
          </section>
        )}

        <p className="pricing-fine">
          Prices in US dollars; tax is added at checkout where it applies. Payments are handled by Paddle, our merchant of
          record. Unused credit doesn't carry over.
        </p>
      </main>
      <div className="grain" aria-hidden />
    </>
  );
}

function renewalNote(billing: Billing): string | undefined {
  if (!billing.currentPeriodEnd) return undefined;
  const date = new Date(billing.currentPeriodEnd).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  return billing.cancelAtPeriodEnd ? `Canceled; it ends ${date}.` : `Renews ${date}.`;
}
