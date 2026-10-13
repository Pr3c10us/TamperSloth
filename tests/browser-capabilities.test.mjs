import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createLoader, invoke, plain} from './load-ts.mjs';

function eventBus() {
    const listeners = new Set();
    return {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
        fire: (...args) => { for (const fn of listeners) fn(...args); }, listeners};
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(seed = {}) {
    const saved = structuredClone(seed), session = {}, commands = [], downloads = [], tabs = new Map([[7, {id: 7, windowId: 1, url: 'https://example.com', title: 'Page'}]]);
    const area = target => ({get: async key => key === null ? structuredClone(target) : Array.isArray(key)
            ? Object.fromEntries(key.filter(k => Object.hasOwn(target, k)).map(k => [k, structuredClone(target[k])]))
            : {[key]: structuredClone(target[key])}, getKeys: async () => Object.keys(target),
        set: async value => { Object.assign(target, structuredClone(value)); }, remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete target[key]; }});
    const chrome = {
        storage: {local: area(saved), session: area(session)},
        action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {}},
        tabs: {onCreated: eventBus(), onRemoved: eventBus(), query: async options => [...tabs.values()].filter(tab =>
            (options?.windowId === undefined || tab.windowId === options.windowId) && (!options?.active || tab.active)),
            get: async id => { if (!tabs.has(id)) throw new Error('Tab gone'); return tabs.get(id); },
            create: async options => { const tab = {id: 8, windowId: 1, ...options}; tabs.set(8, tab); chrome.tabs.onCreated.fire(tab); return tab; },
            update: async (id, options) => {
                if (!tabs.has(id)) throw new Error('Tab gone');
                if (options.active) for (const tab of tabs.values()) if (tab.windowId === tabs.get(id).windowId) tab.active = false;
                Object.assign(tabs.get(id), options); return tabs.get(id);
            },
            remove: async id => { tabs.delete(id); chrome.tabs.onRemoved.fire(id); }},
        windows: {update: async () => {}},
        debugger: {onEvent: eventBus(), onDetach: eventBus(), attach: async target => { commands.push({method: 'attach', target}); },
            detach: async target => { commands.push({method: 'detach', target}); chrome.debugger.onDetach.fire(target); },
            sendCommand: async (target, method, params) => {
                commands.push({target, method, params});
                if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: 'main', url: 'https://example.com'}}};
                if (method === 'Page.createIsolatedWorld') return {executionContextId: 11};
                if (method === 'Page.captureScreenshot') return {data: 'aW1hZ2U='};
                if (method === 'DOMDebugger.getEventListeners') return {listeners: []};
                if (method === 'DOM.resolveNode') return {object: {objectId: 'node'}};
                if (method === 'Runtime.evaluate' && params.expression === 'document') return {result: {objectId: 'doc'}};
                if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothScreenshot')) {
                    return {result: {value: {key: 'document-1:0', settled: true, visible: true}}};
                }
                if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothPerception')) {
                    const args = JSON.parse(params.expression.slice(params.expression.lastIndexOf(')(') + 2, -1));
                    const metrics = {url: 'https://example.com', scroll: {x: 0, y: 0}, viewport: {width: 400, height: 300}, devicePixelRatio: 2};
                    if (args.action === 'metrics') return {result: {value: metrics}};
                    if (args.action === 'marks') return {result: {value: {metrics, marks: [{id: 1, selector: '#send', role: 'button', name: 'Send', bbox: {x: 10, y: 20, width: 40, height: 20}, center: {x: 30, y: 30}, source: 'dom', hitTest: true}], candidateLimitReached: false}}};
                    if (args.action === 'resolve') {
                        if (args.target.selector === '.ambiguous') return {exceptionDetails: {text: 'Target is ambiguous'}};
                        if (args.target.selector === '#occluded') return {exceptionDetails: {text: 'Target is occluded'}};
                        return {result: {value: {point: args.target.x !== undefined ? args.target : {x: 30, y: 30}, target: {tag: 'button', role: 'button', name: 'Send'}, hit: {tag: 'button', name: 'Send'}, metrics}}};
                    }
                    if (args.action === 'observeStart') return {result: {value: {url: 'https://example.com', focus: null, dialogs: []}}};
                    if (args.action === 'observeEnd') return {result: {value: {focusMoved: true, mutationCount: 1, mutations: [{type: 'childList'}], events: [{type: 'click', trusted: true, target: {tag: 'button', name: 'Send'}}], newDialogs: []}}};
                }
                if (method === 'DOM.getFlattenedDocument') return {nodes: [{nodeType: 9, nodeId: 1}, {nodeType: 11, nodeId: 2, shadowRootType: 'closed'}, {nodeType: 1, nodeId: 3, backendNodeId: 13}]};
                if (method === 'DOM.querySelectorAll') return {nodeIds: params.nodeId === 2 ? [3] : []};
                if (method === 'Network.getResponseBody') return {body: 'x'.repeat(110000), base64Encoded: false};
                if (method === 'Runtime.evaluate') return {result: {value: {status: 200}}};
                if (method === 'Accessibility.getFullAXTree') return {nodes: [{role: {value: 'RootWebArea'}}, {role: {value: 'button'}}]};
                return {};
            }},
        userScripts: {configureWorld: async () => {}, execute: async ({target, world, js}) => {
            commands.push({method: 'userScripts.execute', target, world});
            const value = await vm.runInNewContext(js[0].code, {setTimeout, clearTimeout, performance});
            return (target.frameIds ?? [0]).map(frameId => ({frameId, documentId: 'doc', result: value}));
        }},
        scripting: {executeScript: async () => [{frameId: 0, result: {source: 'dom-derived', nodes: []}}]},
        runtime: {sendMessage: async msg => msg.type === 'CLIPBOARD_OFFSCREEN' ? msg.action === 'read' ? {text: 'clipboard text'} : {ok: true} : call(msg)},
        offscreen: {hasDocument: async () => true, Reason: {CLIPBOARD: 'CLIPBOARD'}},
        notifications: {create: async args => { commands.push({method: 'notify', params: args}); return 'notification-1'; }},
        downloads: {download: async args => { downloads.push(args); return 0; }, search: async ({id}) => [{id, state: 'complete'}], cancel: async () => {}},
    };
    const canvasOps = [];
    class Canvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return Object.fromEntries(['drawImage', 'scale', 'translate', 'strokeRect', 'fillRect', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'stroke'].map(method => [method, (...args) => canvasOps.push({method, args})]).concat([
            ['measureText', text => ({width: text.length * 7})], ['getImageData', () => ({data: new Uint8ClampedArray(this.width * this.height * 4)})],
        ])); }
        async convertToBlob() { return new Blob(['png']); }
    }
    const load = createLoader({globals: {chrome, OffscreenCanvas: Canvas, createImageBitmap: async () => ({width: 800, height: 600, close() {}}),
        fetch: async () => ({blob: async () => new Blob(['png'])}), btoa: s => Buffer.from(s, 'binary').toString('base64')}, mocks: {'@/src/chat/lib/storage.ts': {
        loadScripts: async () => [
            {id: 'saved-1', name: 'Test', code: 'function main() { return 1; }', status: 'active', urlMatchPattern: 'https://example.com/*'},
            {id: 'paused-1', name: 'Paused', code: 'function main() {}', status: 'paused', urlMatchPattern: 'https://example.com/*'},
        ],
        getScriptValue: async () => null, setScriptValue: async () => {}, deleteScriptValue: async () => {}, listScriptValues: async () => ({}),
    }}});
    const service = load('src/background/browserService.ts');
    const call = message => service.handleBrowserMessage(message);
    const run = (operation, input) => call({type: 'BROWSER_CALL', operation, input});
    return {load, service, run, call, chrome, commands, saved, session, downloads, tabs, canvasOps};
}

