import { useCallback, useEffect, useRef, useState } from "react";
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { Nav } from "../components/Nav";
import { FooterBar } from "../components/FooterBar";
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
  getPlans,
  openPortal,
  type PaidPlanId,
  type PlanChangePreview,
  type PlanId,
  type PlanSummary,
  previewPlanChange,
  rememberBillingToken,
  resumePlan,
  storedBillingToken,
} from "../lib/billing";
import { askExtensionForBillingToken } from "../lib/extension";
import "../styles/pricing.css";

// Drawn until the server's plan list arrives, or if it can't be reached; GET /plans is the source.
const FALLBACK_PLANS: PlanSummary[] = [
  { id: "free", name: "Free", priceUsd: 0, credits: 5, models: ["Sloth Mini"], requestsPerMinute: 30, runTokenBudget: 500_000 },
  { id: "go", name: "Go", priceUsd: 5, credits: 40, models: ["Sloth Mini", "Sloth Pro"], requestsPerMinute: 60, runTokenBudget: 2_000_000 },
  { id: "pro", name: "Pro", priceUsd: 20, credits: 200, models: ["Sloth Mini", "Sloth Pro", "Sloth Max"], requestsPerMinute: 120, runTokenBudget: 0 },
];

const PITCH: Record<PlanId, string> = {
  free: "Try Sloth models without a key.",
  go: "For a few runs most days.",
  pro: "Every model, no run limit.",
};

const RANK: Record<PlanId, number> = { free: 0, go: 1, pro: 2 };

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
// Paddle counts these currencies in whole units; the rest in cents.
const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP"]);

function features(plan: PlanSummary): string[] {
  const models = plan.models.length > 1 ? `${plan.models.slice(0, -1).join(", ")} and ${plan.models.at(-1)}` : plan.models[0] ?? "";
  return [
    `${plan.credits.toLocaleString("en-US")} credits every month`,
    models,
    `${plan.requestsPerMinute} requests a minute`,
    plan.runTokenBudget ? `Runs up to ${compact.format(plan.runTokenBudget)} tokens` : "No limit on run length",
  ];
}

function money(amountMinor: number, currency: string): string {
  const amount = ZERO_DECIMAL.has(currency) ? amountMinor : amountMinor / 100;
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}

function day(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric" }) : "the end of this period";
}

type Notice = { tone: "info" | "success" | "error"; text: string };
type Review = { plan: PaidPlanId; preview: PlanChangePreview };
type Action = { label: string; run?: () => void; href?: string; primary?: boolean; note?: string };

