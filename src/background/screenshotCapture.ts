/** Serialized into the page's isolated world; no extension-side dependencies. */
export async function pageScreenshotState(wait: boolean) {
    const scope = globalThis as any;
    const state = scope.__tamperSlothScreenshot ??= {
        document: crypto.randomUUID(), revision: 0, changedAt: performance.now(),
    };
    if (!state.observer) {
        state.observer = new MutationObserver(() => { state.revision++; state.changedAt = performance.now(); });
        state.observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
        for (const event of ['scroll', 'resize']) window.addEventListener(event, () => {
            state.revision++; state.changedAt = performance.now();
        }, true);
    }
    state.roots ??= new Set<Document | ShadowRoot>([document]);
    // Document observers do not cross shadow boundaries. Include discovered open
    // roots and closed roots already resolved by the semantic targeting layer.
    const visit = (root: Document | ShadowRoot) => {
        if (!state.roots.has(root)) {
            state.roots.add(root);
            state.revision++; state.changedAt = performance.now();
            state.observer.observe(root, {subtree: true, childList: true, attributes: true, characterData: true});
        }
        for (const element of root.querySelectorAll('*')) if (element.shadowRoot) visit(element.shadowRoot);
    };
    visit(document);
    for (const root of scope.__tamperSlothPerception?.roots ?? []) if (root.host.isConnected) visit(root);
    let detached = false;
    for (const root of state.roots) if (root !== document && !root.host.isConnected) { state.roots.delete(root); detached = true; }
    if (detached) {
        state.revision++; state.changedAt = performance.now();
        state.observer.disconnect();
        for (const root of state.roots) state.observer.observe(root, {subtree: true, childList: true, attributes: true, characterData: true});
    }
    const metrics = () => ({url: location.href, devicePixelRatio,
        viewport: {width: innerWidth, height: innerHeight}, scroll: {x: scrollX, y: scrollY},
        visualViewport: window.visualViewport ? {width: visualViewport!.width, height: visualViewport!.height,
            offsetLeft: visualViewport!.offsetLeft, offsetTop: visualViewport!.offsetTop, scale: visualViewport!.scale} : null});
    let frames = 0, settled = false;
    if (wait) {
        const start = performance.now();
        // RAF callbacks run before paint. Yield a task after each callback so the
        // capture cannot run in the same rendering turn as the final callback.
        await new Promise<void>(resolve => {
            let raf = 0, task = 0, finished = false;
            const finish = () => {
                if (finished) return;
                finished = true; cancelAnimationFrame(raf); clearTimeout(task); clearTimeout(deadline); resolve();
            };
            const tick = () => {
                raf = requestAnimationFrame(() => {
                    frames++;
                    task = window.setTimeout(() => {
                        const animations = document.getAnimations().some(a => a.playState === 'running'
                            && Number.isFinite(a.effect?.getComputedTiming().endTime));
                        settled = frames >= 2 && document.visibilityState === 'visible' && document.readyState !== 'loading'
                            && document.fonts.status !== 'loading' && !animations
                            && performance.now() - Math.max(start, state.changedAt) >= 120;
                        if (settled) finish(); else tick();
                    }, 0);
                });
            };
            // Hidden/throttled tabs and perpetual activity must never hang a tool.
            const deadline = setTimeout(finish, 1500);
            tick();
        });
    }
    // Flush pending observer records before comparing pre/post capture revisions.
    if (state.observer.takeRecords().length) { state.revision++; state.changedAt = performance.now(); }
    const measured = metrics();
    return {key: JSON.stringify({document: state.document, revision: state.revision, ...measured}),
        metrics: measured, settled, frames, visible: document.visibilityState === 'visible'};
}

type Observation = {key: string; settled: boolean; visible: boolean; metrics?: any};
type Check = () => Promise<void>;
const windows = new Map<number, Promise<unknown>>();
let visibleCaptureChain: Promise<unknown> = Promise.resolve();
let lastVisibleCapture = 0;

/** captureVisibleTab is window-scoped and limited to two calls/second globally. */
export function captureVisibleTab(windowId: number, check: Check): Promise<string> {
    const capture = visibleCaptureChain.catch(() => {}).then(async () => {
        const remaining = 550 - (Date.now() - lastVisibleCapture);
        if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
        await check();
        lastVisibleCapture = Date.now();
        return chrome.tabs.captureVisibleTab(windowId, {format: 'jpeg', quality: 80});
    });
    visibleCaptureChain = capture;
    return capture;
}

async function observeTab(tabId: number, wait: boolean): Promise<Observation> {
    // Paint synchronization belongs to the root. Read iframe revisions as well,
    // since a subframe can update without mutating the parent's iframe element.
    const root = await chrome.scripting.executeScript({target: {tabId}, func: pageScreenshotState, args: [wait]});
    const frames = await chrome.scripting.executeScript({target: {tabId, allFrames: true}, func: pageScreenshotState, args: [false]});
    const measured = root[0]?.result;
    if (!measured?.key || frames.some(frame => !frame.result?.key)) throw new Error('Screenshot freshness could not be measured');
    const states = frames.map(frame => ({frameId: frame.frameId, documentId: frame.documentId, key: frame.result!.key})).sort((a, b) => a.frameId - b.frameId);
    return {...measured, key: JSON.stringify({root: measured.key, frames: states})};
}

