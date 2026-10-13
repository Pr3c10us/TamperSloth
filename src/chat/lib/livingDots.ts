/**
 * Motion model for the "living dots" loader: three dots moving through a small
 * 3D volume, projected to 2D. Depth becomes scale, opacity and blur, so the dots
 * read as passing toward and away from the viewer while the element stays flat.
 *
 * The motion is a set of short choreographies (orbit, figure-eight, wave,
 * tumble, shell-game swap, breathe). Each plays for a couple of cycles, then
 * crossfades into the next in a shuffled order, so the loader keeps changing
 * character without ever cutting. Pure and seedable so it can be tested.
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

export const DOT_COUNT = 3;
const FADE_IN_MS = 520;
const BLEND_MS = 800;

type Random = () => number;
type Vec = {x: number; y: number; z: number};
/** Position of dot `i` at `t` seconds into a choreography. */
type Choreography = {name: string; period: number; at: (t: number, i: number) => Vec};

const TAU = Math.PI * 2;
const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Shell game: adjacent pairs swap on each beat. Alternating (0 1) and (1 2)
// returns every dot to its starting slot after six beats, so the cycle loops.
const SWAP_BEAT = 0.55;
const SWAPS: [number, number][] = [[0, 1], [1, 2], [0, 1], [1, 2], [0, 1], [1, 2]];
const SLOT_ORDERS = SWAPS.reduce<number[][]>((orders, [a, b]) => {
    const next = [...orders[orders.length - 1]];
    [next[a], next[b]] = [next[b], next[a]];
    return [...orders, next];
}, [[0, 1, 2]]);

export const CHOREOGRAPHIES: Choreography[] = [
    {
        // A tilted ring: each dot swings out front, then passes behind the others.
        name: "orbit", period: 1.8, at: (t, i) => {
            const a = t * TAU / 1.8 + i * TAU / 3;
            return {x: Math.cos(a) * 0.9, y: Math.sin(a) * 0.32, z: Math.sin(a)};
        },
    },
    {
        // Figure-eight chase; the crossing point is where they swap depth.
        name: "lemniscate", period: 2.4, at: (t, i) => {
            const a = t * TAU / 2.4 + i * TAU / 3;
            return {x: Math.sin(a), y: Math.sin(2 * a) * 0.5, z: Math.cos(a)};
        },
    },
    {
        // A travelling wave: each dot rises as it comes toward the viewer.
        name: "wave", period: 1.2, at: (t, i) => {
            const p = t * TAU / 1.2 - i * 0.95;
            return {x: (i - 1) * 0.78, y: -Math.sin(p) * 0.55, z: Math.sin(p) * 0.85};
        },
    },
    {
        // A triangle tumbling around two axes.
        name: "tumble", period: 4.8, at: (t, i) => {
            const v = i * TAU / 3 - Math.PI / 2;
            const px = Math.cos(v) * 0.8, py = Math.sin(v) * 0.8;
            const yaw = t * TAU / 2.4, pitch = Math.sin(t * TAU / 4.8) * 0.7;
            const x = px * Math.cos(yaw);
            const zYaw = -px * Math.sin(yaw);
            return {x, y: py * Math.cos(pitch) - zYaw * Math.sin(pitch) * 0.6, z: py * Math.sin(pitch) + zYaw * Math.cos(pitch)};
        },
    },
    {
        // Shell game: two dots trade places, one arcing in front, one behind.
        name: "swap", period: SWAP_BEAT * SWAPS.length, at: (t, i) => {
            const beat = Math.floor(t / SWAP_BEAT) % SWAPS.length;
            const progress = smoothstep(clamp01((t % SWAP_BEAT) / (SWAP_BEAT * 0.72)));
            const from = SLOT_ORDERS[beat].indexOf(i), to = SLOT_ORDERS[beat + 1].indexOf(i);
            const x = lerp((from - 1) * 0.8, (to - 1) * 0.8, progress);
            if (from === to) return {x, y: Math.sin(progress * Math.PI) * 0.12, z: 0};
            const lift = Math.sin(progress * Math.PI) * (to > from ? 1 : -1);
            return {x, y: -lift * 0.32, z: lift * 0.95};
        },
    },
    {
        // Contract into a depth stack, then bloom back out into a slow spin.
        name: "breathe", period: 2.2, at: (t, i) => {
            const open = 0.5 - 0.5 * Math.cos(t * TAU / 2.2);
            const r = 0.12 + 0.75 * smoothstep(open);
            const a = i * TAU / 3 + t * 0.9;
            return {x: Math.cos(a) * r, y: Math.sin(a) * r * 0.65, z: (i - 1) * 0.7 * (1 - open) + Math.sin(a) * 0.35 * open};
        },
    },
];

export function createSwarm({random = Math.random}: {random?: Random} = {}) {
    let life = 0;
    let queue: number[] = [];
    let last: number | null = null;
    // The playing choreography, how far into it we are, and how long it plays.
    let current = 0, currentTime = 0, currentFor = 0;
    let outgoing: {index: number; time: number} | null = null;
    let blend = 1;

    const pick = () => {
        if (!queue.length) {
            // Shuffle the whole set, never repeating the one that just played.
            queue = CHOREOGRAPHIES.map((_, i) => i).sort(() => random() - 0.5);
            if (queue[0] === last && queue.length > 1) queue.push(queue.shift()!);
        }
        last = queue.shift()!;
        return last;
    };
    const plays = (index: number) => CHOREOGRAPHIES[index].period * (random() < 0.5 ? 2 : 3);

    current = pick();
    currentFor = plays(current);

    function step(dtMs: number): DotView[] {
        // Clamp so a backgrounded tab resumes smoothly instead of teleporting.
        const ms = Math.min(Math.max(dtMs, 0), 50);
        const dt = ms / 1000;
        life = Math.min(1, life + ms / FADE_IN_MS);
        currentTime += dt;
        if (outgoing) {
            outgoing.time += dt;
            blend = Math.min(1, blend + ms / BLEND_MS);
            if (blend >= 1) outgoing = null;
        }
        if (!outgoing && currentTime >= currentFor) {
            outgoing = {index: current, time: currentTime};
            current = pick();
            currentTime = 0;
            currentFor = plays(current);
            blend = 0;
        }

        const presence = smoothstep(life);
        return Array.from({length: DOT_COUNT}, (_, i) => {
            let pos = CHOREOGRAPHIES[current].at(currentTime, i);
            if (outgoing) {
                // Both choreographies keep moving while their positions crossfade.
                const from = CHOREOGRAPHIES[outgoing.index].at(outgoing.time, i);
                const k = smoothstep(blend);
                pos = {x: lerp(from.x, pos.x, k), y: lerp(from.y, pos.y, k), z: lerp(from.z, pos.z, k)};
            }
            const z = Math.max(-1.2, Math.min(1.2, pos.z));
            const perspective = 3 / (3 - z);
            return {
                id: i,
                x: pos.x * perspective,
                y: pos.y * perspective,
                scale: perspective * (0.35 + 0.65 * presence),
                opacity: (0.42 + 0.58 * (z + 1.2) / 2.4) * presence,
                blur: z < -0.5 ? (-0.5 - z) * 0.9 : 0,
            };
        });
    }

    return {step, choreography: () => CHOREOGRAPHIES[current].name};
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