export function Pricing() {
  const [plans, setPlans] = useState<PlanSummary[]>(FALLBACK_PLANS);
  const [token, setToken] = useState<string | null>(() => storedBillingToken());
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  // After a payment or a confirmed change, until the server shows it, so nothing can be bought twice.
  const [locked, setLocked] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const tokenRef = useRef(token);
  const paddle = useRef<Paddle | null>(null);
  // The plan whose checkout is open, for Paddle's completion event.
  const pendingPlan = useRef<PaidPlanId | null>(null);
  // The plan a visitor chose before the extension signed them in; acted on once billing loads.
  const chosenPlan = useRef<PaidPlanId | null>(null);

  const planName = (id: PlanId | null) => plans.find((p) => p.id === id)?.name ?? id ?? "";

  useEffect(() => observeReveals(), []);

  useEffect(() => {
    getPlans().then((list) => list?.length && setPlans(list), () => {});
  }, []);

  const adopt = useCallback((next: string) => {
    rememberBillingToken(next);
    tokenRef.current = next;
    setToken(next);
  }, []);

  // A tab the extension opened gets a token without a click; any other tab waits for one.
  useEffect(() => {
    if (tokenRef.current) return;
    void askExtensionForBillingToken(4000).then((reply) => {
      if (reply?.ok) adopt(reply.token);
    });
  }, [adopt]);

  const fail = useCallback((error: unknown) => {
    if (error instanceof BillingError && error.expired) {
      forgetBillingToken();
      tokenRef.current = null;
      setToken(null);
      setBilling(null);
      setNotice({ tone: "error", text: "Your sign-in for this page expired. Press Upgrade again to continue." });
      return;
    }
    setNotice({ tone: "error", text: error instanceof Error ? error.message : String(error) });
  }, []);

  /** Runs a billing call, renewing the 30-minute token through the extension once if it ran out. */
  const authed = useCallback(
    async <T,>(request: (token: string) => Promise<T>): Promise<T> => {
      const current = tokenRef.current;
      if (!current) throw new BillingError("Press Upgrade to sign in.", 401);
      try {
        return await request(current);
      } catch (error) {
        if (!(error instanceof BillingError) || !error.expired) throw error;
        const reply = await askExtensionForBillingToken();
        if (!reply?.ok) throw error;
        adopt(reply.token);
        return await request(reply.token);
      }
    },
    [adopt],
  );

  useEffect(() => {
    if (!token) return;
    authed(getBilling).then(setBilling, fail);
  }, [token, authed, fail]);

  /**
   * Webhooks land a moment after Paddle is done, so wait for the server to show
   * the change. The payment already went through, so a slow server isn't an error.
   */
  const settle = useCallback(
    async (done: (billing: Billing) => boolean, success: string) => {
      setLocked(true);
      try {
        for (let i = 0; i < 15; i++) {
          const next = await authed(getBilling).catch(() => null);
          if (next) setBilling(next);
          if (next && done(next)) {
            setNotice({ tone: "success", text: success });
            return;
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        setNotice({ tone: "info", text: "Done on Paddle's side. Your plan here updates within a minute; refresh to check." });
      } finally {
        setLocked(false);
      }
    },
    [authed],
  );

  const loadPaddle = async (): Promise<Paddle> => {
    if (paddle.current) return paddle.current;
    const instance = await initializePaddle({
      environment: PADDLE_ENV,
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (event) => {
        const plan = pendingPlan.current;
        if (event.name !== "checkout.completed" || !plan) return;
        pendingPlan.current = null;
        setNotice({ tone: "info", text: `Payment received. Setting up your ${planName(plan)} plan…` });
        void settle((b) => b.plan === plan, `You're on ${planName(plan)}. Your new credit is ready in the extension.`);
      },
    });
    if (!instance) throw new Error("Checkout couldn't load. Turn off any blocker for paddle.com and try again.");
    paddle.current = instance;
    return instance;
  };

  const subscribe = async (plan: PaidPlanId) => {
    setBusy(plan);
    setNotice(null);
    try {
      const [{ transactionId }, checkout] = await Promise.all([authed((t) => createCheckout(t, plan)), loadPaddle()]);
      pendingPlan.current = plan;
      checkout.Checkout.open({ transactionId, settings: { displayMode: "overlay", theme: "dark" } });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  /** What a switch costs and when it applies, before anything is charged. */
  const startReview = async (plan: PaidPlanId) => {
    setBusy(plan);
    setNotice(null);
    try {
      const preview = await authed((t) => previewPlanChange(t, plan));
      setReview({ plan, preview });
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const confirmReview = async () => {
    if (!review) return;
    const { plan, preview } = review;
    setBusy(plan);
    setNotice(null);
    try {
      await authed((t) => changePlan(t, plan, preview.confirmToken));
      setReview(null);
      if (preview.kind === "upgrade") {
        await settle((b) => b.plan === plan, `You're on ${planName(plan)}. Your new credit is ready in the extension.`);
      } else if (preview.kind === "downgrade") {
        await settle((b) => b.scheduledPlan === plan, `You'll move to ${planName(plan)} on ${day(preview.effectiveAt)}.`);
      } else {
        await settle((b) => b.scheduledPlan === null, `You're staying on ${planName(plan)}.`);
      }
    } catch (error) {
      setReview(null);
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  const manage = async (plan: PlanId) => {
    setBusy(plan);
    setNotice(null);
    try {
      const { url } = await authed(openPortal);
      location.assign(url);
    } catch (error) {
      fail(error);
      setBusy(null);
    }
  };

  const resume = async (plan: PlanId) => {
    setBusy(plan);
    setNotice(null);
    try {
      await authed(resumePlan);
      await settle((b) => !b.cancelAtPeriodEnd, `Your ${planName(plan)} plan will renew as before.`);
    } catch (error) {
      fail(error);
    } finally {
      setBusy(null);
    }
  };

  /** Signs the page in through the installed extension, or sends the visitor to install it. */
  const upgradeViaExtension = async (plan: PaidPlanId) => {
    setBusy(plan);
    setNotice(null);
    const reply = await askExtensionForBillingToken();
    if (!reply) {
      location.assign(INSTALL_URL);
      return;
    }
    setBusy(null);
    if (reply.ok) {
      chosenPlan.current = plan;
      adopt(reply.token);
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

  // Carries on with the plan picked before signing in: checkout from Free, or a reviewed switch.
  useEffect(() => {
    const plan = chosenPlan.current;
    if (!billing || !plan) return;
    chosenPlan.current = null;
    if (billing.status === "past_due" || billing.plan === plan) return;
    if (billing.plan === "free") {
      if (PADDLE_CLIENT_TOKEN) void subscribe(plan);
    } else if (billing.scheduledPlan !== plan) {
      void startReview(plan);
    }
  }, [billing]);

  const action = (tier: PlanSummary): Action => {
    if (!token) {
      if (tier.id === "free") return { label: "Add to Chrome", href: INSTALL_URL };
      const paid = tier.id;
      return { label: `Upgrade to ${tier.name}`, run: () => void upgradeViaExtension(paid), primary: true };
    }
    if (!billing) return { label: "Loading…" };
    const current = billing.plan;
    const ends = day(billing.currentPeriodEnd);

    if (billing.status === "past_due") {
      if (tier.id === current) {
        return { label: "Update card", run: () => void manage(tier.id), primary: true, note: "Your last payment didn't go through, so Sloth credit is paused until it does." };
      }
      return { label: tier.id === "free" ? "Downgrade" : `Switch to ${tier.name}` };
    }
    if (tier.id === current) {
      if (current === "free") return { label: "Current plan" };
      if (billing.cancelAtPeriodEnd) {
        return { label: "Resume plan", run: () => void resume(tier.id), primary: true, note: `Canceled; it ends ${ends}. Resume to keep it.` };
      }
      if (billing.scheduledPlan) {
        const kept = current;
        return { label: `Keep ${tier.name}`, run: () => void startReview(kept), primary: true, note: `Moves to ${planName(billing.scheduledPlan)} on ${ends}.` };
      }
      return { label: "Manage billing", run: () => void manage(tier.id), note: `Renews ${ends}.` };
    }
    if (tier.id === "free") {
      if (billing.cancelAtPeriodEnd) return { label: `Free from ${ends}` };
      return { label: "Downgrade", run: () => void manage(tier.id), note: "Cancel in the billing portal; you keep your plan until it ends." };
    }
    const paid = tier.id;
    if (current === "free") {
      if (!PADDLE_CLIENT_TOKEN) return { label: "Checkout isn't set up" };
      return { label: `Get ${tier.name}`, run: () => void subscribe(paid), primary: true };
    }
    if (billing.scheduledPlan === paid) return { label: `Starts ${ends}`, note: "Nothing is charged until then." };
    return { label: `Switch to ${tier.name}`, run: () => void startReview(paid), primary: RANK[paid] > RANK[current] };
  };

  const reviewLines = ({ plan, preview }: Review): string[] => {
    const name = planName(plan);
    if (preview.kind === "upgrade") {
      return [
        preview.chargeToday
          ? `${money(preview.chargeToday.amountMinor, preview.chargeToday.currency)} is charged today, a full month of ${name}.`
          : `A full month of ${name} starts today.`,
        preview.credits
          ? `Your ${preview.credits.plan.toLocaleString("en-US")} ${name} credits start now` +
            (preview.credits.carriedOver > 0 ? `, plus the ${preview.credits.carriedOver.toLocaleString("en-US")} credits you haven't used yet.` : ".")
          : "",
        "It renews a month from today.",
      ].filter(Boolean);
    }
    if (preview.kind === "downgrade") {
      return [
        `You keep ${planName(billing?.plan ?? null)} until ${day(preview.effectiveAt)}, then move to ${name}.`,
        "Nothing is charged or refunded today.",
      ];
    }
    return [`Your move to ${planName(billing?.scheduledPlan ?? null)} is called off and you stay on ${name}.`, "Nothing is charged today."];
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
              Signed in as <strong>{billing.email}</strong> · {planName(billing.plan)} plan
              {billing.status === "past_due" && <span className="pricing-warn"> · payment failed, update your card</span>}
            </p>
          )}
          {notice && <p className={`pricing-notice is-${notice.tone}`}>{notice.text}</p>}
        </div>

        <div className="tiers">
          {plans.map((tier, i) => {
            const a = action(tier);
            const current = billing?.plan === tier.id;
            const disabled = (!a.run && !a.href) || busy !== null || locked;
            const reviewing = review?.plan === tier.id ? review : null;
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
                  <span className="tier-amount">${tier.priceUsd}</span>
                  <span className="tier-per">{tier.priceUsd ? "/ month" : "forever"}</span>
                </p>
                <p className="tier-pitch">{PITCH[tier.id]}</p>
                <ul className="tier-features">
                  {features(tier).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <div className="tier-action">
                  {reviewing ? (
                    <div className="tier-review" role="group" aria-label={`Confirm switching to ${tier.name}`}>
                      {reviewLines(reviewing).map((line) => (
                        <p key={line}>{line}</p>
                      ))}
                      <div className="tier-review-buttons">
                        <button type="button" className="btn btn-primary" onClick={() => void confirmReview()} disabled={busy !== null}>
                          <span>{busy === tier.id ? "One moment…" : "Confirm"}</span>
                          <span className="btn-icon">
                            <ArrowIcon />
                          </span>
                        </button>
                        <button type="button" className="btn btn-ghost" onClick={() => setReview(null)} disabled={busy !== null}>
                          <span>Back</span>
                        </button>
                      </div>
                    </div>
                  ) : a.href && !disabled ? (
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
                  {!reviewing && a.note && <p className="tier-note">{a.note}</p>}
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
              opens checkout for that account. Upgrade in the extension's Settings opens this page signed in. Not
              installed yet? Upgrade takes you to the Chrome Web Store first.
            </p>
          </section>
        )}

        <p className="pricing-fine">
          Prices in US dollars; tax is added at checkout where it applies. Payments are handled by Paddle, our merchant of
          record. Upgrades are charged in full and start a new month on the day you upgrade, with your unused credit
          carried over; downgrades start at your next renewal. Unused credit doesn't carry over between months. Any
          payment can be refunded within 14 days; see the <a href="/refunds">refund policy</a>. By subscribing you agree
          to our <a href="/terms">terms</a> and <a href="/privacy">privacy notice</a>.
        </p>
      </main>
      <FooterBar page="pricing" />
      <div className="grain" aria-hidden />
    </>
  );
}
