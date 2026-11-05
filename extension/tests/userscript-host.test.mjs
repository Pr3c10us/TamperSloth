import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';
import {createLoader, plain} from './load-ts.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
const bus = () => {
    const set = new Set();
    return {addListener: fn => set.add(fn), removeListener: fn => set.delete(fn), fire: (...args) => [...set].map(fn => fn(...args)), set};
};

const userscript = (overrides = {}) => ({
    namespace: 'ns', version: '1.0', author: '', homepage: '',
    matches: ['https://example.com/*'], includes: [], excludeMatches: [], excludes: [],
    allFrames: true, world: 'USER_SCRIPT', grants: [], connects: [],
    requires: [], resources: [], updateURL: '', downloadURL: '', sourceUrl: '', installedAt: 0, ...overrides,
});
const script = (code, overrides = {}) => ({
    id: 'abc', conversationId: '', name: 'Test script', description: '', code,
    urlMatchPattern: 'https://example.com/*', status: 'active', runAt: 'document_idle', userscript: userscript(overrides),
});

const runtimeChrome = {runtime: {getManifest: () => ({version: '3.2'}), sendMessage: async () => ({ok: true})}};
const runtime = createLoader({globals: {chrome: runtimeChrome, crypto}})('src/background/userscripts/userscriptRuntime.ts');

function fakePort() {
    const posted = [];
    const onMessage = bus(), onDisconnect = bus();
    return {posted, onMessage, onDisconnect, postMessage: m => posted.push(structuredClone(m)), disconnect() {}};
}

/** One tab's page: a shared document, with each world getting its own globals as in Chrome. */
function page(href = 'https://example.com/page') {
    const document = new EventTarget();
    const world = extras => {
        const context = vm.createContext({
            console, structuredClone, atob, btoa, TextDecoder, URL, URLSearchParams, setTimeout, clearTimeout,
            Promise, Object, Array, JSON, Math, CustomEvent, location: {href}, document, out: {}, ...extras,
        });
        context.window = context;
        return context;
    };
    return {document, world};
}

test('a page-world script with GM grants registers a relay that starts first', () => {
    const regs = runtime.userscriptRegistrations(script('1', {world: 'MAIN', grants: ['GM_setValue', 'unsafeWindow']}), 'secret-token');
    assert.deepEqual(plain(regs.map(r => [r.id, r.world, r.runAt, r.worldId])), [
        ['tampersloth_abc_relay', 'USER_SCRIPT', 'document_start', 'tsw_abc'],
        ['tampersloth_abc', 'MAIN', 'document_idle', null],
    ].map(row => row.map(v => v ?? undefined)).map(row => JSON.parse(JSON.stringify(row))));
    assert.ok(regs[0].js[0].code.includes('secret-token'));
    assert.ok(!regs[1].js[0].code.includes('secret-token'), 'The page world must never see the token');
});

test('right-click scripts register nothing', () => {
    assert.equal(runtime.userscriptRegistrations(script('1', {contextMenu: true}), 'tok').length, 0);
});

test('through the relay: page access, synchronous values and a real round trip', async () => {
    const {relay, main} = runtime.buildUserscriptInjection(script(`
        out.same = unsafeWindow === window;
        out.before = GM_getValue('count', 0);
        GM_setValue('count', out.before + 1);
        out.after = GM_getValue('count');
    `, {world: 'MAIN', grants: ['GM_getValue', 'GM_setValue', 'unsafeWindow']}), 'tok');

    const sent = [];
    const ports = [];
    const chrome = {runtime: {
        sendMessage: async m => { sent.push(structuredClone(m)); return m.type === 'SCRIPT_LIST_VALUES' ? {values: {count: 4}} : {ok: true}; },
        connect: () => { const p = fakePort(); ports.push(p); return p; },
    }};
    const {world} = page();
    const pageWorld = world({});
    vm.runInContext(relay, world({chrome}));
    vm.runInContext(main, pageWorld);
    await settle();

    assert.equal(pageWorld.out.same, true);
    assert.equal(pageWorld.out.before, 4);
    assert.equal(pageWorld.out.after, 5);
    const write = sent.find(m => m.type === 'SCRIPT_SET_VALUE');
    assert.equal(write.token, 'tok', 'The relay adds the token');
    assert.equal(write.scriptId, 'abc');
    assert.equal(write.value, 5);
    assert.equal(ports.length, 1);
    assert.equal(ports[0].posted[0].type, 'hello');
    assert.equal(ports[0].posted[0].token, 'tok');
});

