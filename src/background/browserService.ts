import {browserSchemas, type BrowserOperation} from '../chat/lib/browserSchemas';
import {CDPManager} from './cdp';
import {VisualBrowser} from './visualBrowser';

export const cdp = new CDPManager();
const visual = new VisualBrowser(cdp);
const popups: Array<{tabId: number; openerTabId: number; timestamp: number}> = [];
const popupReady = chrome.storage.session.get('ts_popup_tabs').then(data => {
    const previous = (data.ts_popup_tabs ?? []) as typeof popups;
    const ids = new Set(popups.map(p => p.tabId));
    popups.unshift(...previous.filter(p => !ids.has(p.tabId)));
    if (popups.length > 100) popups.splice(0, popups.length - 100);
});
chrome.tabs.onCreated.addListener(tab => {
    if (tab.id && tab.openerTabId) {
        popups.push({tabId: tab.id, openerTabId: tab.openerTabId, timestamp: Date.now()});
        if (popups.length > 100) popups.shift();
        void popupReady.then(() => chrome.storage.session.set({ts_popup_tabs: popups}));
    }
});
chrome.tabs.onRemoved.addListener(id => { void cdp.detach(id); });

const requireValue = <T,>(value: T | undefined, name: string): T => {
    if (value === undefined) throw new Error(`${name} is required for this action`);
    return value;
};
let storageChain: Promise<unknown> = Promise.resolve();
function storageTransaction<T>(fn: () => Promise<T>) {
    const task = storageChain.catch(() => {}).then(fn);
    storageChain = task;
    return task;
}
let offscreenPending: Promise<void> | undefined;
async function clipboard(action: string, text?: string) {
    if (!offscreenPending) offscreenPending = (async () => {
        if (!(await chrome.offscreen.hasDocument())) await chrome.offscreen.createDocument({
            url: 'clipboard.html', reasons: [chrome.offscreen.Reason.CLIPBOARD], justification: 'Read and write clipboard text for user requested browser tasks',
        });
    })().finally(() => { offscreenPending = undefined; });
    await offscreenPending;
    return chrome.runtime.sendMessage({type: 'CLIPBOARD_OFFSCREEN', action, text});
}

