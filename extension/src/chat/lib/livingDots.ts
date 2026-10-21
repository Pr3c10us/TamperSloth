/**
 * Motion model for the "living dots" loader: three or four dots moving through
 * a small 3D volume, projected to 2D. Depth becomes scale, opacity and blur, so
 * the dots read as passing toward and away from the viewer while staying flat.
 *
 * The motion is a set of short choreographies, some for three dots and some for
 * four. Each plays for a couple of cycles; then the dots snap together into a
 * tight stack at the center and burst out into the next one. A changing dot
 * count happens inside that squeeze: a leaving dot shrinks into the stack, a new
 * one grows out of it. Pure and seedable so it can be tested.
 */

export interface DotView {
    /** Stable index, so a renderer can keep one element per dot. */
    id: number;
    /** Normalized position; roughly -1.5..1.5 on both axes after perspective. */
    x: number;
    y: number;
    scale: number;
    opacity: number;
    /** Depth-of-field blur in px for dots far from the viewer. */
    blur: number;
}

/** The renderer keeps this many elements; unused ones have zero opacity. */
export const MAX_DOTS = 4;
const FADE_IN_MS = 520;
/** Playback speed of the choreographies (1 = as written). Switches keep their own snappy timing. */
export const TEMPO = 0.6;
/** Real seconds each choreography holds before switching, rounded to whole loops. */
export const HOLD_SECONDS: [number, number] = [6, 9];
/** The squeeze: every dot accelerates into the center. */
export const CONVERGE_MS = 200;
/** The release: dots spring out into the next choreography, slightly overshooting. */
export const BURST_MS = 280;

type Random = () => number;
type Vec = {x: number; y: number; z: number};
/** Position of dot `i` at `t` seconds into a choreography. */
export type Choreography = {name: string; dots: 3 | 4; period: number; at: (t: number, i: number) => Vec};