test('the relay forwards only script requests', async () => {
    const {relay} = runtime.buildUserscriptInjection(script('1', {world: 'MAIN', grants: ['GM_setValue', 'unsafeWindow']}), 'tok');
    const channel = relay.match(/__tsChannel = "([^"]+)"/)[1];
    const sent = [];
    const {world, document} = page();
    vm.runInContext(relay, world({chrome: {runtime: {sendMessage: async m => { sent.push(m); return {}; }}}}));
    document.dispatchEvent(new CustomEvent(`ts-req-${channel}`, {detail: JSON.stringify({id: 1, msg: {type: 'BROWSER_CALL'}})}));
    document.dispatchEvent(new CustomEvent(`ts-req-${channel}`, {detail: JSON.stringify({id: 2, msg: {type: 'SCRIPT_LIST_VALUES', scriptId: 'someone-else', token: 'x'}})}));
    await settle();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].scriptId, 'abc', 'The relay names its own script, whatever the page says');
    assert.equal(sent[0].token, 'tok');
});

test('pushes keep values current, run menu commands and report closed tabs', async () => {
    const code = runtime.buildUserscriptCode(script(`
        out.heard = [];
        GM_addValueChangeListener('theme', function (key, oldValue, newValue, remote) { out.heard.push([key, oldValue, newValue, remote]); });
        out.commandId = GM_registerMenuCommand('Do it', function () { out.ran = (out.ran || 0) + 1; });
        out.read = function () { return GM_getValue('theme'); };
        out.tab = GM_openInTab('https://example.com/other');
        out.tab.onclose = function () { out.closed = true; };
    `, {grants: ['GM_getValue', 'GM_addValueChangeListener', 'GM_registerMenuCommand', 'GM_openInTab']}), 'tok');
    const ports = [];
    const chrome = {runtime: {
        sendMessage: async m => m.type === 'SCRIPT_LIST_VALUES' ? {values: {theme: 'light'}} : m.type === 'GM_OPEN_TAB' ? {tabId: 42} : {ok: true},
        connect: () => { const p = fakePort(); ports.push(p); return p; },
    }};
    const context = page().world({chrome});
    vm.runInContext(code, context);
    await settle();

    const port = ports[0];
    assert.equal(ports.length, 1, 'One channel per running script');
    assert.deepEqual(plain(port.posted.at(-1)), {type: 'menu', commands: [{id: context.out.commandId, caption: 'Do it'}]});

    port.onMessage.fire({type: 'value', key: 'theme', value: 'dark'});
    assert.equal(context.out.read(), 'dark');
    assert.deepEqual(plain(context.out.heard), [['theme', 'light', 'dark', true]]);

    port.onMessage.fire({type: 'menu', id: context.out.commandId});
    assert.equal(context.out.ran, 1);

    port.onMessage.fire({type: 'tab-closed', tabId: 42});
    assert.equal(context.out.closed, true);
    assert.equal(context.out.tab.closed, true);
});

test('a refused channel stops instead of reconnecting forever', async () => {
    const code = runtime.buildUserscriptCode(script(`GM_registerMenuCommand('x', function () {});`, {grants: ['GM_registerMenuCommand']}), 'tok');
    let connects = 0;
    const ports = [];
    const timers = [];
    const chrome = {runtime: {sendMessage: async () => ({ok: true}), connect: () => { connects++; const p = fakePort(); ports.push(p); return p; }}};
    vm.runInContext(code, page().world({chrome, setTimeout: (fn, ms) => { timers.push(fn); return 0; }}));
    await settle();
    ports[0].onMessage.fire({type: 'bye'});
    ports[0].onDisconnect.fire();
    timers.forEach(fn => fn());
    assert.equal(connects, 1);
});

