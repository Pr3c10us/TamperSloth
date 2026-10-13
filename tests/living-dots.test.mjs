import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

const load = createLoader();
const {createSwarm, seededRandom, CHOREOGRAPHIES, MAX_DOTS, CONVERGE_MS, BURST_MS, TEMPO, HOLD_SECONDS} = load('src/chat/lib/livingDots.ts');
const FRAME = 1000 / 60;

function run(seed, seconds) {
    const swarm = createSwarm({random: seededRandom(seed)});
    const frames = [];
    for (let t = 0; t < seconds * 1000; t += FRAME) {
        frames.push({views: swarm.step(FRAME), choreography: swarm.choreography(), phase: swarm.phase(), count: swarm.count()});
    }
    return frames;
}
const visible = frame => frame.views.filter(view => view.opacity > 0.02).length;

test('three or four dots, fading in on mount, and the count changes back and forth', () => {
    const frames = run(1, 240);
    assert.ok(frames.every(frame => frame.views.length === MAX_DOTS));
    assert.ok(frames[0].views.every(view => view.opacity < 0.05), 'dots start nearly invisible');
    const playing = frames.filter(frame => frame.phase === 'play' && frame.count && frames.indexOf(frame) > 60);
    assert.ok(playing.every(frame => frame.count === 3 || frame.count === 4));
    assert.ok(playing.every(frame => visible(frame) === CHOREOGRAPHIES.find(c => c.name === frame.choreography).dots),
        'every dot of the choreography is visible, and no extra');
    const counts = playing.map(frame => frame.count).filter((count, i, all) => count !== all[i - 1]);
    assert.ok(counts.length >= 4, 'the dot count grows and shrinks several times');
});

test('every choreography loops, and all of them play and repeat', () => {
    assert.ok(CHOREOGRAPHIES.some(c => c.dots === 3) && CHOREOGRAPHIES.some(c => c.dots === 4));
    for (const choreography of CHOREOGRAPHIES) {
        for (let i = 0; i < choreography.dots; i++) {
            const start = choreography.at(0, i), end = choreography.at(choreography.period, i);
            // Breathe also spins slowly, so only its depth/radius cycle; positions still stay close.
            const tolerance = choreography.name === 'breathe' ? 2 : 1e-6;
            assert.ok(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) <= tolerance, choreography.name);
        }
    }
    const sequence = run(2, 600).map(frame => frame.choreography).filter((name, i, all) => name !== all[i - 1]);
    assert.deepEqual(new Set(sequence), new Set(CHOREOGRAPHIES.map(c => c.name)), 'all choreographies appear');
    assert.ok(sequence.length > CHOREOGRAPHIES.length, 'and they repeat');
});

test('switching snaps: dots squeeze into the center, then burst into the next choreography', () => {
    const frames = run(3, 120);
    let transitions = 0;
    for (let f = 1; f < frames.length; f++) {
        if (frames[f - 1].phase === 'converge' && frames[f].phase === 'burst') {
            transitions++;
            // At the squeeze, every visible dot sits in a tight stack.
            const stack = frames[f - 1].views.filter(view => view.opacity > 0.02);
            assert.ok(stack.every(view => Math.hypot(view.x, view.y) < 0.05), 'dots meet at the center');
        }
    }
    assert.ok(transitions >= 3);
    // The whole switch is short: a converge and a burst, back to playing within half a second.
    const runs = [];
    let length = 0;
    for (const frame of frames) {
        if (frame.phase !== 'play') length++;
        else if (length) { runs.push(length * FRAME); length = 0; }
    }
    assert.ok(runs.every(ms => ms <= CONVERGE_MS + BURST_MS + 2 * FRAME), `switches took ${runs.map(Math.round)}`);
});

test('motion stays continuous: quick during switches, without teleporting', () => {
    const frames = run(4, 90);
    for (let f = 1; f < frames.length; f++) {
        const switching = frames[f].phase !== 'play' || frames[f - 1].phase !== 'play';
        frames[f].views.forEach((view, i) => {
            const before = frames[f - 1].views[i];
            for (const value of [view.x, view.y, view.scale, view.opacity, view.blur]) assert.ok(Number.isFinite(value));
            if (before.opacity < 0.02 && view.opacity < 0.02) return;
            assert.ok(Math.hypot(view.x - before.x, view.y - before.y) < (switching ? 0.5 : 0.2), `position jump at frame ${f}`);
            assert.ok(Math.abs(view.opacity - before.opacity) < (switching ? 0.25 : 0.08), `opacity jump at frame ${f}`);
        });
    }
});

test('depth reads as scale and opacity together, with blur only far away', () => {
    const views = run(11, 60).slice(60).flatMap(frame => frame.views).filter(view => view.opacity > 0.3);
    const near = views.filter(view => view.scale > 1.15);
    const far = views.filter(view => view.scale < 0.9);
    assert.ok(near.length && far.length, 'dots travel both toward and away from the viewer');
    const mean = list => list.reduce((sum, view) => sum + view.opacity, 0) / list.length;
    assert.ok(mean(near) > mean(far), 'nearer dots are more opaque');
    assert.ok(near.every(view => view.blur === 0));
    assert.ok(views.every(view => Math.abs(view.x) < 1.7 && Math.abs(view.y) < 1.3), 'motion stays inside the loader');
});

test('a long pause (background tab) resumes without a jump', () => {
    const swarm = createSwarm({random: seededRandom(9)});
    let views;
    for (let t = 0; t < 2000; t += 16) views = swarm.step(16);
    const after = swarm.step(30_000);
    after.forEach((view, i) => assert.ok(Math.hypot(view.x - views[i].x, view.y - views[i].y) < 0.5));
});

test('each choreography plays slowly and holds for several seconds before switching', () => {
    assert.ok(TEMPO < 1, 'choreographies run slower than written');
    const frames = run(7, 300);
    const holds = [];
    let start = null;
    frames.forEach((frame, i) => {
        if (frame.phase === 'play' && start === null) start = i;
        if (frame.phase !== 'play' && start !== null) { holds.push((i - start) * FRAME / 1000); start = null; }
    });
    // The first hold starts mid-fade-in; whole-loop rounding can stretch a hold by up to half a loop.
    const longestLoop = Math.max(...CHOREOGRAPHIES.map(c => c.period)) / TEMPO;
    assert.ok(holds.length >= 10);
    assert.ok(holds.slice(1).every(seconds => seconds >= Math.min(HOLD_SECONDS[0] - longestLoop / 2, HOLD_SECONDS[0] * 0.6)), `holds: ${holds.map(h => h.toFixed(1))}`);
    assert.ok(holds.every(seconds => seconds <= HOLD_SECONDS[1] + longestLoop / 2), `holds: ${holds.map(h => h.toFixed(1))}`);
    const sorted = [...holds].sort((a, b) => a - b);
    assert.ok(sorted[Math.floor(sorted.length / 2)] >= HOLD_SECONDS[0], 'a typical hold lasts at least the minimum');
});