/** DOM-derived accessibility view for phase 1; the CDP mode supplies Chrome's AX tree. */
function readAccessibleDOM(maxNodes: number) {
    const nodes: unknown[] = [];
    let visited = 0;
    let truncated = false;
    const visit = (root: Document | ShadowRoot | Element, parent?: number) => {
        for (const el of Array.from(root.children)) {
            if (++visited > 10000 || nodes.length >= maxNodes) { truncated = true; return; }
            const style = getComputedStyle(el);
            if (el.getAttribute('aria-hidden') === 'true' || el.hasAttribute('hidden') || style.display === 'none' || style.visibility === 'hidden') continue;
            const role = el.getAttribute('role') ?? ({A: el.hasAttribute('href') ? 'link' : undefined, BUTTON: 'button', INPUT: (el as HTMLInputElement).type === 'checkbox' ? 'checkbox' : 'textbox',
                SELECT: 'combobox', TEXTAREA: 'textbox', IMG: 'img', H1: 'heading', H2: 'heading', H3: 'heading', NAV: 'navigation', MAIN: 'main'} as Record<string, string>)[el.tagName];
            let id = parent;
            if (role) {
                const labelled = (el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ').trim();
                const labels = (el as HTMLInputElement).labels;
                const name = labelled || el.getAttribute('aria-label') || (labels ? Array.from(labels).map(l => l.textContent).join(' ') : '') || el.getAttribute('alt') || el.getAttribute('title') || el.textContent || '';
                id = nodes.length;
                nodes.push({id, parent, role, name: name.trim().slice(0, 300), tag: el.tagName.toLowerCase(), elementId: el.id || undefined,
                    disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true', checked: el.getAttribute('aria-checked') ?? (el instanceof HTMLInputElement ? el.checked : undefined),
                    expanded: el.getAttribute('aria-expanded'), value: el instanceof HTMLInputElement && el.type !== 'password' ? el.value : undefined});
            }
            visit(el.shadowRoot ?? el, id);
        }
    };
    visit(document);
    return {source: 'dom-derived', nodes, truncated};
}

async function run(operation: BrowserOperation, input: unknown) {
    // The service revalidates every message, including messages bypassing the model tools.
    const a: any = browserSchemas[operation].parse(input);
    const tabId = a.tabId;
    switch (operation) {
        case 'perception': requireValue(tabId, 'tabId'); return visual.screenshot(a);
        case 'gesture': requireValue(tabId, 'tabId'); return visual.gesture(a);
        case 'tabs': {
            await popupReady;
            if (a.action === 'list') return {tabs: (await chrome.tabs.query({})).map(t => ({tabId: t.id, windowId: t.windowId, url: t.url, title: t.title, active: t.active, openerTabId: t.openerTabId})), popups};
            if (a.action === 'create') {
                const url = requireValue(a.url, 'url') as string;
                if (!/^https?:/.test(url)) throw new Error('Only HTTP(S) tab URLs are supported');
                const tab = await chrome.tabs.create({url, active: true, openerTabId: a.openerTabId});
                return {tabId: tab.id, url: tab.url};
            }
            if (a.action === 'close') { await chrome.tabs.remove(requireValue(tabId, 'tabId')); return {closed: tabId}; }
            if (a.action === 'select') {
                const tab = await chrome.tabs.update(requireValue(tabId, 'tabId'), {active: true});
                if (!tab) throw new Error('Tab no longer exists');
                await chrome.windows.update(tab.windowId, {focused: true});
                return {tabId: tab.id, url: tab.url, title: tab.title};
            }
            const opener = requireValue(a.openerTabId ?? tabId, 'openerTabId');
            const deadline = Date.now() + a.timeoutMs;
            while (Date.now() < deadline) {
                const popup = [...popups].reverse().find(p => p.openerTabId === opener);
                if (popup) {
                    try { const tab = await chrome.tabs.get(popup.tabId); return {...popup, url: tab.url, title: tab.title}; }
                    catch { popups.splice(popups.indexOf(popup), 1); }
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return {found: false, timedOut: true};
        }
        case 'evaluate': {
            const target = {tabId: requireValue(tabId, 'tabId'), ...(a.frameIds ? {frameIds: a.frameIds} : {})};
            // USER_SCRIPT is a separate isolated world with configurable CSP; extension ISOLATED forbids raw eval.
            await chrome.userScripts.configureWorld({csp: "script-src 'self' 'unsafe-eval'", messaging: true});
            const code = `(async () => { const start = performance.now(); let timer; try {
                const value = await Promise.race([(async () => { ${a.code}\n })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Evaluation timed out')), ${a.timeoutMs}); })]);
                const json = JSON.stringify(value, (_, v) => typeof v === 'bigint' ? {type: 'bigint', value: String(v)} : v);
                if (json && json.length > 1000000) throw new Error('Result exceeds 1 MB. Return a smaller result.');
                return {ok: true, value: json === undefined ? null : JSON.parse(json), valueType: typeof value, elapsedMs: performance.now() - start};
            } catch(e) { return {ok: false, error: {name: e?.name || 'Error', message: String(e?.message || e).slice(0, 2000)}, elapsedMs: performance.now() - start}; } finally { clearTimeout(timer); } })()`;
            const results = await chrome.userScripts.execute({target, world: a.world === 'MAIN' ? 'MAIN' : 'USER_SCRIPT', js: [{code}]});
            return {world: a.world, frames: results.map(r => ({...r, ...(r.error ? {result: {ok: false, error: {name: 'ExecutionError', message: r.error}}} : {})}))};
        }
        case 'store': return storageTransaction(async () => {
            const prefix = 'ts_kv:' + encodeURIComponent(a.namespace) + ':';
            const key = prefix + encodeURIComponent(a.key ?? '');
            if (a.action === 'list') {
                const keys = (await chrome.storage.local.getKeys()).filter(k => k.startsWith(prefix));
                const values = keys.length ? await chrome.storage.local.get(keys) : {};
                return {values: Object.fromEntries(Object.entries(values).map(([k, v]) => [decodeURIComponent(k.slice(prefix.length)), v]))};
            }
            requireValue(a.key, 'key');
            if (a.action === 'get') { const data = await chrome.storage.local.get(key); return {found: Object.hasOwn(data, key), value: data[key] ?? null}; }
            if (a.action === 'set') { requireValue(a.value, 'value'); await chrome.storage.local.set({[key]: a.value}); }
            if (a.action === 'delete') await chrome.storage.local.remove(key);
            return {ok: true};
        });
        case 'recipes': return storageTransaction(async () => {
            const key = 'ts_site_recipes';
            const data = await chrome.storage.local.get(key);
            const recipes = (data[key] ?? {}) as Record<string, any>;
            if (a.action === 'list') return {recipes: Object.entries(recipes).map(([id, recipe]) => ({id, ...(recipe as object)}))};
            const id = requireValue(a.id, 'id') as string;
            if (['__proto__', 'constructor', 'prototype'].includes(id)) throw new Error('Invalid recipe ID');
            if (a.action === 'get') return {recipe: Object.hasOwn(recipes, id) ? recipes[id] : null};
            if (a.action === 'delete') delete recipes[id];
            if (a.action === 'save') {
                const recipe: any = requireValue(a.recipe, 'recipe');
                const origin = new URL(recipe.origin);
                if (!/^https?:$/.test(origin.protocol)) throw new Error('Recipe origin must use HTTP(S)');
                recipes[id] = {...recipe, origin: origin.origin, updatedAt: Date.now()};
            }
            await chrome.storage.local.set({[key]: recipes});
            return {ok: true, id};
        });
        case 'accessibility': {
            requireValue(tabId, 'tabId');
            if (a.mode === 'cdp') {
                const tree = await cdp.command(tabId, 'Accessibility.getFullAXTree', {frameId: a.frameId}, a.sessionId);
                return {source: 'chrome-ax', nodes: tree.nodes.slice(0, a.maxNodes), truncated: tree.nodes.length > a.maxNodes};
            }
            const frames = await chrome.scripting.executeScript({target: {tabId, ...(a.frameIds ? {frameIds: a.frameIds} : {})}, func: readAccessibleDOM, args: [a.maxNodes]});
            return {frames};
        }
        case 'clipboard': {
            if (a.action === 'write') requireValue(a.text, 'text');
            const result = await clipboard(a.action, a.text);
            if (!result || result.error) throw new Error(result?.error ?? 'Clipboard document did not respond');
            return result;
        }
        case 'download': {
            if (a.action === 'start') {
                const url = requireValue(a.url, 'url') as string;
                if (!/^(https?:|data:)/.test(url)) throw new Error('Unsupported download URL');
                return {downloadId: await chrome.downloads.download({url, filename: a.filename, saveAs: false})};
            }
            const id = requireValue(a.downloadId, 'downloadId') as number;
            if (a.action === 'cancel') { await chrome.downloads.cancel(id); return {ok: true}; }
            return {downloads: await chrome.downloads.search({id})};
        }
        case 'notify': return {notificationId: await chrome.notifications.create({type: 'basic', iconUrl: 'icon.png', title: a.title, message: a.message})};
        case 'input': {
            requireValue(tabId, 'tabId');
            return visual.observeRaw(a, async () => {
            const send = (method: string, params: any) => cdp.command(tabId, method, params);
            if (a.action === 'text') await send('Input.insertText', {text: requireValue(a.text, 'text')});
            if (a.action === 'key') {
                if (!['keyDown', 'keyUp', 'rawKeyDown', 'char'].includes(a.type)) throw new Error('Invalid key event type');
                await send('Input.dispatchKeyEvent', {type: a.type, key: a.key, code: a.code, windowsVirtualKeyCode: a.keyCode, text: a.text, modifiers: a.modifiers});
            }
            if (a.action === 'mouse') {
                if (!['mousePressed', 'mouseReleased', 'mouseMoved', 'mouseWheel'].includes(a.type)) throw new Error('Invalid mouse event type');
                await send('Input.dispatchMouseEvent', {type: a.type, x: requireValue(a.x, 'x'), y: requireValue(a.y, 'y'), button: a.button, buttons: a.buttons,
                    clickCount: a.clickCount, modifiers: a.modifiers, ...(a.type === 'mouseWheel' ? {deltaX: a.deltaX, deltaY: a.deltaY} : {})});
            }
            if (a.action === 'touch') {
                if (!['touchStart', 'touchMove', 'touchEnd', 'touchCancel'].includes(a.type)) throw new Error('Invalid touch event type');
                const points = requireValue(a.points, 'points') as unknown[];
                if (['touchEnd', 'touchCancel'].includes(a.type) ? points.length !== 0 : points.length === 0) throw new Error('Start/move requires points; end/cancel requires an empty points array');
                await send('Input.dispatchTouchEvent', {type: a.type, touchPoints: points, modifiers: a.modifiers});
            }
            if (a.action === 'drag') {
                const from: any = requireValue(a.from, 'from'), to: any = requireValue(a.to, 'to');
                await send('Input.setInterceptDrags', {enabled: true});
                try {
                    await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...from});
                    await send('Input.dispatchMouseEvent', {type: 'mousePressed', ...from, button: 'left', buttons: 1, clickCount: 1});
                    const cursor = cdp.read(tabId).cursor;
                    for (let i = 1; i <= a.steps; i++) await send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: from.x + (to.x - from.x) * i / a.steps, y: from.y + (to.y - from.y) * i / a.steps, button: 'left', buttons: 1});
                    const drag = cdp.read(tabId, cursor).events.find(e => e.method === 'Input.dragIntercepted');
                    if (drag) {
                        await send('Input.dispatchDragEvent', {type: 'dragEnter', ...to, data: drag.params.data});
                        await send('Input.dispatchDragEvent', {type: 'dragOver', ...to, data: drag.params.data});
                        await send('Input.dispatchDragEvent', {type: 'drop', ...to, data: drag.params.data});
                    }
                } finally {
                    await send('Input.dispatchMouseEvent', {type: 'mouseReleased', ...to, button: 'left', buttons: 0, clickCount: 1});
                    await send('Input.setInterceptDrags', {enabled: false});
                }
            }
            return {ok: true};
            });
        }
        case 'network': {
            requireValue(tabId, 'tabId');
            if (a.action === 'start') { await cdp.attach(tabId); return {capturing: true, cursor: cdp.read(tabId).cursor}; }
            if (a.action === 'stop') { await cdp.detach(tabId); return {capturing: false}; }
            if (a.action === 'read') return cdp.read(tabId, a.after, a.filter, a.clear);
            if (a.action === 'body') {
                const result = await cdp.command(tabId, 'Network.getResponseBody', {requestId: requireValue(a.requestId, 'requestId')}, a.sessionId);
                return {...result, body: result.body.slice(0, 100000), truncated: result.body.length > 100000};
            }
            const original = a.requestId ? cdp.request(tabId, a.requestId, a.sessionId) : undefined;
            const url = requireValue(a.url ?? original?.url, 'url or captured requestId') as string;
            if (!/^https?:/.test(url)) throw new Error('Replay URL must use HTTP(S)');
            let body = a.body ?? original?.postData;
            if (body === undefined && original?.hasPostData) {
                body = (await cdp.command(tabId, 'Network.getRequestPostData', {requestId: a.requestId}, a.sessionId)).postData;
            }
            const method = a.method ?? original?.method ?? 'GET';
            const headers = Object.fromEntries(Object.entries(a.headers ?? original?.headers ?? {}).filter(([name]) => !/^(cookie|host|content-length|origin|referer|connection|accept-encoding|sec-.+)$/i.test(name)));
            const options = {method, headers, ...(method !== 'GET' && method !== 'HEAD' ? {body} : {}), credentials: 'include'};
            const expression = `(async () => { const r = await fetch(${JSON.stringify(url)}, ${JSON.stringify(options)}); const body = await r.text(); return {status: r.status, url: r.url, headers: Object.fromEntries(r.headers), body: body.slice(0, 100000), truncated: body.length > 100000}; })()`;
            const result = await cdp.command(tabId, 'Runtime.evaluate', {expression, contextId: a.contextId, awaitPromise: true, returnByValue: true, timeout: 30000}, a.sessionId);
            if (result.exceptionDetails) return {error: result.exceptionDetails.exception?.description ?? result.exceptionDetails.text, exceptionDetails: result.exceptionDetails};
            return {ok: true, ...result};
        }
        case 'dom': {
            requireValue(tabId, 'tabId');
            if (a.action === 'detach') { await cdp.detach(tabId); return {ok: true}; }
            if (a.action === 'frames') return cdp.frames(tabId);
            if (a.action === 'evaluate') {
                const result = await cdp.command(tabId, 'Runtime.evaluate', {expression: requireValue(a.expression, 'expression'), contextId: a.contextId, awaitPromise: true, returnByValue: true, timeout: 10000}, a.sessionId);
                if (result.exceptionDetails) return {error: result.exceptionDetails.exception?.description ?? result.exceptionDetails.text, exceptionDetails: result.exceptionDetails};
                return {ok: true, ...result};
            }
            if (a.action === 'describe') return cdp.command(tabId, 'DOM.describeNode', {backendNodeId: requireValue(a.backendNodeId, 'backendNodeId'), depth: 2, pierce: true}, a.sessionId);
            // Flattened document includes closed shadow roots; query independently within every document/shadow root.
            const doc = await cdp.command(tabId, 'DOM.getFlattenedDocument', {depth: -1, pierce: true}, a.sessionId);
            if (a.action === 'query') {
                const selector = requireValue(a.selector, 'selector');
                const roots = doc.nodes.filter((n: any) => n.nodeType === 9 || n.nodeType === 11);
                const matches: number[] = [];
                for (const root of roots) {
                    const result = await cdp.command(tabId, 'DOM.querySelectorAll', {nodeId: root.nodeId, selector}, a.sessionId);
                    matches.push(...result.nodeIds);
                }
                return {nodeIds: [...new Set(matches)].slice(0, a.maxNodes), truncated: matches.length > a.maxNodes};
            }
            return {nodes: doc.nodes.slice(0, a.maxNodes), truncated: doc.nodes.length > a.maxNodes};
        }
    }
}

export async function handleBrowserMessage(message: any) {
    if (message.type !== 'BROWSER_CALL') throw new Error('Unknown browser message');
    if (!Object.hasOwn(browserSchemas, message.operation)) throw new Error('Unknown browser operation');
    return run(message.operation, message.input);
}

