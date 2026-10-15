import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Coins, Copy, CornerDownLeft, Hash, Mic, MousePointerSquareDashed, PencilLine, Plus, Sigma } from "lucide-react";
import { CursorGlyph } from "./brand";
import { LivingDots, SidePanel } from "./panel/Panel";
import { drawStrokes, prefersReducedMotion, setCursor } from "../lib/pen";
import { sketchScribble } from "../lib/sketch";
import "../styles/toolbox.css";

function Card({ className = "", visual, title, children, delay = 0 }: { className?: string; visual: ReactNode; title: ReactNode; children: ReactNode; delay?: number }) {
  // A soft sage spotlight follows the pointer across the card.
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };
  return (
    <article className={`tb-card ${className}`} onPointerMove={onMove} data-reveal style={{ ["--d" as string]: `${delay}ms` }}>
      <div className="tb-visual">{visual}</div>
      <div className="tb-copy">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </article>
  );
}

/** Runs `tick` on an interval while the element is on screen. */
function useOnScreenInterval(ref: RefObject<HTMLElement | null>, ms: number, tick: () => void) {
  const saved = useRef(tick);
  saved.current = tick;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let id = 0;
    const io = new IntersectionObserver(([e]) => {
      window.clearInterval(id);
      if (e.isIntersecting && !prefersReducedMotion()) id = window.setInterval(() => saved.current(), ms);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearInterval(id);
    };
  }, [ref, ms]);
}

// Picker hover tag text, as pickerOverlay.ts describes an element: tag, then #id or .class.
const PICKS = [
  { tag: "button", detail: ".cta", x: 30, y: 62, w: 34, h: 13 },
  { tag: "h1", detail: ".headline", x: 8, y: 24, w: 62, h: 22 },
  { tag: "img", detail: "#product", x: 72, y: 24, w: 22, h: 52 },
  { tag: "a", detail: ".nav-link", x: 62, y: 6, w: 10, h: 7 },
  { tag: "div", detail: ".price-card", x: 8, y: 80, w: 28, h: 15 },
];

function PickerVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  useOnScreenInterval(ref, 1700, () => setI((n) => (n + 1) % PICKS.length));
  const p = PICKS[i];
  return (
    <div ref={ref} className="pick">
      <div className="pick-page">
        <div className="pk-nav">
          <i className="pk-logo" />
          <span>
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="pk-h1">
          <i />
          <i />
        </div>
        <div className="pk-btn" />
        <div className="pk-img" />
        <div className="pk-cards">
          <i />
          <i />
          <i />
        </div>
        <div className={`pick-box ${p.y < 15 ? "is-low" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` }}>
          <span className="pick-tag">
            <b>{p.tag}</b>
            {p.detail}
          </span>
        </div>
        <div className="pick-cross" style={{ left: `${p.x + p.w * 0.6}%`, top: `${p.y + p.h * 0.6}%` }} />
        <div className="pick-hint">Click an element to pick it · Esc to cancel</div>
      </div>
    </div>
  );
}