/** Discard raced captures inside the tool; only the final image reaches the model. */
export async function withFreshScreenshot<T extends {metadata?: any}>(tabId: number, check: Check,
    capture: (windowId: number, before: Observation) => Promise<T>,
    observe: (wait: boolean) => Promise<Observation> = wait => observeTab(tabId, wait)): Promise<T> {
    const initial = await chrome.tabs.get(tabId);
    const windowId = initial.windowId;
    const previous = windows.get(windowId) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
        const start = Date.now();
        for (let attempt = 1; attempt <= 3; attempt++) {
            await check();
            const tab = await chrome.tabs.get(tabId);
            if (tab.windowId !== windowId) throw new Error('Screenshot target moved to another window');
            await chrome.windows.update(windowId, {focused: true});
            await chrome.tabs.update(tabId, {active: true});
            // Activating a discarded/background tab can start a new document load.
            const loadStart = Date.now();
            while ((await chrome.tabs.get(tabId)).status === 'loading' && Date.now() - loadStart < 3000) {
                await new Promise(resolve => setTimeout(resolve, 100)); await check();
            }
            const isTargetActive = async () => {
                const active = await chrome.tabs.query({windowId, active: true});
                return active.length === 1 && active[0].id === tabId;
            };
            try {
                const before = await observe(true);
                await check();
                if (!before.visible || !await isTargetActive()) continue;
                const output = await capture(windowId, before);
                await check();
                const after = await observe(false);
                if (!await isTargetActive() || !after.visible || before.key !== after.key) continue;
                return {...output, metadata: {...output.metadata, freshness: {
                    capturedAt: new Date().toISOString(), elapsedMs: Date.now() - start, attempts: attempt,
                    settled: before.settled, checked: 'document, DOM revision, viewport and active tab',
                }}};
            } catch (error) {
                // Retry only document replacement races; permission/debugger
                // errors propagate instead of silently weakening verification.
                if (attempt === 3 || !/Execution context was destroyed|Cannot find context|No frame with given id|Frame with the given id was not found|Frame was removed|document unloaded/i.test(String(error))) throw error;
            }
        }
        throw new Error('Page kept changing during screenshot capture. Wait for the relevant UI to finish updating before capturing again.');
    });
    windows.set(windowId, task);
    try { return await task; }
    finally { if (windows.get(windowId) === task) windows.delete(windowId); }
}

export async function captureViewportScreenshot(tabId: number, maxWidth: number | undefined, check: Check = async () => {}) {
    return withFreshScreenshot(tabId, check, async (windowId, before) => {
        let dataUrl = await captureVisibleTab(windowId, check);
        const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
        try {
            const sourcePixels = {width: bitmap.width, height: bitmap.height};
            let imagePixels = sourcePixels;
            if (maxWidth && maxWidth > 0 && bitmap.width > maxWidth) {
                const canvas = new OffscreenCanvas(maxWidth, Math.max(1, Math.round(bitmap.height * maxWidth / bitmap.width)));
                canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
                const bytes = new Uint8Array(await (await canvas.convertToBlob({type: 'image/jpeg', quality: 0.8})).arrayBuffer());
                let binary = '';
                for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
                dataUrl = 'data:image/jpeg;base64,' + btoa(binary);
                imagePixels = {width: canvas.width, height: canvas.height};
            }
            const viewport = before.metrics.visualViewport ?? before.metrics.viewport;
            return {dataUrl, metadata: {...before.metrics, sourcePixels, imagePixels, coordinateSpace: 'root viewport CSS pixels',
                cssRegion: {x: viewport.offsetLeft ?? 0, y: viewport.offsetTop ?? 0, width: viewport.width, height: viewport.height},
                imagePixelsPerCSSPixel: {x: imagePixels.width / viewport.width, y: imagePixels.height / viewport.height}}};
        } finally { bitmap.close(); }
    });
}

/** Longest side of a picked-element preview; it is only ever shown in the panel. */
const PICK_PREVIEW_MAX = 640;

/**
 * Crops the visible tab to one element's box for the picker's preview. `rect` is
 * in viewport CSS pixels and `viewport` is the page's inner size; the ratio to the
 * captured bitmap absorbs both devicePixelRatio and browser zoom.
 */
export async function captureRegion(windowId: number, rect: {x: number; y: number; width: number; height: number},
    viewport: {width: number; height: number}) {
    const bitmap = await createImageBitmap(await (await fetch(await captureVisibleTab(windowId, async () => {}))).blob());
    try {
        const sx = bitmap.width / viewport.width, sy = bitmap.height / viewport.height;
        const left = Math.max(0, Math.floor(rect.x * sx)), top = Math.max(0, Math.floor(rect.y * sy));
        const width = Math.min(bitmap.width, Math.ceil((rect.x + rect.width) * sx)) - left;
        const height = Math.min(bitmap.height, Math.ceil((rect.y + rect.height) * sy)) - top;
        if (width < 1 || height < 1) return null;
        const scale = Math.min(1, PICK_PREVIEW_MAX / Math.max(width, height));
        const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        canvas.getContext('2d')!.drawImage(bitmap, left, top, width, height, 0, 0, canvas.width, canvas.height);
        const bytes = new Uint8Array(await (await canvas.convertToBlob({type: 'image/webp', quality: 0.9})).arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return 'data:image/webp;base64,' + btoa(binary);
    } finally { bitmap.close(); }
}