test('legacy stopped state does not block browser actions or recreate an audit log', async () => {
    const f = fixture({ts_browser_control: {stopped: true, epoch: 5}});
    await f.run('tabs', {action: 'create', url: 'https://example.com'});
    assert.equal(f.tabs.size, 2);
    assert.equal(f.saved.ts_browser_audit, undefined);
    for (const type of ['BROWSER_STOP', 'BROWSER_RESUME', 'BROWSER_STATUS', 'BROWSER_AUDIT', 'BROWSER_BEGIN', 'BROWSER_CHECK', 'BROWSER_END']) {
        await assert.rejects(f.call({type}), /Unknown browser message/);
    }
});

test('tab selection retargets existing page tools and popups track their opener', async () => {
    const f = fixture();
    const tools = f.load('src/chat/lib/tools.ts').createAgentTools({conversationId: 'test'});
    const created = await invoke(tools, 'browserTabs', {action: 'create', url: 'https://example.com/popup', openerTabId: 7});
    assert.equal(created.output.tabId, 8);
    assert.equal((await invoke(tools, 'getCurrentTab')).output.tabId, 8);
    assert.equal((await f.run('tabs', {action: 'waitPopup', openerTabId: 7})).tabId, 8);
    await invoke(tools, 'browserTabs', {action: 'select', tabId: 7});
    assert.equal((await invoke(tools, 'getCurrentTab')).output.tabId, 7);
    await assert.rejects(f.run('tabs', {action: 'create', url: 'chrome://extensions'}), /HTTP/);
});