const TAU = Math.PI * 2;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInCubic = (t: number) => t * t * t;
const easeOutBack = (t: number) => {
    const c = 1.25;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Tilt-and-spin a flat point into 3D. */
function rotate(p: {x: number; y: number}, yaw: number, pitch: number): Vec {
    const x = p.x * Math.cos(yaw);
    const zYaw = -p.x * Math.sin(yaw);
    return {x, y: p.y * Math.cos(pitch) - zYaw * Math.sin(pitch) * 0.6, z: p.y * Math.sin(pitch) + zYaw * Math.cos(pitch)};
}

/**
 * A slot-swapping routine: each beat, the listed pairs trade places, one arcing
 * in front and the other behind. `orders` must return to the start, so it loops.
 */
function swapper(name: string, dots: 3 | 4, beat: number, slots: {x: number; y: number}[], swaps: [number, number][][]): Choreography {
    const orders = swaps.reduce<number[][]>((all, pairs) => {
        const next = [...all[all.length - 1]];
        for (const [a, b] of pairs) [next[a], next[b]] = [next[b], next[a]];
        return [...all, next];
    }, [Array.from({length: dots}, (_, i) => i)]);
    return {
        name, dots, period: beat * swaps.length, at: (t, i) => {
            const step = Math.floor(t / beat) % swaps.length;
            const progress = smoothstep(clamp01((t % beat) / (beat * 0.72)));
            const from = slots[orders[step].indexOf(i)], to = slots[orders[step + 1].indexOf(i)];
            const x = lerp(from.x, to.x, progress), y = lerp(from.y, to.y, progress);
            if (from === to) return {x, y: y + Math.sin(progress * Math.PI) * 0.1, z: 0};
            // Whoever moves right (or down, on a tie) passes in front.
            const lift = Math.sin(progress * Math.PI) * (to.x > from.x || (to.x === from.x && to.y > from.y) ? 1 : -1);
            return {x, y: y - lift * 0.3, z: lift * 0.95};
        },
    };
}

export const CHOREOGRAPHIES: Choreography[] = [
    // ── Three dots ──
    {
        // A tilted ring: each dot swings out front, then passes behind the others.
        name: "orbit", dots: 3, period: 1.8, at: (t, i) => {
            const a = t * TAU / 1.8 + i * TAU / 3;
            return {x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.32, z: Math.sin(a)};
        },
    },
    {
        // Figure-eight chase; the crossing point is where they swap depth.
        name: "lemniscate", dots: 3, period: 2.4, at: (t, i) => {
            const a = t * TAU / 2.4 + i * TAU / 3;
            return {x: Math.sin(a), y: Math.sin(2 * a) * 0.5, z: Math.cos(a)};
        },
    },
    {
        // A travelling wave: each dot rises as it comes toward the viewer.
        name: "wave", dots: 3, period: 1.2, at: (t, i) => {
            const p = t * TAU / 1.2 - i * 0.95;
            return {x: (i - 1) * 0.78, y: -Math.sin(p) * 0.55, z: Math.sin(p) * 0.85};
        },
    },
    {
        // A triangle tumbling around two axes.
        name: "tumble", dots: 3, period: 4.8, at: (t, i) => {
            const v = i * TAU / 3 - Math.PI / 2;
            return rotate({x: Math.cos(v) * 0.8, y: Math.sin(v) * 0.8}, t * TAU / 2.4, Math.sin(t * TAU / 4.8) * 0.7);
        },
    },
    // Shell game: adjacent pairs trade places. (0 1)(1 2) has order 3, so six beats loop.
    swapper("swap", 3, 0.55, [-0.8, 0, 0.8].map(x => ({x, y: 0})), [[[0, 1]], [[1, 2]], [[0, 1]], [[1, 2]], [[0, 1]], [[1, 2]]]),
    {
        // Contract into a depth stack, then bloom back out into a slow spin.
        name: "breathe", dots: 3, period: 2.2, at: (t, i) => {
            const open = 0.5 - 0.5 * Math.cos(t * TAU / 2.2);
            const r = 0.12 + 0.75 * smoothstep(open);
            const a = i * TAU / 3 + t * 0.9;
            return {x: Math.cos(a) * r, y: Math.sin(a) * r * 0.65, z: (i - 1) * 0.7 * (1 - open) + Math.sin(a) * 0.35 * open};
        },
    },

    // ── Four dots ──
    {
        // A square spinning on a tilted axis, corners trading depth.
        name: "square", dots: 4, period: 2.4, at: (t, i) => {
            const a = t * TAU / 2.4 + i * TAU / 4 + Math.PI / 4;
            return rotate({x: Math.cos(a) * 0.85, y: Math.sin(a) * 0.85}, 0.9, 0.95);
        },
    },
    {
        // Two pairs on perpendicular rings, like an atom.
        name: "atom", dots: 4, period: 1.6, at: (t, i) => {
            const pair = i % 2, a = t * TAU / 1.6 + (i >> 1) * Math.PI + pair * Math.PI / 2;
            const ring = {x: Math.cos(a) * 0.95, y: 0, z: Math.sin(a)};
            // The second pair's ring is tipped 70° so the orbits cross.
            return pair ? {x: ring.x * 0.35, y: Math.cos(a) * 0.62, z: ring.z} : {x: ring.x, y: ring.z * 0.22, z: ring.z};
        },
    },
    {
        // A four-dot wave rolling left to right.
        name: "wave4", dots: 4, period: 1.1, at: (t, i) => {
            const p = t * TAU / 1.1 - i * 0.8;
            return {x: (i - 1.5) * 0.6, y: -Math.sin(p) * 0.55, z: Math.sin(p) * 0.85};
        },
    },
    // Corners of a square trade places across the diagonals, then along the sides.
    swapper("crossSwap", 4, 0.5, [{x: -0.6, y: -0.55}, {x: 0.6, y: -0.55}, {x: 0.6, y: 0.55}, {x: -0.6, y: 0.55}],
        [[[0, 2]], [[1, 3]], [[0, 1], [2, 3]], [[0, 2]], [[1, 3]], [[0, 1], [2, 3]]]),
    {
        // A plus sign that pulses outward while it turns, arms alternating in depth.
        name: "pulse", dots: 4, period: 3.6, at: (t, i) => {
            const open = 0.5 - 0.5 * Math.cos(t * TAU / 1.8);
            const r = 0.25 + 0.65 * smoothstep(open);
            const a = i * TAU / 4 + t * TAU / 3.6;
            return {x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, z: (i % 2 ? 1 : -1) * 0.6 * open};
        },
    },
];

/** Where dot `i` waits in the squeeze: a tight stack with just enough depth to read as several. */
const center = (i: number, dots: number): Vec => ({x: 0, y: 0, z: (i - (dots - 1) / 2) * 0.22});

export function createSwarm({random = Math.random}: {random?: Random} = {}) {
    let life = 0;
    const bags: Record<3 | 4, number[]> = {3: [], 4: []};
    let last: number | null = null;

    // Pick the dot count, then draw from that group's shuffled bag; never repeat back to back.
    const pick = () => {
        const dots: 3 | 4 = random() < 0.5 ? 3 : 4;
        let bag = bags[dots];
        if (!bag.length) {
            bag = bags[dots] = CHOREOGRAPHIES.flatMap((c, i) => c.dots === dots ? [i] : []).sort(() => random() - 0.5);
            if (bag[0] === last && bag.length > 1) bag.push(bag.shift()!);
        }
        last = bag.shift()!;
        return last;
    };
    // Choreography time to play: whole loops filling roughly the hold window, at least one.
    const plays = (index: number) => {
        const {period} = CHOREOGRAPHIES[index];
        const hold = HOLD_SECONDS[0] + random() * (HOLD_SECONDS[1] - HOLD_SECONDS[0]);
        return period * Math.max(1, Math.round(hold * TEMPO / period));
    };

    let current = pick(), time = 0, playFor = plays(current);
    let phase: "play" | "converge" | "burst" = "play";
    let phaseMs = 0;
    let next = current;
    let from: Vec[] = [];
    const presence: number[] = Array.from({length: MAX_DOTS}, (_, i) => i < CHOREOGRAPHIES[current].dots ? 1 : 0);

    const positions = (index: number, t: number) =>
        Array.from({length: MAX_DOTS}, (_, i) => i < CHOREOGRAPHIES[index].dots ? CHOREOGRAPHIES[index].at(t, i) : center(i, MAX_DOTS));

    function step(dtMs: number): DotView[] {
        // Clamp so a backgrounded tab resumes smoothly instead of teleporting.
        const ms = Math.min(Math.max(dtMs, 0), 50);
        life = Math.min(1, life + ms / FADE_IN_MS);
        time += ms / 1000 * TEMPO;
        phaseMs += ms;

        let pos: Vec[];
        if (phase === "play") {
            pos = positions(current, time);
            if (time >= playFor) {
                phase = "converge"; phaseMs = 0;
                from = pos;
                next = pick();
            }
        } else if (phase === "converge") {
            const k = easeInCubic(clamp01(phaseMs / CONVERGE_MS));
            const dots = Math.max(CHOREOGRAPHIES[current].dots, CHOREOGRAPHIES[next].dots);
            pos = from.map((p, i) => {
                const c = center(i, dots);
                return {x: lerp(p.x, c.x, k), y: lerp(p.y, c.y, k), z: lerp(p.z, c.z, k)};
            });
            // A dot the next choreography doesn't use shrinks into the stack.
            for (let i = 0; i < MAX_DOTS; i++) if (i >= CHOREOGRAPHIES[next].dots && i < CHOREOGRAPHIES[current].dots) presence[i] = 1 - k;
            if (phaseMs >= CONVERGE_MS) {
                phase = "burst"; phaseMs = 0;
                from = pos;
                current = next; time = 0; playFor = plays(current);
            }
        } else {
            const raw = clamp01(phaseMs / BURST_MS), k = easeOutBack(raw);
            const target = positions(current, time);
            pos = from.map((p, i) => ({x: lerp(p.x, target[i].x, k), y: lerp(p.y, target[i].y, k), z: lerp(p.z, target[i].z, k)}));
            // A dot joining grows out of the stack as the others spring away.
            for (let i = 0; i < MAX_DOTS; i++) if (i < CHOREOGRAPHIES[current].dots && presence[i] < 1) presence[i] = Math.max(presence[i], smoothstep(raw));
            if (phaseMs >= BURST_MS) { phase = "play"; phaseMs = 0; }
        }
        for (let i = CHOREOGRAPHIES[current].dots; i < MAX_DOTS; i++) if (phase === "play") presence[i] = 0;

        const fade = smoothstep(life);
        return pos.map((p, i) => {
            const z = Math.max(-1.2, Math.min(1.2, p.z));
            const perspective = 3 / (3 - z);
            const here = fade * presence[i];
            return {
                id: i,
                x: p.x * perspective,
                y: p.y * perspective,
                scale: perspective * (0.35 + 0.65 * here),
                opacity: (0.42 + 0.58 * (z + 1.2) / 2.4) * here,
                blur: z < -0.5 ? (-0.5 - z) * 0.9 : 0,
            };
        });
    }

    return {
        step,
        choreography: () => CHOREOGRAPHIES[current].name,
        phase: () => phase,
        /** Dots currently taking part (a leaving or arriving dot counts while visible). */
        count: () => presence.filter(value => value > 0).length,
    };
}

/** A seedable PRNG (mulberry32) for reproducible tests. */
export function seededRandom(seed: number): Random {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
