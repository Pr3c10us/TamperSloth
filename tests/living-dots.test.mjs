import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

const load = createLoader();
const {createSwarm, seededRandom, CHOREOGRAPHIES, DOT_COUNT} = load('src/chat/lib/livingDots.ts');
const FRAME = 1000 / 60;

function run(seed, seconds) {
    const swarm = createSwarm({random: seededRandom(seed)});
    const frames = [];
    for (let t = 0; t < seconds * 1000; t += FRAME) frames.push({views: swarm.step(FRAME), choreography: swarm.choreography()});
    return frames;
}

test('always exactly three dots, fading in on mount', () => {
    const frames = run(1, 20);
    assert.ok(frames.every(frame => frame.views.length === DOT_COUNT && DOT_COUNT === 3));
    assert.ok(frames[0].views.every(view => view.opacity < 0.05), 'dots start nearly invisible');
    assert.ok(frames[60].views.every(view => view.opacity > 0.3), 'and are visible within a second');
});

test('every choreography is periodic, and the set plays in turn and repeats', () => {
    for (const choreography of CHOREOGRAPHIES) {
        for (let i = 0; i < DOT_COUNT; i++) {
            const start = choreography.at(0, i), end = choreography.at(choreography.period, i);
            // Breathe also spins slowly, so only its depth/radius cycle; positions still stay close.
            const tolerance = choreography.name === 'breathe' ? 2 : 1e-6;
            assert.ok(Math.hypot(start.x - end.x, start.y - end.y, start.z - end.z) <= tolerance, choreography.name);
        }
    }
    const sequence = run(2, 120).map(frame => frame.choreography).filter((name, i, all) => name !== all[i - 1]);
    assert.deepEqual(new Set(sequence), new Set(CHOREOGRAPHIES.map(c => c.name)), 'all choreographies appear');
    assert.ok(sequence.length > CHOREOGRAPHIES.length, 'and they repeat');
});

test('motion is continuous, including across crossfades between choreographies', () => {
    const frames = run(3, 90);
    for (let f = 1; f < frames.length; f++) {
        frames[f].views.forEach((view, i) => {
            const before = frames[f - 1].views[i];
            for (const value of [view.x, view.y, view.scale, view.opacity, view.blur]) assert.ok(Number.isFinite(value));
            assert.ok(Math.hypot(view.x - before.x, view.y - before.y) < 0.2, `position jump at frame ${f}`);
            assert.ok(Math.abs(view.scale - before.scale) < 0.08, `scale jump at frame ${f}`);
            assert.ok(Math.abs(view.opacity - before.opacity) < 0.08, `opacity jump at frame ${f}`);
        });
    }
});

test('depth reads as scale and opacity together, with blur only far away', () => {
    const views = run(11, 40).slice(60).flatMap(frame => frame.views);
    const near = views.filter(view => view.scale > 1.15);
    const far = views.filter(view => view.scale < 0.9);
    assert.ok(near.length && far.length, 'dots travel both toward and away from the viewer');
    const mean = list => list.reduce((sum, view) => sum + view.opacity, 0) / list.length;
    assert.ok(mean(near) > mean(far), 'nearer dots are more opaque');
    assert.ok(near.every(view => view.blur === 0));
    assert.ok(views.every(view => Math.abs(view.x) < 1.6 && Math.abs(view.y) < 1.2), 'motion stays inside the loader');
});

test('a long pause (background tab) resumes without a jump', () => {
    const swarm = createSwarm({random: seededRandom(9)});
    let views;
    for (let t = 0; t < 2000; t += 16) views = swarm.step(16);
    const after = swarm.step(30_000);
    after.forEach((view, i) => assert.ok(Math.hypot(view.x - views[i].x, view.y - views[i].y) < 0.3));
});