test('raw JS uses isolated world, structured values and per-frame errors', async () => {
    const f = fixture();
    const result = await f.run('evaluate', {tabId: 7, frameIds: [0, 2], code: 'return {answer: await Promise.resolve(42), large: 12n};'});
    assert.equal(f.commands.at(-1).world, 'USER_SCRIPT');
    assert.equal(result.frames.length, 2);
    assert.deepEqual(plain(result.frames[0].result.value), {answer: 42, large: {type: 'bigint', value: '12'}});
    const failure = await f.run('evaluate', {tabId: 7, code: 'throw new TypeError("bad value");'});
    assert.equal(failure.frames[0].result.ok, false);
    assert.equal(failure.frames[0].result.error.name, 'TypeError');
    const timeout = await f.run('evaluate', {tabId: 7, code: 'await new Promise(() => {});', timeoutMs: 100});
    assert.match(timeout.frames[0].result.error.message, /timed out/);
    await f.run('evaluate', {tabId: 7, code: 'return null;', world: 'MAIN'});
    assert.equal(f.commands.at(-1).world, 'MAIN');
});

test('persistent namespaces and site recipes round-trip independently of service lifetime', async () => {
    const f = fixture();
    await f.run('store', {action: 'set', namespace: 'site:a', key: '__proto__', value: {count: 3}});
    await f.run('store', {action: 'set', namespace: 'site:b', key: '__proto__', value: false});
    const restarted = fixture(f.saved);
    assert.deepEqual(plain(await restarted.run('store', {action: 'get', namespace: 'site:a', key: '__proto__'})), {found: true, value: {count: 3}});
    assert.equal((await restarted.run('store', {action: 'get', namespace: 'site:b', key: '__proto__'})).value, false);
    await restarted.run('recipes', {action: 'save', id: 'recipe-1', recipe: {name: 'Search', origin: 'https://example.com/path', steps: ['Find search field', 'Enter query']}});
    assert.equal((await restarted.run('recipes', {action: 'get', id: 'recipe-1'})).recipe.origin, 'https://example.com');
    await assert.rejects(restarted.run('recipes', {action: 'save', id: '__proto__', recipe: {name: 'x', origin: 'https://example.com', steps: ['x']}}), /Invalid recipe/);
});

test('shared CDP attachment captures WebSockets with bounded buffers and releases on stop', async () => {
    const f = fixture();
    await Promise.all([f.run('network', {action: 'start', tabId: 7}), f.run('network', {action: 'start', tabId: 7})]);
    assert.equal(f.commands.filter(c => c.method === 'attach').length, 1);
    for (let i = 0; i < 505; i++) f.chrome.debugger.onEvent.fire({tabId: 7}, 'Network.webSocketFrameReceived', {requestId: 'ws', response: {payloadData: String(i)}});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Network.webSocketFrameSent', {requestId: 'ws', response: {payloadData: 'x'.repeat(30000)}});
    const read = await f.run('network', {action: 'read', tabId: 7});
    assert.equal(read.events.length, 500);
    assert.equal(read.dropped, 6);
    assert.equal(read.events.at(-1).params.truncated, true);
    assert.equal((await f.run('network', {action: 'read', tabId: 7, after: read.cursor})).events.length, 0);
    const body = await f.run('network', {action: 'body', tabId: 7, requestId: 'request-1'});
    assert.equal(body.body.length, 100000);
    assert.equal(body.truncated, true);
    await f.run('network', {action: 'stop', tabId: 7});
    assert.deepEqual(plain(f.service.cdp.status()), []);
    assert.ok(f.commands.some(c => c.method === 'detach'));
});

test('child frame sessions and closed shadow roots can be inspected', async () => {
    const f = fixture();
    await f.run('network', {action: 'start', tabId: 7});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Target.attachedToTarget', {sessionId: 'child', targetInfo: {type: 'iframe', url: 'https://other.example'}});
    await tick();
    f.chrome.debugger.onEvent.fire({tabId: 7, sessionId: 'child'}, 'Runtime.executionContextCreated', {context: {id: 5, auxData: {frameId: 'frame-2'}}});
    const frames = await f.run('dom', {action: 'frames', tabId: 7});
    assert.equal(frames.sessions[0].sessionId, 'child');
    assert.equal(frames.contexts[0].id, 5);
    assert.ok(f.commands.some(c => c.target.sessionId === 'child' && c.method === 'Target.setAutoAttach'));
    assert.deepEqual(plain((await f.run('dom', {action: 'query', tabId: 7, sessionId: 'child', selector: 'button'})).nodeIds), [3]);
    assert.ok(f.commands.some(c => c.method === 'DOM.getFlattenedDocument' && c.params.pierce));
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Target.detachedFromTarget', {sessionId: 'child'});
    await assert.rejects(f.run('dom', {action: 'snapshot', tabId: 7, sessionId: 'child'}), /Unknown or detached/);
});

