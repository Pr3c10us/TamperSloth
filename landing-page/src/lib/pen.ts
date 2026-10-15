/**
 * Draws sketch strokes into an SVG layer with the guide cursor riding the tip,
 * the way the extension's guide does it: one cursor, one stroke at a time,
 * pen-up travel between strokes, and a directional tilt while drawing.
 */
import type { Pt } from "./sketch";

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class Aborted extends Error {
  constructor() {
    super("aborted");
  }
}

export function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Aborted());
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new Aborted());
      },
      { once: true },
    );
  });
}

function frames(duration: number, onFrame: (t: number) => void, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Aborted());
    if (duration <= 0) {
      onFrame(1);
      return resolve();
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (signal?.aborted) return reject(new Aborted());
      const t = Math.min(1, (now - start) / duration);
      onFrame(t);
      if (t < 1) raf = requestAnimationFrame(tick);
      else resolve();
    };
    raf = requestAnimationFrame(tick);
    signal?.addEventListener("abort", () => cancelAnimationFrame(raf), { once: true });
  });
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeDraw = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

type CursorState = { x: number; y: number; tilt: number };
const cursorState = new WeakMap<HTMLElement, CursorState>();

function place(cursor: HTMLElement, s: CursorState) {
  cursor.style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
  cursor.style.setProperty("--tilt", `${s.tilt}deg`);
}

export function setCursor(cursor: HTMLElement, p: Pt) {
  const s = { x: p.x, y: p.y, tilt: 0 };
  cursorState.set(cursor, s);
  place(cursor, s);
}

export function cursorAt(cursor: HTMLElement): Pt {
  const s = cursorState.get(cursor);
  return s ? { x: s.x, y: s.y } : { x: 0, y: 0 };
}

/** Glide the cursor to a point; duration scales with distance unless given. */
export async function moveCursor(cursor: HTMLElement, to: Pt, signal?: AbortSignal, duration?: number) {
  const s = cursorState.get(cursor) ?? { x: to.x, y: to.y, tilt: 0 };
  const from = { x: s.x, y: s.y };
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const dur = prefersReducedMotion() ? 0 : (duration ?? Math.min(900, 260 + dist * 0.9));
  await frames(
    dur,
    (t) => {
      const e = easeInOut(t);
      s.x = from.x + (to.x - from.x) * e;
      s.y = from.y + (to.y - from.y) * e;
      // Lean into the direction of travel, settle at the end.
      const lean = Math.max(-14, Math.min(14, ((to.x - from.x) / (dist || 1)) * 14));
      s.tilt = lean * Math.sin(Math.PI * t);
      place(cursor, s);
    },
    signal,
  );
  cursorState.set(cursor, s);
}

const SVG_NS = "http://www.w3.org/2000/svg";

export interface DrawOptions {
  cursor?: HTMLElement | null;
  signal?: AbortSignal;
  className?: string;
  /** Milliseconds per pixel of stroke. */
  pace?: number;
  instant?: boolean;
}

/** Append strokes to the layer and draw them in order. Resolves with the path elements. */
export async function drawStrokes(layer: SVGSVGElement | SVGGElement, strokes: string[], opts: DrawOptions = {}) {
  const { cursor, signal, className = "ink", pace = 2.3 } = opts;
  const instant = opts.instant || prefersReducedMotion();
  const paths = strokes.map((d) => {
    const p = document.createElementNS(SVG_NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("class", className);
    layer.appendChild(p);
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = instant ? "0" : `${len}`;
    return { el: p, len };
  });
  if (instant) {
    if (cursor && paths.length) {
      const last = paths[paths.length - 1];
      const end = last.el.getPointAtLength(last.len);
      setCursor(cursor, { x: end.x, y: end.y });
    }
    return paths.map((p) => p.el);
  }

  for (const { el, len } of paths) {
    // Sample once; frames read the cached points for both ink and cursor.
    const samples = Math.max(24, Math.min(240, Math.round(len / 3)));
    const pts: Pt[] = [];
    for (let i = 0; i <= samples; i++) {
      const q = el.getPointAtLength((len * i) / samples);
      pts.push({ x: q.x, y: q.y });
    }
    if (cursor) await moveCursor(cursor, pts[0], signal, Math.min(380, 140 + Math.hypot(pts[0].x - cursorAt(cursor).x, pts[0].y - cursorAt(cursor).y) * 0.7));
    const dur = Math.max(240, Math.min(1700, len * pace));
    const s = cursor ? (cursorState.get(cursor) ?? { x: 0, y: 0, tilt: 0 }) : null;
    await frames(
      dur,
      (t) => {
        const e = easeDraw(t);
        el.style.strokeDashoffset = `${len * (1 - e)}`;
        if (cursor && s) {
          const idx = e * samples;
          const i0 = Math.floor(idx);
          const i1 = Math.min(samples, i0 + 1);
          const f = idx - i0;
          const p = { x: pts[i0].x + (pts[i1].x - pts[i0].x) * f, y: pts[i0].y + (pts[i1].y - pts[i0].y) * f };
          const ahead = pts[Math.min(samples, i0 + 3)];
          const dir = Math.atan2(ahead.y - p.y, ahead.x - p.x);
          // Up to ~18° of lean in the drawing direction, eased so it never snaps.
          const target = Math.cos(dir) * 18 * Math.sin(Math.PI * Math.min(1, t * 1.2));
          s.tilt += (target - s.tilt) * 0.18;
          s.x = p.x;
          s.y = p.y;
          place(cursor, s);
        }
      },
      signal,
    );
    el.style.strokeDashoffset = "0";
    if (cursor && s) {
      s.tilt = 0;
      place(cursor, s);
      cursorState.set(cursor, s);
    }
  }
  return paths.map((p) => p.el);
}

/** Type text into a setter one character at a time. */
export async function typeText(text: string, set: (v: string) => void, signal?: AbortSignal, cps = 38) {
  if (prefersReducedMotion()) {
    set(text);
    return;
  }
  for (let i = 1; i <= text.length; i++) {
    set(text.slice(0, i));
    const ch = text[i - 1];
    const jitter = 0.6 + Math.random() * 0.8;
    await wait((1000 / cps) * jitter * (ch === " " ? 1.4 : 1) * (".,!?".includes(ch) ? 3 : 1), signal);
  }
}

export { easeOutCubic };