// ── @connect prompt ──

function promptFixture(stored = {}) {
    const session = {};
    const saved = [];
    const windows = {onRemoved: bus(), create: async options => { windows.created = options; return {id: 5}; }, remove: async () => { windows.removed = true; }};
    const onMessage = bus();
    const chrome = {
        runtime: {id: 'ext', getURL: path => `chrome-extension://ext/${path}`, onMessage},
        storage: {session: {
            get: async key => ({[key]: session[key]}),
            set: async values => { Object.assign(session, values); },
            remove: async key => { delete session[key]; },
        }},
        windows,
    };
    const mocks = {'src/storage/scripts.ts': {
        loadScripts: async () => [structuredClone(stored)],
        saveScript: async s => { saved.push(s); },
    }};
    const mod = createLoader({globals: {chrome, crypto}, mocks})('src/background/userscripts/connectPrompt.ts');
    mod.installConnectPrompt();
    const answer = async (allow, remember) => {
        await settle();
        const askId = windows.created.url.split('/connect/')[1];
        const [listener] = onMessage.set;
        listener({type: 'CONNECT_DECISION', askId, allow, remember}, {id: 'ext', url: 'chrome-extension://ext/index.html'});
    };
    return {mod, windows, saved, session, answer, onMessage};
}

test('asks once for simultaneous requests and remembers "always" on the script', async () => {
    const target = script('1');
    const f = promptFixture(target);
    const first = f.mod.askToConnect(target, 'api.test', 'https://example.com/');
    const second = f.mod.askToConnect(target, 'api.test', 'https://example.com/');
    await f.answer(true, 'always');
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(f.windows.removed, true);
    assert.deepEqual(plain(f.saved[0].userscript.connectAllowed), ['api.test']);
});

test('"for now" lasts the session without touching the script', async () => {
    const target = script('1');
    const f = promptFixture(target);
    const asked = f.mod.askToConnect(target, 'api.test', 'https://example.com/');
    await f.answer(false, 'session');
    assert.equal(await asked, false);
    assert.equal(f.saved.length, 0);
    f.windows.created = null;
    assert.equal(await f.mod.askToConnect(target, 'api.test', 'https://example.com/'), false);
    assert.equal(f.windows.created, null, 'Not asked a second time');
});

test('closing the window refuses without remembering, and blocked hosts never ask', async () => {
    const target = script('1');
    const f = promptFixture(target);
    const asked = f.mod.askToConnect(target, 'api.test', 'https://example.com/');
    await settle();
    f.windows.onRemoved.fire(5);
    assert.equal(await asked, false);
    assert.equal(f.saved.length, 0);
    f.windows.created = null;
    const blocked = script('1', {connectBlocked: ['evil.test']});
    assert.equal(await f.mod.askToConnect(blocked, 'evil.test', 'https://example.com/'), false);
    assert.equal(f.windows.created, null);
});

test('decisions from outside the extension are ignored', async () => {
    const target = script('1');
    const f = promptFixture(target);
    let settled = false;
    const asked = f.mod.askToConnect(target, 'api.test', 'https://example.com/').then(v => { settled = true; return v; });
    await settle();
    const askId = f.windows.created.url.split('/connect/')[1];
    const [listener] = f.onMessage.set;
    listener({type: 'CONNECT_DECISION', askId, allow: true, remember: 'always'}, {id: 'ext', url: 'https://example.com/'});
    await settle();
    assert.equal(settled, false);
    f.windows.onRemoved.fire(5);
    assert.equal(await asked, false);
});

// ── Auto-updates ──

const META = version => `// ==UserScript==\n// @name Test script\n// @namespace ns\n// @version ${version}\n// @match https://example.com/*\n// ==/UserScript==\n`;