test('trusted mouse/key/touch/drag dispatch validated CDP sequences', async () => {
    const f = fixture();
    await f.run('input', {tabId: 7, action: 'mouse', type: 'mouseMoved', x: 10, y: 20});
    await f.run('input', {tabId: 7, action: 'key', type: 'keyDown', key: 'Enter', code: 'Enter', keyCode: 13});
    await f.run('input', {tabId: 7, action: 'touch', type: 'touchStart', points: [{x: 10, y: 20, id: 0}]});
    await f.run('input', {tabId: 7, action: 'drag', from: {x: 0, y: 0}, to: {x: 100, y: 200}, steps: 2});
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchKeyEvent' && c.params.windowsVirtualKeyCode === 13));
    assert.equal(f.commands.filter(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mouseReleased').length, 1);
    await assert.rejects(f.run('input', {tabId: 7, action: 'touch', type: 'touchEnd', points: [{x: 0, y: 0}]}), /empty points/);
    await assert.rejects(f.run('input', {tabId: 7, action: 'mouse', type: 'arbitraryCommand', x: 0, y: 0}), /Invalid mouse/);
});

test('captured request replay preserves method/body and uses page credentials', async () => {
    const f = fixture();
    await f.run('network', {action: 'start', tabId: 7});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Network.requestWillBeSent', {requestId: 'post', request: {url: 'https://example.com/api', method: 'POST', postData: 'hello', headers: {Cookie: 'secret', 'Content-Type': 'text/plain'}}});
    await f.run('network', {action: 'replay', tabId: 7, requestId: 'post'});
    const expression = f.commands.find(c => c.method === 'Runtime.evaluate').params.expression;
    assert.ok(expression.includes('"method":"POST"'));
    assert.ok(expression.includes('"body":"hello"'));
    assert.ok(expression.includes('"credentials":"include"'));
    assert.ok(!expression.includes('secret'));
    await assert.rejects(f.run('network', {action: 'replay', tabId: 7, requestId: 'missing'}), /unavailable/);
});

test('clipboard, downloads, notifications and AX trees use their extension APIs', async () => {
    const f = fixture();
    assert.equal((await f.run('clipboard', {action: 'read'})).text, 'clipboard text');
    await f.run('clipboard', {action: 'write', text: 'new text'});
    assert.equal((await f.run('download', {action: 'start', url: 'https://example.com/file', filename: 'report.txt'})).downloadId, 0);
    assert.equal((await f.run('download', {action: 'status', downloadId: 0})).downloads[0].state, 'complete');
    assert.equal((await f.run('notify', {title: 'Done', message: 'Task finished'})).notificationId, 'notification-1');
    const tree = await f.run('accessibility', {tabId: 7, mode: 'cdp', maxNodes: 1});
    assert.equal(tree.nodes.length, 1);
    assert.equal(tree.truncated, true);
    assert.equal((await f.run('accessibility', {tabId: 7})).frames[0].result.source, 'dom-derived');
});

test('ordinary tools do not require the removed automation service', async () => {
    const f = fixture({ts_browser_control: {stopped: true}});
    const raw = f.load('src/chat/lib/tools.ts').createAgentTools({conversationId: 'test'});
    raw.getCurrentTab.execute = async () => ({tabId: 7});
    f.chrome.runtime.sendMessage = async () => { assert.fail('Unexpected automation IPC'); };
    const runtime = f.load('src/chat/lib/toolRuntime.ts').createToolRuntime(raw, {request: '', findPrevious: () => undefined});
    assert.equal((await invoke(runtime.tools, 'getCurrentTab')).output.tabId, 7);
});

test('chat cancellation still prevents later page mutations', async () => {
    const f = fixture();
    const controller = new AbortController();
    const tools = f.load('src/chat/lib/tools.ts').createAgentTools({conversationId: 'test', abortSignal: controller.signal});
    let injected = false;
    f.chrome.scripting.executeScript = async () => { injected = true; return [{result: {text: 'x'}}]; };
    controller.abort();
    await assert.rejects(invoke(tools, 'getPageText'), {name: 'AbortError'});
    assert.equal(injected, false);
});

test('saved scripts recover from legacy stopped state and browser messages remain restricted', async () => {
    const f = fixture({ts_browser_control: {stopped: true, epoch: 3}, ts_browser_audit: [{operation: 'killSwitch'}]});
    let registrations = [];
    Object.assign(f.chrome.runtime, {id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path,
        onMessage: eventBus(), onUserScriptMessage: eventBus()});
    f.chrome.storage.onChanged = eventBus();
    f.chrome.sidePanel = {setOptions: async () => {}, open: async () => {}};
    f.chrome.action.onClicked = eventBus();
    f.chrome.alarms = {create: async () => {}, onAlarm: eventBus()};
    Object.assign(f.chrome.userScripts, {getScripts: async () => registrations,
        register: async scripts => { registrations = scripts; }, unregister: async () => { registrations = []; }});
    f.load('src/background/index.ts');
    await tick();
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].id, 'tampersloth_saved-1', 'Paused scripts stay paused');
    const listener = [...f.chrome.runtime.onMessage.listeners][0];
    const send = (message, sender) => new Promise(resolve => listener(message, sender, resolve));
    const denied = await send({type: 'BROWSER_CALL', operation: 'tabs', input: {action: 'list'}}, {id: 'extension-id', url: 'https://evil.example', tab: {id: 7}});
    assert.match(denied.error, /restricted/);
    assert.equal(f.saved.ts_browser_control, undefined);
    assert.equal(f.saved.ts_browser_audit, undefined);
    const sender = {id: 'extension-id', url: 'chrome-extension://extension-id/index.html'};
    assert.match((await send({type: 'BROWSER_STOP'}, sender)).error, /Unknown browser message/);
    assert.equal(registrations.length, 1);
    assert.equal((await send({type: 'BROWSER_CALL', operation: 'tabs', input: {action: 'list'}}, sender)).tabs.length, 1);
    const scriptListener = [...f.chrome.runtime.onUserScriptMessage.listeners][0];
    const scriptResponse = await new Promise(resolve => scriptListener({type: 'SCRIPT_SET_VALUE', scriptId: 'saved-1', key: 'count', value: 1}, {}, resolve));
    assert.equal(scriptResponse.ok, true);
});

