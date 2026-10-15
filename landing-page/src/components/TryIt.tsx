import { useCallback, useEffect, useRef, useState } from "react";
import { GuideCursor, Icon, TypedTip } from "./brand";
import { SidePanel, type DemoMsg } from "./panel/Panel";
import { chatOps } from "./stage/Frame";
import { LockPill } from "./stage/LockPill";
import { Aborted, drawStrokes, moveCursor, prefersReducedMotion, setCursor, typeText, wait } from "../lib/pen";
import { sketchArrow, sketchEllipse, sketchRect, type Box } from "../lib/sketch";
import "../styles/tryit.css";

/*
 * A real walkthrough on the landing page, in the extension's light theme: the
 * visitor sends a prompt, Sloth runs waitForUserAction steps that draw on a
 * small settings screen, and each step waits for the visitor's own click.
 */

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
type Day = (typeof DAYS)[number];
type Target = "toggle" | "fri" | "save" | "send";

const PROMPT = "Show me how to send my newsletter every Friday.";

export function TryIt() {
  const stage = useRef<HTMLDivElement>(null);
  const ink = useRef<SVGSVGElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);
  const expect = useRef<{ target: Target; resolve: () => void } | null>(null);
  const redraw = useRef<(() => void) | null>(null);

  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [chat, setChat] = useState<{ msgs: DemoMsg[] }>({ msgs: [] });
  const [title, setTitle] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [tip, setTip] = useState<string | null>(null);
  const [lock, setLock] = useState<"guide" | null>(null);
  const [digest, setDigest] = useState(false);
  const [day, setDay] = useState<Day>("Mon");
  const [saved, setSaved] = useState(false);
  const live = useRef({ digest, day });
  live.current = { digest, day };

  const box = useCallback((t: Target): Box => {
    const root = stage.current!;
    const el = root.querySelector<HTMLElement>(`[data-tk="${t}"]`)!;
    const r = el.getBoundingClientRect();
    const o = root.getBoundingClientRect();
    return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height };
  }, []);

  const clearInk = () => {
    if (ink.current) ink.current.innerHTML = "";
    redraw.current = null;
  };

  /** Draw a guide, rest the cursor beside it, show its description. */
  const guide = useCallback(
    async (signal: AbortSignal, target: Target, label: string, shape: (b: Box) => string[], rest: (b: Box) => { x: number; y: number }, side: { left?: boolean; up?: boolean } = {}) => {
      const cur = cursor.current!;
      const layer = ink.current!;
      clearInk();
      setTip(null);
      const draw = async (instant: boolean) => {
        const b = box(target);
        if (instant) layer.innerHTML = "";
        await drawStrokes(layer, shape(b), { cursor: cur, signal, instant });
        if (instant) setCursor(cur, rest(b));
        else await moveCursor(cur, rest(b), signal, 380);
      };
      cur.classList.add("is-on");
      cur.classList.toggle("tip-left", !!side.left);
      cur.classList.toggle("tip-up", !!side.up);
      await draw(false);
      redraw.current = () => void draw(true).catch(() => {});
      setTip(label);
    },
    [box],
  );

  const waitFor = (signal: AbortSignal, target: Target) =>
    new Promise<void>((resolve, reject) => {
      expect.current = { target, resolve };
      signal.addEventListener("abort", () => reject(new Aborted()), { once: true });
    });

  const reset = useCallback(() => {
    ctrl.current?.abort();
    expect.current = null;
    clearInk();
    cursor.current?.classList.remove("is-on");
    setPhase("idle");
    setChat({ msgs: [] });
    setTitle(null);
    setTip(null);
    setLock(null);
    setDigest(false);
    setDay("Mon");
    setSaved(false);
    setDraft(PROMPT);
  }, []);

  useEffect(() => () => ctrl.current?.abort(), []);

  // Keep the drawings attached to their targets when the layout changes.
  useEffect(() => {
    const ro = new ResizeObserver(() => redraw.current?.());
    if (stage.current) ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);

  // When the section arrives: type the prompt, then point at the send button.
  const intro = useRef(false);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || intro.current) return;
        intro.current = true;
        const c = new AbortController();
        ctrl.current = c;
        void (async () => {
          try {
            await wait(400, c.signal);
            await typeText(PROMPT, setDraft, c.signal, 40);
            await wait(300, c.signal);
            setCursor(cursor.current!, { x: box("send").x - 140, y: box("send").y - 120 });
            await guide(
              c.signal,
              "send",
              "Press send to start",
              (b) => sketchEllipse(b, 31, 9),
              (b) => ({ x: b.x - 10, y: b.y + b.h + 6 }),
              { left: true },
            );
            expect.current = { target: "send", resolve: () => {} };
          } catch {
            /* reset or left */
          }
        })();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [box, guide]);

  const run = async () => {
    if (phase !== "idle" || !draft) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    const signal = c.signal;
    const ops = chatOps((f) => setChat((p) => ({ ...p, ...f(p) })));
    const cur = cursor.current!;
    setPhase("running");
    clearInk();
    setTip(null);
    cur.classList.remove("is-on");
    expect.current = null;

    const step = async (n: Target, reason: string, label: string, shape: (b: Box) => string[], rest: (b: Box) => { x: number; y: number }, side?: { left?: boolean; up?: boolean }) => {
      ops.step({ kind: "tool", tool: "waitForUserAction", reason, state: "active", startedAt: Date.now() });
      // Site input pauses while the guide is drawn.
      setLock("guide");
      await guide(signal, n, label, shape, rest, side);
      setLock(null);
      await waitFor(signal, n);
      expect.current = null;
      // The expected action ends the step and removes its drawing.
      clearInk();
      setTip(null);
      ops.finishStep({ tokens: [64, 38] });
      await wait(prefersReducedMotion() ? 0 : 500, signal);
    };

    try {
      const text = draft;
      setDraft("");
      ops.user(text);
      await wait(450, signal);
      setTitle("Weekly digest on Fridays");
      ops.startRun();
      ops.step({ kind: "thinking", state: "active", startedAt: Date.now() });
      await wait(1100, signal);
      ops.finishStep({});
      ops.step({ kind: "tool", tool: "getPageStructure", reason: "Find the newsletter settings", state: "active", startedAt: Date.now() });
      await wait(850, signal);
      ops.finishStep({ tokens: [24, 380] });
      const t = box("toggle");
      setCursor(cur, { x: t.x + t.w + 220, y: t.y - 40 });

      if (!live.current.digest) {
        await step("toggle", "Guide you to turn on Weekly digest", "Switch on Weekly digest", (b) => sketchEllipse(b, 21, 12), (b) => ({ x: b.x - 26, y: b.y + b.h / 2 + 2 }), { left: true });
      }
      if (live.current.day !== "Fri") {
        await step("fri", "Guide you to pick Friday", "Choose Fri", (b) => sketchArrow({ x: b.x - 150, y: b.y + b.h + 64 }, { x: b.x + b.w * 0.3, y: b.y + b.h + 8 }, 8, 0.35), (b) => ({ x: b.x - 166, y: b.y + b.h + 60 }));
      }
      await step("save", "Guide you to save the changes", "Save your changes", (b) => sketchRect(b, 4, { pad: 7, radius: 12 }), (b) => ({ x: b.x - 26, y: b.y + b.h + 16 }));
      cur.classList.remove("is-on");
      ops.endSteps();
      await wait(250, signal);
      ops.text(
        <>
          Done. Your weekly digest now goes out every <strong>Friday at 9:00 AM</strong>.
        </>,
      );
      setPhase("done");
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    }
  };

  const onSend = () => {
    if (phase === "running") return reset(); // the Stop button
    void run();
  };

  const hit = (t: Target) => {
    if (expect.current?.target === t) expect.current.resolve();
  };
  const onToggle = () => {
    setDigest((d) => !d);
    setSaved(false);
    hit("toggle");
  };
  const onDay = (d: Day) => {
    setDay(d);
    setSaved(false);
    if (d === "Fri") hit("fri");
  };
  const onSave = () => {
    setSaved(true);
    hit("save");
  };

  return (
    <section id="try" className="try on-paper" aria-labelledby="try-title">
      <div className="try-inner container">
        <div className="try-head">
          <div className="eyebrow tick" data-reveal>
            Try it here
          </div>
          <h2 id="try-title" data-reveal style={{ ["--d" as string]: "80ms" }}>
            Don&rsquo;t take our word for it. <span className="accent">Let it show you.</span>
          </h2>
          <p className="try-lead" data-reveal style={{ ["--d" as string]: "160ms" }}>
            This page has a sloth too. Send the prompt, then follow the ink. Nothing moves until you click.
          </p>
        </div>

        <div ref={stage} className="try-stage" data-reveal style={{ ["--d" as string]: "200ms" }}>
          <div className="app">
            <div className="app-head">
              <span className="app-logo">
                <span className="app-logo-mark">P</span>Postcard
              </span>
              <span className="app-crumbs">
                Settings <span>/</span> Newsletter
              </span>
            </div>
            <div className="app-body">
              <div className="app-row">
                <div>
                  <b>Weekly digest</b>
                  <p>A roundup of the week&rsquo;s posts, sent to every subscriber.</p>
                </div>
                <button data-tk="toggle" className={`app-toggle ${digest ? "is-on" : ""}`} role="switch" aria-checked={digest} aria-label="Weekly digest" onClick={onToggle}>
                  <i />
                </button>
              </div>
              <div className={`app-row ${digest ? "" : "is-dim"}`}>
                <div>
                  <b>Send on</b>
                  <p>Pick the day it lands in inboxes.</p>
                </div>
                <div className="app-seg" role="radiogroup" aria-label="Send on">
                  {DAYS.map((d) => (
                    <button key={d} data-tk={d === "Fri" ? "fri" : undefined} role="radio" aria-checked={day === d} className={day === d ? "is-on" : ""} onClick={() => onDay(d)}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div className={`app-row ${digest ? "" : "is-dim"}`}>
                <div>
                  <b>Subject line</b>
                  <p>What subscribers see in their inbox.</p>
                </div>
                <span className="app-input">This week at Postcard</span>
              </div>
              <div className={`app-row ${digest ? "" : "is-dim"}`}>
                <div>
                  <b>Send time</b>
                  <p>In each subscriber&rsquo;s own time zone.</p>
                </div>
                <span className="app-select">
                  9:00 AM <Icon.chevron />
                </span>
              </div>
            </div>
            <div className="app-foot">
              <span className={`app-saved ${saved ? "is-on" : ""}`}>
                <Icon.check /> Saved
              </span>
              <button className="app-btn ghost" onClick={reset}>
                Cancel
              </button>
              <button data-tk="save" className="app-btn" onClick={onSave}>
                Save changes
              </button>
            </div>
            {/* The extension pauses site input while it draws a guide. */}
            {lock && <div className="app-guard" aria-hidden />}
            <LockPill mode={lock} />
          </div>

          <div className="try-panel">
            <SidePanel
              theme="light"
              title={title}
              messages={chat.msgs}
              draft={draft}
              loading={phase === "running"}
              onSend={onSend}
              sendTarget="send"
            />
          </div>

          <svg ref={ink} className="ink-layer" aria-hidden />
          <GuideCursor ref={cursor} className="is-guiding" label={tip ? <TypedTip key={tip} text={tip} /> : null} />
        </div>

        <div className={`try-again ${phase === "done" ? "is-on" : ""}`}>
          <button onClick={reset}>
            <Icon.reload /> Run it again
          </button>
        </div>
      </div>
    </section>
  );
}