const SAY = "Summarize these invoices and draft a follow-up.";
/** The composer while dictating: transcript, live wave, mic on, and the status line. */
function DictationVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(0);
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 22 }, () => 0));
  useOnScreenInterval(ref, 90, () => {
    setN((v) => (v >= SAY.length + 24 ? 0 : v + 1));
    setBars((b) => [...b.slice(1), n < SAY.length ? 0.15 + Math.random() * 0.85 * Math.abs(Math.sin(Date.now() / 240)) : 0]);
  });
  const listening = n < SAY.length;
  const heard = SAY.slice(0, Math.min(n, SAY.length));
  // The last few words are still being heard: shown in italics until they settle.
  const cut = Math.max(0, heard.lastIndexOf(" ", heard.length - 8));
  return (
    <div ref={ref} className="dict ts-dark">
      <div className="sp-composer">
        <div className="sp-box">
          <div className="sp-input-row">
            <div className="sp-input">
              {heard ? (
                <>
                  {listening ? heard.slice(0, cut) : heard}
                  {listening && <span className="dict-interim">{heard.slice(cut)}</span>}
                </>
              ) : (
                <span className="dict-ph">Listening… start talking</span>
              )}
            </div>
            {listening && (
              <span className="dict-wave" aria-hidden>
                {bars.map((v, i) => (
                  <i key={i} style={{ height: `${2 + v * 16}px` }} />
                ))}
              </span>
            )}
            <span className="sp-icon-sm">
              <CornerDownLeft size={16} strokeWidth={1.75} />
            </span>
          </div>
        </div>
        <div className="sp-toolbar">
          <div className="sp-tools">
            <span className="sp-icon-xs">
              <Plus size={12} strokeWidth={1.75} />
            </span>
            <span className="sp-icon-xs">
              <MousePointerSquareDashed size={12} strokeWidth={1.5} />
            </span>
            <span className="sp-icon-xs">
              <PencilLine size={12} strokeWidth={1.5} />
            </span>
            <span className={`dict-mic ${listening ? "is-on" : ""}`}>
              <span className="sp-icon-xs">
                <Mic size={12} strokeWidth={1.75} />
              </span>
              <span className="sp-icon-xs sp-narrow">
                <ChevronDown size={12} strokeWidth={1.75} />
              </span>
            </span>
            {listening && (
              <span className="dict-status">
                <i />
                Listening · Enter sends · Esc stops
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DrawVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const ink = useRef<SVGSVGElement>(null);
  const cur = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    let ctrl = new AbortController();
    let loopId = 0;
    const loop = async () => {
      if (!alive || !ink.current || !cur.current) return;
      ctrl = new AbortController();
      ink.current.innerHTML = "";
      const w = el.clientWidth;
      const h = el.clientHeight;
      setCursor(cur.current, { x: w * 0.8, y: h * 0.2 });
      cur.current.classList.add("is-on");
      try {
        await drawStrokes(ink.current, sketchScribble({ x: w * 0.5, y: h * 0.5 }, Math.min(h * 0.22, w * 0.2), (Date.now() / 1000) | 0), {
          cursor: cur.current,
          signal: ctrl.signal,
          pace: 3.4,
        });
        loopId = window.setTimeout(loop, 2400);
      } catch {
        /* stopped */
      }
    };
    const io = new IntersectionObserver(([e]) => {
      window.clearTimeout(loopId);
      ctrl.abort();
      if (e.isIntersecting) void loop();
    });
    io.observe(el);
    return () => {
      alive = false;
      io.disconnect();
      ctrl.abort();
      window.clearTimeout(loopId);
    };
  }, []);
  return (
    <div ref={ref} className="draw">
      <div className="draw-text">
        <span>Free returns within</span>
        <b>30 days</b>
        <span>on every order.</span>
      </div>
      <svg ref={ink} className="ink-layer" aria-hidden />
      <div ref={cur} className="guide-cursor sloth">
        <div className="guide-cursor-glyph">
          <CursorGlyph />
        </div>
      </div>
    </div>
  );
}

function TabsVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [t, setT] = useState(0);
  useOnScreenInterval(ref, 1400, () => setT((v) => (v + 1) % 6));
  const tabs = [
    { site: "mail.example", chat: "Unsubscribe me from these", done: t >= 2 },
    { site: "flights.example", chat: "Cheapest Friday seat", done: t >= 4 },
    { site: "docs.example", chat: "Fix the headings", done: t >= 5 },
  ];
  return (
    <div ref={ref} className="tabs ts-dark">
      {tabs.map((tb, i) => (
        <div key={i} className="tabs-row" style={{ ["--i" as string]: i }}>
          <span className="tabs-favicon">{tb.site[0].toUpperCase()}</span>
          <span className="tabs-meta">
            <b>{tb.chat}</b>
            <small>{tb.site}</small>
          </span>
          {tb.done ? <Check className="tabs-check" size={14} strokeWidth={2} /> : <LivingDots />}
        </div>
      ))}
    </div>
  );
}