test('offscreen clipboard accepts the owning service worker without a page URL', async () => {
    const onMessage = eventBus();
    let text = '';
    const load = createLoader({globals: {
        navigator: {clipboard: {writeText: async value => { text = value; }, readText: async () => text}},
        chrome: {runtime: {id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path, onMessage}},
    }});
    load('src/background/clipboard.ts');
    const listener = [...onMessage.listeners][0];
    const send = message => new Promise(resolve => listener(message, {id: 'extension-id'}, resolve));
    assert.equal((await send({type: 'CLIPBOARD_OFFSCREEN', action: 'write', text: 'hello'})).ok, true);
    assert.equal((await send({type: 'CLIPBOARD_OFFSCREEN', action: 'read'})).text, 'hello');
    assert.equal(listener({type: 'CLIPBOARD_OFFSCREEN', action: 'read'}, {id: 'other-extension'}, () => assert.fail('Unexpected response')), false);
});

test('marked screenshots preserve legend and pixel transforms through zoom and image projection', async () => {
    const f = fixture();
    const marked = await f.run('perception', {tabId: 7});
    assert.equal(marked.legend[0].name, 'Send');
    assert.equal(marked.legend[0].hitTest, true);
    assert.equal(marked.metadata.devicePixelRatio, 2);
    assert.equal(marked.metadata.imagePixels.width, 800);
    assert.equal(marked.metadata.devicePixelsPerCSSPixel.x, 2);
    const grid = await f.run('perception', {tabId: 7, mode: 'grid'});
    const zoom = await f.run('perception', {tabId: 7, mode: 'grid', snapshotId: grid.snapshotId, region: 'C3', scale: 3, gridSize: 10, crosshair: {x: 250, y: 250}});
    assert.deepEqual(plain(zoom.metadata.cssRegion), {x: 200, y: 200, width: 100, height: 100});
    assert.deepEqual(plain(zoom.metadata.imagePixels), {width: 600, height: 600});
    assert.equal(zoom.cells[0].x, 200);
    assert.ok(f.canvasOps.some(op => op.method === 'moveTo' && op.args[0] === 238));
    const tools = f.load('src/chat/lib/tools.ts').createAgentTools({conversationId: 'test'});
    const runtime = f.load('src/chat/lib/toolRuntime.ts').createToolRuntime(tools, {request: 'screenshot', findPrevious: () => undefined});
    const projected = await invoke(runtime.tools, 'takeMarkedScreenshot');
    assert.equal(projected.projected.value[0].mediaType, 'image/png');
    assert.ok(projected.projected.value[1].text.includes('"legend"'));
    const recovered = await invoke(runtime.tools, 'readToolResult', {resultId: projected.id});
    assert.equal(recovered.projected.value[0].mediaType, 'image/png');
    assert.ok(recovered.projected.value[1].text.includes('Send'));
});

