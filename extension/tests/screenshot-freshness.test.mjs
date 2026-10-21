import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

function fixture() {
    const tabs = new Map([[7, {id: 7, windowId: 1, active: false}], [8, {id: 8, windowId: 1, active: true}]]);
    const captures = [], state = {revision: 0, childDocument: 'child-1', settled: true};
    const metrics = {viewport: {width: 800, height: 600}, scroll: {x: 0, y: 0}, devicePixelRatio: 2};
    const observation = () => ({key: `doc:${state.revision}`, metrics, visible: true, settled: state.settled});
    const chrome = {
        tabs: {
            get: async id => tabs.get(id),
            update: async (id, options) => { for (const tab of tabs.values()) tab.active = tab.id === id; return Object.assign(tabs.get(id), options); },
            query: async ({windowId, active}) => [...tabs.values()].filter(tab => tab.windowId === windowId && (!active || tab.active)),
            captureVisibleTab: async () => { captures.push(Date.now()); return 'data:image/jpeg;base64,YQ=='; },
        },
        windows: {update: async () => {}},
        scripting: {executeScript: async ({target}) => target.allFrames ? [
            {frameId: 0, documentId: 'root', result: observation()},
            {frameId: 1, documentId: state.childDocument, result: {...observation(), key: 'child:0'}},
        ] : [{frameId: 0, documentId: 'root', result: observation()}]},
    };
    class Canvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return {drawImage() {}}; }
        async convertToBlob() { return new Blob(['resized']); }
    }
    const load = createLoader({globals: {chrome, OffscreenCanvas: Canvas,
        createImageBitmap: async () => ({width: 1600, height: 1200, close() {}}),
        fetch: async () => ({blob: async () => new Blob(['image'])}), btoa: s => Buffer.from(s, 'binary').toString('base64')}});
    return {api: load('src/background/screenshotCapture.ts'), chrome, tabs, captures, state, observation};
}
const check = async () => {};

test('a DOM race discards the old image internally and returns only the fresh result', async () => {
    const f = fixture();
    let calls = 0;
    const output = await f.api.withFreshScreenshot(7, check, async () => {
        if (++calls === 1) f.state.revision++;
        return {screenshot: calls === 1 ? 'old' : 'new'};
    }, async () => f.observation());
    assert.equal(output.screenshot, 'new');
    assert.equal(output.metadata.freshness.attempts, 2);
    assert.equal(output.metadata.freshness.settled, true);
});

test('switching the visible tab during capture cannot return another tab as the target', async () => {
    const f = fixture();
    let calls = 0;
    const output = await f.api.withFreshScreenshot(7, check, async () => {
        if (++calls === 1) await f.chrome.tabs.update(8, {active: true});
        return {screenshot: f.tabs.get(7).active ? 'target' : 'wrong-tab'};
    }, async () => f.observation());
    assert.equal(output.screenshot, 'target');
    assert.equal(output.metadata.freshness.attempts, 2);
});

test('captures of different tabs in one window serialize activation through final verification', async () => {
    const f = fixture(), order = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const first = f.api.withFreshScreenshot(7, check, async () => {
        order.push(7); await gate;
        assert.equal(f.tabs.get(7).active, true);
        return {screenshot: 'seven'};
    }, async () => f.observation());
    const second = f.api.withFreshScreenshot(8, check, async () => { order.push(8); return {screenshot: 'eight'}; }, async () => f.observation());
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.deepEqual(order, [7]);
    release();
    assert.deepEqual((await Promise.all([first, second])).map(result => result.screenshot), ['seven', 'eight']);
    assert.deepEqual(order, [7, 8]);
});

test('perpetual races fail after a bounded retry count instead of presenting an unchecked image', async () => {
    const f = fixture();
    let captures = 0;
    await assert.rejects(f.api.withFreshScreenshot(7, check, async () => {
        captures++; f.state.revision++; return {screenshot: 'stale'};
    }, async () => f.observation()), /Page kept changing/);
    assert.equal(captures, 3);
    f.state.settled = false;
    const current = await f.api.withFreshScreenshot(7, check, async () => ({screenshot: 'current'}), async () => f.observation());
    assert.equal(current.metadata.freshness.settled, false, 'A bounded wait is reported honestly on active pages');
});