function updateFixture(installed, responses) {
    const scripts = [installed];
    const saved = [];
    const notifications = [];
    const onMessage = bus();
    const alarms = {get: async () => undefined, create: async () => {}, onAlarm: bus()};
    const chrome = {
        runtime: {id: 'ext', getURL: path => `chrome-extension://ext/${path}`, onMessage},
        alarms,
        notifications: {onClicked: bus(), clear: async () => {}, create: async (id, options) => { notifications.push({id, ...options}); }},
        storage: {local: {get: async () => ({})}},
    };
    const fetch = async url => {
        if (!(url in responses)) throw new Error(`unexpected fetch ${url}`);
        const body = new TextEncoder().encode(responses[url]);
        return {ok: true, status: 200, statusText: 'OK', headers: {get: () => ''}, arrayBuffer: async () => body.buffer};
    };
    const mocks = {'src/storage/scripts.ts': {
        loadScripts: async () => scripts,
        saveScript: async s => { saved.push(s); },
    }};
    const mod = createLoader({globals: {chrome, crypto, fetch, TextDecoder, TextEncoder, btoa}, mocks})('src/background/userscripts/userscriptUpdates.ts');
    mod.installUserscriptUpdates();
    const [listener] = onMessage.set;
    const check = () => new Promise(resolve => {
        listener({type: 'CHECK_USERSCRIPT_UPDATE', scriptId: installed.id}, {id: 'ext', url: 'chrome-extension://ext/index.html'}, resolve);
    });
    return {mod, saved, notifications, check, alarms};
}

const URLS = {updateURL: 'https://cdn.test/s.meta.js', downloadURL: 'https://cdn.test/s.user.js'};

test('a newer version asking for nothing new installs itself, keeping what the user decided', async () => {
    const installed = script(META('1.0'), {...URLS, connectAllowed: ['api.test'], world: 'MAIN'});
    const f = updateFixture(installed, {[URLS.updateURL]: META('1.1'), [URLS.downloadURL]: `${META('1.1')}// new code`});
    const result = await f.check();
    assert.equal(result.status, 'updated');
    assert.equal(result.version, '1.1');
    assert.equal(f.saved[0].id, 'abc');
    assert.equal(f.saved[0].userscript.version, '1.1');
    assert.ok(f.saved[0].code.includes('new code'));
    assert.deepEqual(plain(f.saved[0].userscript.connectAllowed), ['api.test']);
    assert.equal(f.notifications.length, 0);
});

test('a newer version asking for more waits for review', async () => {
    const installed = script(META('1.0'), URLS);
    const grown = `// ==UserScript==\n// @name Test script\n// @namespace ns\n// @version 2.0\n// @match https://example.com/*\n// @match https://bank.test/*\n// @grant GM_xmlhttpRequest\n// ==/UserScript==\n`;
    const f = updateFixture(installed, {[URLS.updateURL]: META('2.0'), [URLS.downloadURL]: grown});
    const result = await f.check();
    assert.equal(result.status, 'review');
    assert.equal(f.saved[0].code, installed.code, 'The installed code stays as it was');
    assert.deepEqual(plain(f.saved[0].userscript.pendingUpdate), {version: '2.0', url: URLS.downloadURL});
    assert.equal(f.notifications.length, 1);
});

test('the same or an older version changes nothing, and no source means no check', async () => {
    const f = updateFixture(script(META('1.0'), URLS), {[URLS.updateURL]: META('1.0')});
    assert.equal((await f.check()).status, 'current');
    assert.equal(f.saved.length, 0);
    const none = updateFixture(script(META('1.0')), {});
    assert.equal((await none.check()).status, 'unavailable');
});

test('a dead update link is reported, not thrown', async () => {
    const f = updateFixture(script(META('1.0'), URLS), {});
    assert.equal((await f.check()).status, 'error');
});

test('picks where to read versions and download from', () => {
    const {mod} = updateFixture(script(META('1.0')), {});
    assert.deepEqual(plain(mod.updateSources({updateURL: 'https://a/x.meta.js', downloadURL: 'https://a/x.user.js', sourceUrl: ''})),
        {meta: 'https://a/x.meta.js', download: 'https://a/x.user.js'});
    assert.deepEqual(plain(mod.updateSources({updateURL: 'https://a/x.user.js', downloadURL: '', sourceUrl: ''})),
        {meta: 'https://a/x.user.js', download: 'https://a/x.user.js'});
    assert.deepEqual(plain(mod.updateSources({updateURL: '', downloadURL: '', sourceUrl: 'https://b/y.user.js'})),
        {meta: 'https://b/y.user.js', download: 'https://b/y.user.js'});
});