test('raced marked screenshots rebuild their legend with the replacement image and post-action views verify freshness', async () => {
    const f = fixture();
    const original = f.chrome.debugger.sendCommand;
    let revision = 0, captures = 0;
    f.chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothScreenshot')) {
            return {result: {value: {key: `doc:${revision}`, settled: true, visible: true}}};
        }
        const result = await original(target, method, params);
        if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothPerception') && params.expression.endsWith('})')) {
            if (result.result?.value?.marks) result.result.value.marks[0].name = revision ? 'Updated control' : 'Old control';
        }
        if (method === 'Page.captureScreenshot' && ++captures === 1) revision++;
        return result;
    };
    const screenshot = await f.run('perception', {tabId: 7});
    assert.equal(captures, 2);
    assert.equal(screenshot.legend[0].name, 'Updated control');
    assert.equal(screenshot.metadata.freshness.attempts, 2);
    const action = await f.run('gesture', {tabId: 7, target: {selector: '#send'}, feedbackMs: 0, postScreenshot: true});
    assert.equal(action.postAction.metadata.freshness.attempts, 1);
    assert.equal(action.postAction.metadata.freshness.settled, true);
    assert.ok(action.screenshot.startsWith('data:image/png'));
});

test('semantic and marked clicks return feedback and prevent ambiguous or occluded input', async () => {
    const f = fixture();
    const click = await f.run('gesture', {tabId: 7, target: {selector: '#send'}, feedbackMs: 0});
    assert.deepEqual(plain(click.resolved.point), {x: 30, y: 30});
    assert.equal(click.feedback.events[0].target.name, 'Send');
    assert.equal(click.feedback.focusMoved, true);
    const snapshot = await f.run('perception', {tabId: 7});
    await f.run('gesture', {tabId: 7, target: {mark: 1, snapshotId: snapshot.snapshotId}, feedbackMs: 0});
    const count = f.commands.filter(c => c.method === 'Input.dispatchMouseEvent').length;
    await assert.rejects(f.run('gesture', {tabId: 7, target: {selector: '.ambiguous'}, feedbackMs: 0}), /ambiguous/);
    await assert.rejects(f.run('gesture', {tabId: 7, target: {selector: '#occluded'}, feedbackMs: 0}), /occluded/);
    await assert.rejects(f.run('gesture', {tabId: 7, target: {mark: 1, snapshotId: 'missing'}, feedbackMs: 0}), /expired/);
    assert.equal(f.commands.filter(c => c.method === 'Input.dispatchMouseEvent').length, count);
});

test('composite keyboard and touch gestures create complete input sequences', async () => {
    const f = fixture();
    await f.run('gesture', {tabId: 7, action: 'press', chord: 'Ctrl+Shift+K', feedbackMs: 0});
    const keys = f.commands.filter(c => c.method === 'Input.dispatchKeyEvent').map(c => `${c.params.type}:${c.params.key}`);
    assert.deepEqual(keys, ['keyDown:Control', 'keyDown:Shift', 'keyDown:K', 'keyUp:K', 'keyUp:Shift', 'keyUp:Control']);
    await f.run('gesture', {tabId: 7, action: 'pinch', target: {x: 200, y: 150}, factor: 2, steps: 2, duration: 0, feedbackMs: 0});
    const touches = f.commands.filter(c => c.method === 'Input.dispatchTouchEvent');
    assert.equal(touches.length, 4);
    assert.equal(touches[0].params.touchPoints.length, 2);
    assert.equal(touches.at(-1).params.type, 'touchEnd');
    assert.deepEqual(plain(touches.at(-1).params.touchPoints), []);
});

