import { useEffect, useRef, useState } from "react";
import { Canopy } from "./Canopy";
import { ArrowIcon, GuideCursor, TypedTip } from "./brand";
import { drawStrokes, moveCursor, prefersReducedMotion, setCursor, wait, Aborted } from "../lib/pen";
import { sketchArrow, sketchEllipse } from "../lib/sketch";
import { INSTALL_URL } from "../lib/site";
import "../styles/hero.css";

/**
 * The hero is annotated by Sloth itself: once the headline lands, the guide
 * cursor circles "to work." and points at the install button.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);
  const ink = useRef<SVGSVGElement>(null);
  const cursor = useRef<HTMLDivElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);
  const [tip, setTip] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let ctrl = new AbortController();

    // Layout offsets, so the headline's entrance transform can't skew the result.
    const measure = (el: HTMLElement) => {
      let x = 0;
      let y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== root.current) {
        x += n.offsetLeft;
        y += n.offsetTop;
        n = n.offsetParent as HTMLElement | null;
      }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };

    const guide = async (instant: boolean) => {
      const layer = ink.current;
      const cur = cursor.current;
      if (!layer || !cur || !word.current || !cta.current) return;
      layer.innerHTML = "";
      const signal = ctrl.signal;
      const w = measure(word.current);
      const b = measure(cta.current);
      const narrow = window.innerWidth < 720;

      if (!instant) {
        setCursor(cur, { x: w.x + w.w + 180, y: w.y - 60 });
        cur.classList.add("is-on");
        await wait(200, signal);
      }
      await drawStrokes(layer, sketchEllipse({ x: w.x + 4, y: w.y + w.h * 0.12, w: w.w - 4, h: w.h * 0.8 }, 11, narrow ? 8 : 16), {
        cursor: cur,
        signal,
        instant,
        pace: 2.6,
      });
      // Arrow from the left of the circled words down to the button's left edge.
      // It swoops out to the left so it never crosses the paragraph.
      const lead = root.current!.querySelector<HTMLElement>(".hero-lead");
      const l = lead ? measure(lead) : { x: w.x, y: w.y + w.h, w: w.w, h: 0 };
      const from = { x: w.x - 10, y: w.y + w.h * 0.62 };
      const to = { x: b.x - 16, y: b.y + b.h * 0.5 };
      const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      // Bend so the curve's midpoint clears the paragraph's left edge by ~36px.
      const midX = (from.x + to.x) / 2;
      const want = Math.max(40, midX - (l.x - 36));
      const bend = Math.min(1.1, (want * 2) / len);
      // On phones the paragraph spans the width, so the pen just glides down instead.
      if (!narrow) await drawStrokes(layer, sketchArrow(from, to, 5, bend), { cursor: cur, signal, instant, className: "ink ink-thin" });
      // On phones the stage sits right under the button, so the tip goes above the cursor.
      const rest = narrow ? { x: b.x - 10, y: b.y + b.h * 0.55 } : { x: to.x - 34, y: to.y + 6 };
      cur.classList.toggle("tip-left", narrow);
      cur.classList.toggle("tip-up", narrow);
      if (instant) setCursor(cur, rest);
      else await moveCursor(cur, rest, signal, 420);
      cur.classList.add("is-on");
      setTip(true);
    };

    const run = async () => {
      try {
        await document.fonts.ready;
        setReady(true);
        // Let the headline finish its entrance before the pen comes in.
        await wait(prefersReducedMotion() ? 0 : 1900, ctrl.signal);
        await guide(prefersReducedMotion());
      } catch (e) {
        if (!(e instanceof Aborted)) throw e;
      }
    };
    void run();

    // Redraw in place (no animation) when the layout changes.
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        ctrl.abort();
        ctrl = new AbortController();
        void guide(true).catch(() => {});
      }, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      ctrl.abort();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <section id="top" ref={root} className={`hero ${ready ? "is-ready" : ""}`}>
      <Canopy className="hero-canopy" />
      <div className="hero-inner">
        <a className="hero-chip" href="#toolbox">
          <span className="hero-chip-tag">2.1</span>
          <span>Now with voice dictation</span>
          <ArrowIcon />
        </a>
        <h1 className="hero-title">
          <span className="line">
            <span>Put your browser</span>
          </span>
          <span className="line">
            <span>
              <span ref={word} className="accent">
                to work.
              </span>
            </span>
          </span>
        </h1>
        <p className="hero-lead lead">
          Tampersloth is an AI agent in Chrome&rsquo;s side panel. It does the task for you, shows you how right on the page, or saves
          the fix so it runs on every visit.
        </p>
        <div className="hero-ctas">
          <a ref={cta} className="btn btn-primary" href={INSTALL_URL} target="_blank" rel="noreferrer">
            Add to Chrome
            <span className="btn-icon">
              <ArrowIcon />
            </span>
          </a>
          <a className="btn btn-ghost" href="#stage">
            Watch it work
          </a>
        </div>
      </div>
      <div className="hero-annot">
        <svg ref={ink} className="ink-layer" aria-hidden />
        <GuideCursor ref={cursor} className="is-guiding" label={tip ? <TypedTip text="Start here." /> : null} />
      </div>
    </section>
  );
}