/** A finished reply's footer: time, tokens, and the coin toggle that switches to estimated cost. */
function CostVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const [cost, setCost] = useState(false);
  useOnScreenInterval(ref, 2600, () => setCost((c) => !c));
  return (
    <div ref={ref} className="cost ts-dark">
      <div className="cost-msg">
        <div className="sp-text">
          Done. I marked <strong>3 invoices</strong> as paid and sent the reminders.
        </div>
        <div className="cost-chips">
          <span className="cost-chip">
            <Copy size={14} strokeWidth={1.75} />
          </span>
          <span className="cost-chip">14s</span>
          <span key={String(cost)} className="cost-swap">
            {cost ? (
              <>
                <span className="cost-chip">
                  <ArrowUp size={14} strokeWidth={1.75} />
                  $0.0096
                </span>
                <span className="cost-chip">
                  <ArrowDown size={14} strokeWidth={1.75} />
                  $0.0062
                </span>
                <span className="cost-chip">
                  <Sigma size={14} strokeWidth={1.75} />
                  $0.0158
                </span>
              </>
            ) : (
              <>
                <span className="cost-chip">
                  <ArrowUp size={14} strokeWidth={1.75} />
                  3.2K
                </span>
                <span className="cost-chip">
                  <ArrowDown size={14} strokeWidth={1.75} />
                  412
                </span>
              </>
            )}
          </span>
          <span className="cost-chip is-btn">{cost ? <Hash size={14} strokeWidth={2} /> : <Coins size={14} strokeWidth={2} />}</span>
        </div>
      </div>
    </div>
  );
}

const TOOLS = [
  "evaluateJavaScript",
  "networkCapture",
  "accessibilityTree",
  "trustedInput",
  "deepDOM",
  "browserTabs",
  "takeMarkedScreenshot",
  "clipboard",
  "browserDownload",
  "browserNotify",
  "persistentStore",
  "siteRecipes",
];
function ToolsVisual() {
  return (
    <div className="tools">
      {TOOLS.map((t, i) => (
        <span key={t} className="tools-chip" style={{ ["--i" as string]: i }}>
          {t}
          <span className="paren">()</span>
        </span>
      ))}
    </div>
  );
}

/** The same empty side panel in the extension's dark and light themes. */
function ThemeVisual() {
  return (
    <div className="theme">
      {(["dark", "light"] as const).map((m) => (
        <div key={m} className={`theme-card is-${m}`}>
          <SidePanel theme={m} chrome={false} title={null} messages={[]} draft="" loading={false} />
        </div>
      ))}
    </div>
  );
}

export function Toolbox() {
  return (
    <section id="toolbox" className="toolbox container" aria-labelledby="toolbox-title">
      <div className="section-head">
        <div className="eyebrow tick" data-reveal>
          Toolbox
        </div>
        <h2 id="toolbox-title" data-reveal style={{ ["--d" as string]: "80ms" }}>
          Small sloth. <span className="accent">Deep toolbox.</span>
        </h2>
        <p className="lead" data-reveal style={{ ["--d" as string]: "160ms" }}>
          Everything lives in Chrome&rsquo;s side panel, one shortcut away. The fancy parts stay out of sight until a task needs them.
        </p>
      </div>

      <div className="tb-grid">
        <Card className="span-7" visual={<PickerVisual />} title="Point at anything">
          Pick an element and Sloth knows exactly what you mean. No more &ldquo;the blue button, top right, no, the other one.&rdquo;
        </Card>
        <Card className="span-5" visual={<DictationVisual />} title="Just say the word" delay={80}>
          Talk instead of typing. Your words land in the composer, ready to tweak before you send.
        </Card>
        <Card className="span-4" visual={<DrawVisual />} title="Draw on the page">
          Circle the thing you mean. Sloth sees your sketch along with the page.
        </Card>
        <Card className="span-4" visual={<TabsVisual />} title="Many chats, many tabs" delay={80}>
          Run several chats at once. Each borrows its own tab, so they never trip over each other.
        </Card>
        <Card className="span-4" visual={<CostVisual />} title="Every token, priced" delay={160}>
          Tokens and cost for every reply, so the bill never sneaks up on you.
        </Card>
        <Card className="span-8" visual={<ToolsVisual />} title="Power tools, when you want them">
          Raw JavaScript, network capture, shadow DOM, real mouse and keyboard input. Switched on only when the task calls for it.
        </Card>
        <Card className="span-4" visual={<ThemeVisual />} title="Light or dark" delay={80}>
          Follows your browser, or pick a side. Sloth looks good in both.
        </Card>
      </div>
    </section>
  );
}