test('nested cross-origin frame offsets compose before trusted input dispatch', async () => {
    const f = fixture();
    const original = f.chrome.debugger.sendCommand;
    f.chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === 'Page.getFrameTree') {
            const tree = target.sessionId === 'nested'
                ? {frame: {id: 'nested-frame', parentId: 'child-frame'}}
                : target.sessionId === 'child'
                    ? {frame: {id: 'child-frame', parentId: 'main'}, childFrames: [{frame: {id: 'nested-frame', parentId: 'child-frame'}}]}
                    : {frame: {id: 'main'}, childFrames: [{frame: {id: 'child-frame', parentId: 'main'}}]};
            return {frameTree: tree};
        }
        if (method === 'DOM.getFrameOwner') return {backendNodeId: 55};
        if (method === 'Runtime.callFunctionOn' && params.functionDeclaration.includes('DOMMatrix')) return {result: {value: target.sessionId === 'child' ? {x: 10, y: 20, scaleX: 2, scaleY: 2} : {x: 100, y: 50, scaleX: 1, scaleY: 1}}};
        return original(target, method, params);
    };
    await f.run('network', {action: 'start', tabId: 7});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Target.attachedToTarget', {sessionId: 'child', targetInfo: {type: 'iframe', targetId: 'child-frame'}});
    f.chrome.debugger.onEvent.fire({tabId: 7, sessionId: 'child'}, 'Target.attachedToTarget', {sessionId: 'nested', targetInfo: {type: 'iframe', targetId: 'nested-frame'}});
    await tick();
    const click = await f.run('gesture', {tabId: 7, sessionId: 'nested', target: {selector: '#send'}, feedbackMs: 0});
    assert.deepEqual(plain(click.resolved.localPoint), {x: 30, y: 30});
    assert.deepEqual(plain(click.resolved.point), {x: 170, y: 130});
    const press = f.commands.find(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mousePressed');
    assert.equal(press.target.sessionId, undefined, 'Input uses the root main-frame viewport');
    assert.equal(press.params.x, 170);
    assert.equal(press.params.y, 130);
});

test('network capture stop releases raw held keys, mouse and touch before debugger detach', async () => {
    const f = fixture();
    await f.run('input', {tabId: 7, action: 'key', type: 'keyDown', key: 'Control', code: 'ControlLeft', keyCode: 17, feedbackMs: 0});
    await f.run('input', {tabId: 7, action: 'mouse', type: 'mousePressed', x: 10, y: 10, button: 'left', feedbackMs: 0});
    await f.run('input', {tabId: 7, action: 'touch', type: 'touchStart', points: [{x: 20, y: 20, id: 0}], feedbackMs: 0});
    await f.run('network', {action: 'stop', tabId: 7});
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchKeyEvent' && c.params.type === 'keyUp'));
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mouseReleased'));
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchTouchEvent' && c.params.type === 'touchEnd'));
    const release = f.commands.findIndex(c => c.method === 'Input.dispatchKeyEvent' && c.params.type === 'keyUp');
    const detach = f.commands.findIndex(c => c.method === 'detach');
    assert.ok(release < detach);
});

test('manifest and build entries include all platform permissions and clipboard service', () => {
    const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
    for (const permission of ['debugger', 'downloads', 'notifications', 'clipboardRead', 'clipboardWrite', 'offscreen']) assert.ok(manifest.permissions.includes(permission));
    assert.ok(fs.readFileSync('vite.config.ts', 'utf8').includes('clipboard.html'));
});

test('gesture projection drops duplicates and keeps full detail only when suspicious', () => {
    const {compactGestureOutput} = createLoader({globals: {chrome: {}}})('src/chat/lib/browserTools.ts');
    const target = {tag: 'button', role: 'button', name: 'Send', selector: '#send'};
    const focus = {tag: 'input', role: 'textbox', name: 'Message', selector: '#msg'};
    const result = (events, targetMatched = true) => ({ok: true, action: 'click',
        resolved: {point: {x: 5, y: 5}, localPoint: {x: 5, y: 5}, frameOffset: {x: 0, y: 0, scaleX: 1, scaleY: 1},
            bbox: {x: 0, y: 0, width: 10, height: 10}, target, hit: target, metrics: {url: 'https://a.test/', scroll: {x: 0, y: 0}}},
        feedback: {before: {url: 'https://a.test/', focus: null, dialogs: []}, after: {url: 'https://a.test/', focus, dialogs: []},
            focusMoved: true, urlChanged: false, newDialogs: [], mutationCount: 3, mutations: [{type: 'childList'}], events,
            actualHit: target, expectedTarget: target, targetMatched, tabURL: {before: 'https://a.test/', after: 'https://a.test/'}, javascriptDialogs: []}});
    const events = [{type: 'mousedown', trusted: true, target, hit: target}, {type: 'click', trusted: true, target, hit: target}];

    const slim = plain(compactGestureOutput(result(events)));
    assert.equal(slim.feedback.events, undefined);
    assert.equal(slim.feedback.mutations, undefined);
    assert.equal(slim.feedback.before, undefined);
    assert.equal(slim.feedback.expectedTarget, undefined);
    assert.equal(slim.feedback.tabURL, undefined);
    assert.equal(slim.feedback.url, 'https://a.test/');
    assert.deepEqual(slim.feedback.eventTypes, ['mousedown', 'click']);
    assert.deepEqual(slim.feedback.focus, focus);
    assert.equal(slim.feedback.mutationCount, 3);
    assert.equal(slim.feedback.targetMatched, true);
    assert.deepEqual(slim.feedback.actualHit, target);
    assert.equal(slim.resolved.hit, undefined);
    assert.equal(slim.resolved.localPoint, undefined);
    assert.equal(slim.resolved.metrics.url, undefined);
    assert.ok(JSON.stringify(slim).length < JSON.stringify(result(events)).length / 2);

    for (const suspicious of [result(events, false), result([]), result([{...events[0], trusted: false}])]) {
        const kept = plain(compactGestureOutput(suspicious));
        assert.deepEqual(kept.feedback.events, suspicious.feedback.events);
        assert.deepEqual(kept.feedback.mutations, suspicious.feedback.mutations);
        assert.ok(kept.feedback.before);
    }
});