// ── Backup zips ──

/** Builds a real .zip; deflated entries use the same raw deflate browsers read. */
function makeZip(files) {
    const locals = [], directory = [];
    let offset = 0;
    for (const [name, text, method] of files) {
        const raw = Buffer.from(text);
        const data = method === 8 ? zlib.deflateRawSync(raw) : raw;
        const nameBytes = Buffer.from(name);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(method, 8);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(nameBytes.length, 26);
        locals.push(local, nameBytes, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(method, 10);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(raw.length, 24);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        directory.push(central, nameBytes);
        offset += 30 + nameBytes.length + data.length;
    }
    const directoryBytes = Buffer.concat(directory);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directoryBytes.length, 12);
    end.writeUInt32LE(offset, 16);
    return new Uint8Array(Buffer.concat([...locals, directoryBytes, end]));
}

const zipModule = createLoader({globals: {TextDecoder, Blob, Response, DecompressionStream}})('src/userscripts/backupZip.ts');

test('reads a Tampermonkey backup: scripts, their saved data and on/off state', async () => {
    const entries = await zipModule.readZip(makeZip([
        ['Wide GitHub.user.js', META('1.0'), 8],
        ['Wide GitHub.options.json', JSON.stringify({settings: {enabled: false}}), 8],
        ['Wide GitHub.storage.json', JSON.stringify({ts: 1, data: {theme: 'dark', count: 3}}), 0],
        ['Plain.user.js', META('2.0'), 0],
        ['notes/', '', 0],
    ]));
    const scripts = zipModule.readBackup(entries);
    assert.equal(scripts.length, 2);
    assert.equal(scripts[0].fileName, 'Wide GitHub.user.js');
    assert.equal(scripts[0].source, META('1.0'));
    assert.deepEqual(plain(scripts[0].values), {theme: 'dark', count: 3});
    assert.equal(scripts[0].enabled, false);
    assert.deepEqual(plain(scripts[1].values), {});
    assert.equal(scripts[1].enabled, true);
});