test('navigation replaces the observation context and retries, while cancellation and permission errors propagate', async () => {
    const f = fixture();
    let observations = 0;
    const output = await f.api.withFreshScreenshot(7, check, async () => ({screenshot: 'new-document'}), async () => {
        if (++observations === 1) throw new Error('Execution context was destroyed');
        return f.observation();
    });
    assert.equal(output.metadata.freshness.attempts, 2);
    await assert.rejects(f.api.withFreshScreenshot(7, check, async () => ({}), async () => { throw new Error('Permission denied'); }), /Permission denied/);
    await assert.rejects(f.api.withFreshScreenshot(7, async () => { throw new Error('Aborted'); }, async () => { assert.fail('Captured after cancellation'); }), /Aborted/);
});

test('plain screenshots guard iframe document replacement and preserve resized coordinate metadata', async () => {
    const f = fixture();
    f.chrome.tabs.captureVisibleTab = async () => {
        f.captures.push(Date.now());
        if (f.captures.length === 1) f.state.childDocument = 'child-2';
        return 'data:image/jpeg;base64,YQ==';
    };
    const result = await f.api.captureViewportScreenshot(7, 1280, check);
    assert.equal(result.metadata.freshness.attempts, 2);
    assert.equal(result.metadata.sourcePixels.width, 1600);
    assert.equal(result.metadata.imagePixels.width, 1280);
    assert.equal(result.metadata.imagePixelsPerCSSPixel.x, 1.6);
    assert.ok(f.captures[1] - f.captures[0] >= 540, 'Internal retries respect Chrome capture quota');
});

test('the actual page observer waits across paint turns and detects mutations and viewport changes', async () => {
    let observer, frames = 0;
    const globals = {scrollY: 0, scrollX: 0, innerWidth: 800, innerHeight: 600, devicePixelRatio: 2,
        location: {href: 'https://example.com'},
        window: {setTimeout, addEventListener() {}},
        document: {visibilityState: 'visible', readyState: 'complete', fonts: {status: 'loaded'}, querySelectorAll: () => [], getAnimations: () => []},
        MutationObserver: class {constructor(callback) { observer = this; this.callback = callback; } observe() {} takeRecords() { return []; }},
        requestAnimationFrame: callback => setTimeout(() => { frames++; callback(); }, 16), cancelAnimationFrame: clearTimeout,
    };
    const api = createLoader({globals})('src/background/screenshotCapture.ts');
    const settled = await api.pageScreenshotState(true);
    assert.equal(settled.settled, true);
    assert.ok(frames >= 2);
    assert.equal((await api.pageScreenshotState(false)).key, settled.key);
    observer.callback([{}]);
    assert.notEqual((await api.pageScreenshotState(false)).key, settled.key);
});

test('the render wait times out and cleans up RAF when the page cannot paint', async () => {
    let cancelled = false;
    const globals = {scrollY: 0, scrollX: 0, innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
        location: {href: 'https://example.com'}, window: {setTimeout, addEventListener() {}},
        document: {visibilityState: 'hidden', readyState: 'complete', fonts: {status: 'loaded'}, querySelectorAll: () => []},
        MutationObserver: class {observe() {} takeRecords() { return []; }},
        requestAnimationFrame: () => 123, cancelAnimationFrame: id => { cancelled = id === 123; },
        setTimeout: (callback, ms) => setTimeout(callback, ms === 1500 ? 10 : ms),
    };
    const api = createLoader({globals})('src/background/screenshotCapture.ts');
    const result = await api.pageScreenshotState(true);
    assert.equal(result.settled, false);
    assert.equal(result.visible, false);
    assert.equal(cancelled, true);
});