test('browserGesture runs a batch in order and reports completed steps on failure', async () => {
    const calls = [];
    let failAt = -1;
    const chrome = {runtime: {sendMessage: async ({operation, input}) => {
        calls.push({operation, input});
        if (calls.length - 1 === failAt) return {error: 'Target is occluded'};
        const feedback = {events: [{type: 'mousedown', trusted: true}], mutationCount: 1, mutations: [{type: 'childList'}], targetMatched: true,
            tabURL: {before: 'https://a.test/', after: 'https://a.test/'}};
        return {ok: true, action: input.action, resolved: {point: {x: 1, y: 1}, metrics: {url: 'https://a.test/', scroll: {x: 0, y: 0}}}, feedback,
            ...(input.postScreenshot ? {screenshot: 'data:image/png;base64,aW1hZ2U=', postAction: {metadata: {imagePixels: {width: 200, height: 150}}}} : {})};
    }}};
    const load = createLoader({globals: {chrome}});
    const {browserSchemas} = load('src/chat/lib/browserSchemas.ts');
    const tools = load('src/chat/lib/browserTools.ts').createBrowserTools(() => 7, () => {});
    const input = tools.browserGesture.inputSchema.parse({feedbackMs: 0, postScreenshot: true, gestures: [
        {action: 'drag', from: {x: 10, y: 10}, to: {x: 90, y: 10}},
        {action: 'drag', from: {x: 90, y: 10}, to: {x: 90, y: 60}},
        {action: 'press', chord: 'Escape'},
    ]});
    const output = await tools.browserGesture.execute(input, {abortSignal: new AbortController().signal});
    assert.equal(output.ok, true);
    assert.equal(output.steps, 3);
    assert.deepEqual(calls.map(call => [call.input.action, call.input.tabId, call.input.feedbackMs, call.input.postScreenshot]),
        [['drag', 7, 0, false], ['drag', 7, 0, false], ['press', 7, 0, true]]);
    // Every step must still satisfy the browser service's full schema.
    for (const call of calls) assert.ok(browserSchemas.gesture.safeParse(call.input).success);
    assert.ok(output.screenshot);
    assert.equal(output.results[2].screenshot, undefined);
    const projected = tools.browserGesture.toModelOutput({output});
    assert.equal(projected.type, 'content');
    const text = JSON.parse(projected.value[1].text);
    assert.equal(text.results[0].resolved.metrics, undefined);
    assert.ok(text.results[2].resolved.metrics);
    assert.equal(text.results[0].feedback.events, undefined);

    calls.length = 0; failAt = 1;
    const failed = await tools.browserGesture.execute(input, {abortSignal: new AbortController().signal});
    assert.equal(failed.failedStep, 1);
    assert.match(failed.error, /occluded/);
    assert.equal(failed.completed.length, 1);
    assert.equal(calls.length, 2);

    calls.length = 0; failAt = 0;
    await assert.rejects(tools.browserGesture.execute(input, {abortSignal: new AbortController().signal}), /occluded/);
});

test('compact gesture schemas reject incomplete targets and clickTarget always clicks', async () => {
    const calls = [];
    const chrome = {runtime: {sendMessage: async ({input}) => { calls.push(input); return {ok: true}; }}};
    const tools = createLoader({globals: {chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(() => 7, () => {});
    assert.equal(tools.clickTarget.inputSchema.safeParse({target: {role: 'button'}}).success, false);
    assert.equal(tools.clickTarget.inputSchema.safeParse({target: {mark: 3}}).success, false);
    assert.equal(tools.browserGesture.inputSchema.safeParse({gestures: []}).success, false);
    await tools.clickTarget.execute(tools.clickTarget.inputSchema.parse({target: {role: 'button', name: 'Send'}}), {});
    assert.equal(calls[0].action, 'click');
    assert.equal(calls[0].tabId, 7);
});