test('damaged .json beside a script loses only the extras; non-zips are refused', async () => {
    const entries = await zipModule.readZip(makeZip([
        ['A.user.js', META('1.0'), 0],
        ['A.storage.json', '{not json', 0],
    ]));
    const [only] = zipModule.readBackup(entries);
    assert.deepEqual(plain(only.values), {});
    await assert.rejects(zipModule.readZip(new TextEncoder().encode('definitely not a zip file, just some text here')), /isn't a readable/);
});

// ── What GM requests may do ──

function bridgeFixture(us, {fetchResult, askAnswer = false} = {}) {
    const asked = [];
    const cookies = [];
    const chrome = {
        tabs: {onRemoved: bus(), create: async o => ({id: 42, ...o})},
        storage: {session: {get: async () => ({}), set: async () => {}}},
        cookies: {getAll: async d => { cookies.push(d); return [{name: 'x'}]; }},
    };
    const fetch = async url => {
        fetched.push(url);
        return {status: 200, statusText: 'OK', headers: new Headers(), redirected: false, url, text: async () => 'body', ...fetchResult};
    };
    const fetched = [];
    const mocks = {
        'src/background/browser/browserService.ts': {clipboard: async () => ({ok: true})},
        'src/background/userscripts/connectPrompt.ts': {askToConnect: async (_, host) => { asked.push(host); return askAnswer; }},
        'src/background/userscripts/userscriptHost.ts': {pushToScript: () => {}},
    };
    const {handleGmRequest} = createLoader({globals: {chrome, fetch, Headers, FormData, AbortController, btoa, atob}, mocks})('src/background/userscripts/userscriptBridge.ts');
    const target = script('1', us);
    const sender = {url: 'https://example.com/page', tab: {id: 3, index: 0, windowId: 1}};
    const request = message => handleGmRequest(message, sender, target);
    return {request, asked, fetched, cookies};
}

const xhr = url => ({type: 'GM_XHR', requestId: 'abc:1', method: 'GET', url, headers: {}, bodyType: 'none'});

test('requests need the grant, and only unlisted hosts ask', async () => {
    assert.equal((await bridgeFixture({grants: []}).request(xhr('https://api.test/'))).denied, true);

    const listed = bridgeFixture({grants: ['GM_xmlhttpRequest'], connects: ['api.test']});
    assert.equal((await listed.request(xhr('https://api.test/x'))).text, 'body');
    assert.equal((await listed.request(xhr('https://example.com/own-site'))).text, 'body');
    assert.deepEqual([...listed.asked], []);

    const unlisted = bridgeFixture({grants: ['GM_xmlhttpRequest']});
    assert.match((await unlisted.request(xhr('https://other.test/'))).error, /blocked a request to other\.test/);
    assert.deepEqual([...unlisted.asked], ['other.test']);
    assert.deepEqual([...unlisted.fetched], [], 'Nothing is sent before the answer');

    const yes = bridgeFixture({grants: ['GM_xmlhttpRequest']}, {askAnswer: true});
    assert.equal((await yes.request(xhr('https://other.test/'))).text, 'body');

    const blocked = bridgeFixture({grants: ['GM_xmlhttpRequest'], connects: ['*'], connectBlocked: ['evil.test']});
    assert.match((await blocked.request(xhr('https://evil.test/'))).error, /blocked/);
    assert.equal((await bridgeFixture({grants: ['GM_xmlhttpRequest']}).request(xhr('file:///etc/passwd'))).error, 'Only http and https requests are allowed.');
});

test('a redirect to an unapproved host keeps its answer from the script', async () => {
    const f = bridgeFixture({grants: ['GM_xmlhttpRequest'], connects: ['api.test']}, {
        fetchResult: {redirected: true, url: 'https://elsewhere.test/landed', body: {cancel() {}}},
    });
    const answer = await f.request(xhr('https://api.test/x'));
    assert.match(answer.error, /blocked a redirect to elsewhere\.test/);
    assert.equal(answer.text, undefined);
    assert.deepEqual([...f.asked], ['elsewhere.test']);

    const fine = bridgeFixture({grants: ['GM_xmlhttpRequest'], connects: ['api.test', 'elsewhere.test']}, {
        fetchResult: {redirected: true, url: 'https://elsewhere.test/landed'},
    });
    assert.equal((await fine.request(xhr('https://api.test/x'))).text, 'body');
});

test('cookies stay with the page and sites named one by one', async () => {
    const list = details => ({type: 'GM_COOKIE', action: 'list', details});
    assert.equal((await bridgeFixture({grants: []}).request(list({}))).denied, true);

    const wildcard = bridgeFixture({grants: ['GM_cookie'], connects: ['*']});
    assert.deepEqual(plain((await wildcard.request(list({}))).result), [{name: 'x'}], "The page's own cookies");
    assert.match((await wildcard.request(list({url: 'https://bank.test/'}))).error, /can't use cookies/, 'A wildcard @connect opens no other site');
    assert.match((await wildcard.request(list({domain: '.bank.test'}))).error, /can't use cookies/);
    assert.equal(wildcard.cookies.length, 1);

    const named = bridgeFixture({grants: ['GM_cookie'], connects: ['api.test']});
    assert.deepEqual(plain((await named.request(list({url: 'https://api.test/'}))).result), [{name: 'x'}]);
});

test('scripts open only web pages and close only tabs they opened', async () => {
    const f = bridgeFixture({grants: ['GM_openInTab']});
    assert.match((await f.request({type: 'GM_CLOSE_TAB', tabId: 7})).error, /wasn't opened by this script/);
    assert.match((await f.request({type: 'GM_OPEN_TAB', url: 'chrome://settings'})).error, /Only http and https/);
    assert.equal((await f.request({type: 'GM_OPEN_TAB', url: 'https://example.org/'})).tabId, 42);
});
