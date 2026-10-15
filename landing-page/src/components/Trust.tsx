import { useState } from "react";
import { Icon } from "./brand";
import { AsciiSloth } from "./AsciiSloth";
import "../styles/trust.css";

const PROMISES = [
  {
    label: "Keys",
    title: "Stay on your machine",
    body: "API keys live in the extension’s local storage. Requests go from your browser to the provider you picked.",
  },
  {
    label: "Chats",
    title: "Stay in your browser",
    body: "Conversations and attachments are saved in your browser’s own storage.",
  },
  {
    label: "Scripts",
    title: "Run where you say",
    body: "Each saved script matches the sites you choose, and pauses with a click.",
  },
  {
    label: "Control",
    title: "Always in plain sight",
    body: "When Sloth drives a page through Chrome’s debugger, Chrome shows its own banner. Stop ends a run at any point.",
  },
];

export function Privacy() {
  return (
    <section className="privacy container" aria-labelledby="privacy-title">
      <div className="section-head">
        <div className="eyebrow tick" data-reveal>
          Privacy
        </div>
        <h2 id="privacy-title" data-reveal style={{ ["--d" as string]: "80ms" }}>
          Your keys. Your browser. <span className="accent">Your rules.</span>
        </h2>
      </div>
      <div className="promises">
        {PROMISES.map((p, i) => (
          <div key={p.label} className="promise" data-reveal style={{ ["--d" as string]: `${120 + i * 90}ms` }}>
            <span className="promise-label">
              <i /> {p.label}
            </span>
            <h3>{p.title}</h3>
            <p>{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const FAQS = [
  {
    q: "What does it cost?",
    a: "You bring an API key from Anthropic, OpenAI, Google, DeepSeek, Kimi or Grok and pay them for what you use. Sloth shows the tokens and cost of every reply as it goes, so there are no surprises.",
  },
  {
    q: "Which browsers does it work in?",
    a: "Chrome 138 or newer. It lives in Chrome’s side panel and works on regular web pages. Chrome doesn’t let extensions run on its own settings pages or the Web Store.",
  },
  {
    q: "Why does it ask me to allow user scripts?",
    a: "Saved scripts and raw JavaScript use Chrome’s user scripts feature. Turn on Allow User Scripts in the extension’s details page once and you’re set.",
  },
  {
    q: "Will it do things without asking?",
    a: "Sloth works in the tab it’s given and shows each step in the panel as it happens. Press Stop at any point to end the run. Rather do it yourself? Ask it to show you instead.",
  },
  {
    q: "Can I run more than one chat at once?",
    a: "Yes. Each chat borrows its own tab while it works, so several can run side by side without stepping on each other.",
  },
  {
    q: "Can I bring my own scripts?",
    a: "Yes. Ask Sloth to write one, or import a script you already have. Saved scripts run on the sites they match every time you visit.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section id="faq" className="faq container" aria-labelledby="faq-title">
      <div className="faq-grid">
        <div className="faq-side">
          <div className="eyebrow tick" data-reveal>
            FAQ
          </div>
          <h2 id="faq-title" data-reveal style={{ ["--d" as string]: "80ms" }}>
            Questions, <span className="accent">answered.</span>
          </h2>
          <div data-reveal style={{ ["--d" as string]: "240ms" }}>
            <AsciiSloth className="faq-ascii" />
          </div>
        </div>
        <div className="faq-list" data-reveal style={{ ["--d" as string]: "160ms" }}>
          {FAQS.map((f, i) => {
            const isOpen = open === i;
            return (
              <div key={f.q} className={`faq-item ${isOpen ? "is-open" : ""}`}>
                <h3>
                  <button aria-expanded={isOpen} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpen(isOpen ? null : i)}>
                    <span>{f.q}</span>
                    <span className="faq-icon" aria-hidden>
                      <Icon.plus />
                    </span>
                  </button>
                </h3>
                <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="faq-a">
                  <div>
                    <p>{f.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
