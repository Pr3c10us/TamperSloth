/**
 * Hand-drawn guide strokes, after the extension's page guidance: subtly
 * irregular curves seeded by an id, so a shape looks the same every time it is
 * drawn. Each shape is a list of strokes; the pen lifts between strokes.
 */

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** Small seeded PRNG (mulberry32). */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Low-frequency wobble: a couple of sines with random phase. */
function wobble(rand: () => number, amp: number) {
  const p1 = rand() * Math.PI * 2;
  const p2 = rand() * Math.PI * 2;
  const f1 = 1 + rand() * 1.5;
  const f2 = 3 + rand() * 2.5;
  return (t: number) => amp * (Math.sin(t * Math.PI * 2 * f1 + p1) * 0.7 + Math.sin(t * Math.PI * 2 * f2 + p2) * 0.3);
}

/** Catmull-Rom spline through the points, as cubic Béziers. */
export function smoothPath(points: Pt[]): string {
  if (points.length < 2) return "";
  const f = (n: number) => Math.round(n * 10) / 10;
  let d = `M${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  return d;
}

/** A point on a rounded rectangle's outline, t in [0, 1) clockwise from the top-left. */
function roundedRectPoint(b: Box, r: number, t: number): Pt {
  const straightW = Math.max(0, b.w - 2 * r);
  const straightH = Math.max(0, b.h - 2 * r);
  const arc = (Math.PI / 2) * r;
  const total = 2 * straightW + 2 * straightH + 4 * arc;
  let s = (((t % 1) + 1) % 1) * total;
  const seg = (len: number) => {
    if (s <= len) return true;
    s -= len;
    return false;
  };
  if (seg(straightW)) return { x: b.x + r + s, y: b.y };
  if (seg(arc)) {
    const a = -Math.PI / 2 + s / r;
    return { x: b.x + b.w - r + Math.cos(a) * r, y: b.y + r + Math.sin(a) * r };
  }
  if (seg(straightH)) return { x: b.x + b.w, y: b.y + r + s };
  if (seg(arc)) {
    const a = s / r;
    return { x: b.x + b.w - r + Math.cos(a) * r, y: b.y + b.h - r + Math.sin(a) * r };
  }
  if (seg(straightW)) return { x: b.x + b.w - r - s, y: b.y + b.h };
  if (seg(arc)) {
    const a = Math.PI / 2 + s / r;
    return { x: b.x + r + Math.cos(a) * r, y: b.y + b.h - r + Math.sin(a) * r };
  }
  if (seg(straightH)) return { x: b.x, y: b.y + b.h - r - s };
  const a = Math.PI + s / r;
  return { x: b.x + r + Math.cos(a) * r, y: b.y + r + Math.sin(a) * r };
}

/** One loop around a box, overshooting its start a little like a quick pen circle. */
export function sketchRect(b: Box, seed: number, opts: { pad?: number; radius?: number } = {}): string[] {
  const rand = seeded(seed);
  const pad = opts.pad ?? 8;
  const box = { x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  const r = Math.min(opts.radius ?? 12, box.h / 2, box.w / 2);
  const start = 0.02 + rand() * 0.06;
  const sweep = 1.07 + rand() * 0.05;
  const wob = wobble(rand, Math.min(3.2, box.h * 0.06 + 1.2));
  const drift = (rand() - 0.5) * 5;
  const n = 72;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = roundedRectPoint(box, r, start + u * sweep);
    const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const len = Math.hypot(dx, dy) || 1;
    const off = wob(u) + drift * u;
    pts.push({ x: p.x + (dx / len) * off, y: p.y + (dy / len) * off });
  }
  return [smoothPath(pts)];
}

/** An oval that doesn't quite close, drawn once and a bit. */
export function sketchEllipse(b: Box, seed: number, pad = 10): string[] {
  const rand = seeded(seed);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const rx = b.w / 2 + pad;
  const ry = b.h / 2 + pad * 0.8;
  const start = -Math.PI * (0.62 + rand() * 0.1);
  const sweep = Math.PI * 2 * (1.06 + rand() * 0.06);
  const wob = wobble(rand, Math.min(4, ry * 0.08 + 1.5));
  const tilt = (rand() - 0.5) * 0.08;
  const n = 64;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = start + u * sweep;
    const grow = 1 + (u - 0.5) * 0.06;
    const x = Math.cos(a) * (rx + wob(u)) * grow;
    const y = Math.sin(a) * (ry + wob(u) * 0.6) * grow;
    pts.push({ x: cx + x * Math.cos(tilt) - y * Math.sin(tilt), y: cy + x * Math.sin(tilt) + y * Math.cos(tilt) });
  }
  return [smoothPath(pts)];
}

/** A curved arrow from `from` to `to`; the head is two separate strokes. */
export function sketchArrow(from: Pt, to: Pt, seed: number, bend = 0.25): string[] {
  const rand = seeded(seed);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const ctrl = {
    x: from.x + dx * 0.5 + nx * len * bend,
    y: from.y + dy * 0.5 + ny * len * bend,
  };
  const wob = wobble(rand, 1.4);
  const n = 28;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * ctrl.x + t * t * to.x;
    const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * ctrl.y + t * t * to.y;
    const w = wob(t) * Math.sin(t * Math.PI);
    pts.push({ x: x + nx * w, y: y + ny * w });
  }
  // Direction at the tip, from the curve's last segment.
  const a = pts[pts.length - 3];
  const ang = Math.atan2(to.y - a.y, to.x - a.x);
  const head = Math.min(18, 8 + len * 0.08);
  const spread = 0.5 + rand() * 0.1;
  const wing = (s: number) => {
    const h = head * (0.9 + rand() * 0.2);
    const p = { x: to.x - Math.cos(ang + s * spread) * h, y: to.y - Math.sin(ang + s * spread) * h };
    const mid = { x: (p.x + to.x) / 2 + (rand() - 0.5) * 1.6, y: (p.y + to.y) / 2 + (rand() - 0.5) * 1.6 };
    return smoothPath([p, mid, to]);
  };
  return [smoothPath(pts), wing(1), wing(-1)];
}

/** A loose underline, slightly rising, with a flick at the end. */
export function sketchUnderline(x1: number, x2: number, y: number, seed: number): string[] {
  const rand = seeded(seed);
  const wob = wobble(rand, 1.6);
  const pts: Pt[] = [];
  const n = 24;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: x1 + (x2 - x1) * t, y: y - t * 3 + wob(t) });
  }
  return [smoothPath(pts)];
}

/** A tick mark. */
export function sketchCheck(c: Pt, size: number, seed: number): string[] {
  const rand = seeded(seed);
  const j = () => (rand() - 0.5) * size * 0.06;
  const a = { x: c.x - size * 0.5 + j(), y: c.y + j() };
  const b = { x: c.x - size * 0.12 + j(), y: c.y + size * 0.38 + j() };
  const d = { x: c.x + size * 0.55 + j(), y: c.y - size * 0.5 + j() };
  return [smoothPath([a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 1 }, b, { x: (b.x + d.x) / 2 - 2, y: (b.y + d.y) / 2 }, d])];
}

/** A closed freehand loop, for the "draw on the page" card. */
export function sketchScribble(c: Pt, r: number, seed: number, turns = 1.15): string[] {
  const rand = seeded(seed);
  const wob = wobble(rand, r * 0.18);
  const pts: Pt[] = [];
  const n = 70;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = -Math.PI / 2 + u * Math.PI * 2 * turns;
    const rr = r + wob(u) - u * r * 0.12;
    pts.push({ x: c.x + Math.cos(a) * rr * 1.5, y: c.y + Math.sin(a) * rr * 0.78 });
  }
  return [smoothPath(pts)];
}
