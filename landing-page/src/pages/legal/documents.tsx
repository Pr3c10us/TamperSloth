import type { ReactNode } from "react";
import { SUPPORT_EMAIL } from "../../lib/site";

export type LegalSlug = "terms" | "privacy" | "refunds";

export type LegalDoc = {
  title: string;
  /** The italic tail of the heading. */
  accent: string;
  lead: string;
  updated: string;
  sections: { id: string; heading: string; body: ReactNode }[];
};

const UPDATED = "October 24, 2026";

const Mail = () => <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>;

export const DOCS: Record<LegalSlug, LegalDoc> = {
  terms: {
    title: "Terms of",
    accent: "service.",
    lead: "The agreement between you and TamperSloth when you install the extension, sign in, or buy a plan.",
    updated: UPDATED,
    sections: [
      {
        id: "agreement",
        heading: "Agreeing to these terms",
        body: (
          <>
            <p>
              These terms cover the TamperSloth Chrome extension, the Sloth models and the website at tampersloth.com
              (together, "TamperSloth", "we", "us"). By installing the extension, signing in or buying a plan, you agree
              to them. If you don't agree, don't use TamperSloth.
            </p>
            <p>You must be at least 16, or the age of digital consent where you live, to use TamperSloth.</p>
          </>
        ),
      },
      {
        id: "service",
        heading: "What TamperSloth does",
        body: (
          <>
            <p>
              TamperSloth is an AI agent in Chrome's side panel. It can read and act on the web pages you give it, explain
              how to do something on a page, and save user scripts that run on the sites you choose.
            </p>
            <p>
              You can use it with your own API key from a model provider, which is free, or sign in with Google to use
              Sloth models, which come with monthly credit on the Free, Go and Pro plans.
            </p>
          </>
        ),
      },
      {
        id: "account",
        heading: "Your account",
        body: (
          <p>
            Sloth models need an account, created when you sign in with Google. Keep your Google account secure; you're
            responsible for what happens under your TamperSloth account. Tell us at <Mail /> if you think someone else has
            used it.
          </p>
        ),
      },
      {
        id: "plans",
        heading: "Plans, billing and cancellation",
        body: (
          <>
            <p>
              Our order process is conducted by our online reseller Paddle.com. Paddle.com is the Merchant of Record for
              all our orders. Paddle provides all customer service inquiries and handles returns.
            </p>
            <p>
              Paid plans are monthly subscriptions, billed in advance and renewed automatically each month until you
              cancel. Prices are shown in US dollars on the <a href="/pricing">pricing page</a>; tax is added at checkout
              where it applies.
            </p>
            <ul>
              <li>Each plan includes a monthly amount of credit for Sloth models. Unused credit doesn't carry over to the next month, except as described on the pricing page when you upgrade.</li>
              <li>Upgrades are charged in full and start a new monthly period on the day you upgrade.</li>
              <li>Downgrades take effect at the start of your next billing period.</li>
              <li>You can cancel at any time from the billing portal linked on the pricing page. You keep your plan until the end of the period you've paid for, and you won't be charged again.</li>
            </ul>
            <p>
              Refunds are covered by our <a href="/refunds">refund policy</a>. We may change plan prices or what a plan
              includes; we'll tell you at least 30 days before a price change applies to you, and you can cancel before
              it does.
            </p>
          </>
        ),
      },
      {
        id: "use",
        heading: "Acceptable use",
        body: (
          <>
            <p>You agree not to use TamperSloth to:</p>
            <ul>
              <li>break the law or infringe anyone's rights, including by accessing accounts or data you're not allowed to;</li>
              <li>send spam, run fraud, or harass anyone;</li>
              <li>break the terms of the websites you automate, or overload them;</li>
              <li>create malware or get around security measures;</li>
              <li>abuse, resell or get around the limits of the Sloth models, or the usage policies of the model providers behind them.</li>
            </ul>
            <p>We may suspend or close accounts that break these rules.</p>
          </>
        ),
      },
      {
        id: "your-content",
        heading: "Your content and AI output",
        body: (
          <>
            <p>
              You own what you put into TamperSloth and what it produces for you, including the scripts it writes. AI
              output can be wrong. Check it before you rely on it, and review actions before Sloth takes them on
              accounts or pages that matter.
            </p>
            <p>
              You're responsible for the actions TamperSloth takes in your browser at your request. You can stop a run at
              any time.
            </p>
          </>
        ),
      },
      {
        id: "third-parties",
        heading: "Third-party services",
        body: (
          <p>
            When you use your own API key, your requests go to the provider you chose under that provider's terms.
            Sloth models are served by third-party model providers on our behalf. Sign-in uses Google, and payments use
            Paddle. Each has its own terms, and we aren't responsible for their services.
          </p>
        ),
      },
      {
        id: "ours",
        heading: "Our property",
        body: (
          <p>
            TamperSloth, its name, logo, website and software belong to us. These terms give you a personal,
            non-exclusive, non-transferable right to use them; they don't transfer any ownership.
          </p>
        ),
      },
      {
        id: "warranty",
        heading: "Disclaimers and liability",
        body: (
          <>
            <p>
              TamperSloth is provided "as is" and "as available". As far as the law allows, we make no warranties that it
              will be uninterrupted, error-free or fit for a particular purpose.
            </p>
            <p>
              As far as the law allows, we aren't liable for indirect or consequential losses, or for loss of data,
              profits or business. Our total liability for any claim is limited to the amount you paid us in the 12
              months before it. Nothing in these terms limits rights you have under consumer law that can't be excluded.
            </p>
          </>
        ),
      },
      {
        id: "ending",
        heading: "Ending your use",
        body: (
          <p>
            You can stop using TamperSloth at any time by uninstalling the extension, and ask us to delete your account
            at <Mail />. We may suspend or end access if you break these terms, or stop offering TamperSloth with
            reasonable notice; if we do so without cause, we'll refund the unused part of any paid period.
          </p>
        ),
      },
      {
        id: "changes",
        heading: "Changes to these terms",
        body: (
          <p>
            We may update these terms. We'll change the date at the top, and tell you in the extension or by email if a
            change materially affects you. If you keep using TamperSloth after a change takes effect, you accept it.
          </p>
        ),
      },
      {
        id: "contact",
        heading: "Contact",
        body: (
          <p>
            Questions about these terms: <Mail />.
          </p>
        ),
      },
    ],
  },

  privacy: {
    title: "Privacy",
    accent: "notice.",
    lead: "What TamperSloth collects, why, and what stays on your machine. The short version: as little as possible.",
    updated: UPDATED,
    sections: [
      {
        id: "summary",
        heading: "In short",
        body: (
          <ul>
            <li>Your API keys, chats, attachments and scripts are stored in your browser, not on our servers.</li>
            <li>If you sign in for Sloth models, we keep your email, your plan and how many tokens you've used, not what you said.</li>
            <li>Payments go through Paddle. We never see your card details.</li>
            <li>We don't sell your data, and we don't use it for advertising.</li>
          </ul>
        ),
      },
      {
        id: "browser",
        heading: "What stays in your browser",
        body: (
          <>
            <p>
              API keys, conversations, attachments, saved scripts and settings live in the extension's local storage in
              Chrome. We don't receive them. Uninstalling the extension removes them.
            </p>
            <p>
              When you use your own key, requests go straight from your browser to the provider you picked (for example
              Anthropic, OpenAI or Google), including any page content you ask Sloth to work with. That provider handles
              them under its own privacy policy.
            </p>
          </>
        ),
      },
      {
        id: "collect",
        heading: "What we collect",
        body: (
          <ul>
            <li>
              <strong>Account:</strong> when you sign in with Google, your email address and Google account ID.
            </li>
            <li>
              <strong>Usage:</strong> for each Sloth model request, the model used, token counts, cost, outcome and time.
              We use this for credit, limits and billing.
            </li>
            <li>
              <strong>Billing:</strong> your plan, subscription status and renewal dates, and the Paddle customer and
              subscription IDs. Paddle sends us notifications about your subscription, which can include your email,
              country and the amounts charged.
            </li>
            <li>
              <strong>Technical:</strong> IP addresses and request metadata, kept briefly for rate limiting, security
              and fixing problems.
            </li>
          </ul>
        ),
      },
      {
        id: "sloth-models",
        heading: "Sloth model requests",
        body: (
          <p>
            When you use a Sloth model, your messages, and any page content or attachments you include, pass through our
            server to the model provider that runs it (currently Anthropic) to produce the reply. We don't store the
            content of these requests or replies. The provider processes them under its commercial terms, which don't
            allow it to train models on them.
          </p>
        ),
      },
      {
        id: "why",
        heading: "Why we use it",
        body: (
          <ul>
            <li>To run your account and the Sloth models (to perform our contract with you).</li>
            <li>To bill you and keep records the law requires (a legal obligation).</li>
            <li>To prevent abuse, keep the service secure and fix problems (our legitimate interests).</li>
            <li>To answer you when you write to us.</li>
          </ul>
        ),
      },
      {
        id: "sharing",
        heading: "Who we share it with",
        body: (
          <>
            <p>Only the service providers we need to run TamperSloth:</p>
            <ul>
              <li><strong>Paddle</strong>, our merchant of record, for checkout, payments, tax and invoices.</li>
              <li><strong>Google</strong>, for sign-in.</li>
              <li><strong>Anthropic</strong>, to run Sloth models.</li>
              <li><strong>Cloudflare</strong> and our hosting providers, to serve the website and API.</li>
            </ul>
            <p>We may also disclose data if the law requires it. We don't sell personal data.</p>
          </>
        ),
      },
      {
        id: "website",
        heading: "This website",
        body: (
          <p>
            tampersloth.com doesn't use advertising or tracking cookies. The pricing page keeps a short-lived sign-in
            token in your browser's storage so it can show your plan. Paddle's checkout sets its own cookies when you
            open it.
          </p>
        ),
      },
      {
        id: "retention",
        heading: "How long we keep it",
        body: (
          <p>
            We keep your account and usage data while your account is open. When you ask us to delete your account, we
            cancel any active subscription and delete your account and usage records. Billing records may be kept by
            Paddle and by us for as long as tax and accounting law requires.
          </p>
        ),
      },
      {
        id: "rights",
        heading: "Your rights",
        body: (
          <p>
            Depending on where you live, you can ask to access, correct, export or delete your personal data, or object
            to how we use it. Write to <Mail /> from the email on your account and we'll respond within 30 days. You can
            also complain to your local data protection authority.
          </p>
        ),
      },
      {
        id: "transfers",
        heading: "International transfers",
        body: (
          <p>
            Our service providers may process data outside your country, including in the United States. Where the law
            requires it, these transfers are covered by safeguards such as standard contractual clauses.
          </p>
        ),
      },
      {
        id: "children",
        heading: "Children",
        body: <p>TamperSloth isn't meant for children under 16, and we don't knowingly collect their data.</p>,
      },
      {
        id: "changes",
        heading: "Changes and contact",
        body: (
          <p>
            We'll update the date at the top when this notice changes, and tell you directly about significant changes.
            Questions or requests: <Mail />.
          </p>
        ),
      },
    ],
  },

  refunds: {
    title: "Refund",
    accent: "policy.",
    lead: "If a plan isn't working out, you can get your money back within 14 days.",
    updated: UPDATED,
    sections: [
      {
        id: "guarantee",
        heading: "14-day refunds",
        body: (
          <>
            <p>
              If you're not happy with a paid plan, ask for a refund within 14 days of a payment and we'll refund that
              payment in full. This covers new subscriptions, renewals and upgrades. You don't need to give a reason.
            </p>
            <p>When a payment is refunded, the plan it paid for ends and your account returns to the Free plan.</p>
          </>
        ),
      },
      {
        id: "how",
        heading: "How to ask",
        body: (
          <p>
            Email <Mail /> from the address on your account, or reply to your Paddle receipt. You can also contact Paddle
            directly at <a href="https://paddle.net" target="_blank" rel="noreferrer">paddle.net</a>. Refunds go back to
            the original payment method, usually within 5 to 10 business days depending on your bank.
          </p>
        ),
      },
      {
        id: "after",
        heading: "After 14 days",
        body: (
          <p>
            Payments older than 14 days aren't refunded, but you can cancel at any time from the billing portal on the{" "}
            <a href="/pricing">pricing page</a>. You keep your plan until the end of the period you've paid for, and you
            won't be charged again.
          </p>
        ),
      },
      {
        id: "paddle",
        heading: "Who processes refunds",
        body: (
          <p>
            Paddle.com is the Merchant of Record for all our orders and processes refunds on our behalf. Your rights
            under Paddle's buyer terms and under consumer law where you live aren't affected by this policy.
          </p>
        ),
      },
      {
        id: "abuse",
        heading: "Fair use",
        body: (
          <p>
            We may decline refunds where an account has been used to break our <a href="/terms">terms</a>, or where
            refunds are being requested repeatedly to use paid plans for free.
          </p>
        ),
      },
    ],
  },
};
