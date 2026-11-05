import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createLoader, plain} from './load-ts.mjs';

const chrome = {runtime: {getManifest: () => ({version: '3.2'}), sendMessage: async () => ({ok: true})}};
const runtime = createLoader({globals: {chrome}})('src/background/userscripts/userscriptRuntime.ts');

const userscript = (overrides = {}) => ({
    namespace: 'ns', version: '1.0', author: 'me', homepage: '',
    matches: ['https://example.com/*'], includes: [], excludeMatches: [], excludes: [],
    allFrames: true, world: 'USER_SCRIPT', grants: ['GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest'], connects: [],
    requires: [], resources: [], updateURL: '', downloadURL: '', sourceUrl: '', installedAt: 0, ...overrides,
});
const script = (code, overrides = {}) => ({
    id: 'abc', conversationId: '', name: 'Test script', description: 'd', code,
    urlMatchPattern: 'https://example.com/*', status: 'active', runAt: 'document_idle', userscript: userscript(overrides),
});

/** Runs registered code in a fake page; resolves with the messages it sent once the script has run. */
async function run(code, {href = 'https://example.com/page', values = {}, reply = () => ({ok: true})} = {}) {
    const sent = [];
    const out = {};
    const context = vm.createContext({
        console, structuredClone, atob, btoa, TextDecoder, URL, URLSearchParams, setTimeout, Promise, Object, Array,
        location: {href},
        out,
        chrome: {runtime: {sendMessage: async msg => {
            sent.push(structuredClone(msg));
            if (msg.type === 'SCRIPT_LIST_VALUES') return {values};
            return reply(msg);
        }, connect: () => ({onMessage: {addListener() {}}, onDisconnect: {addListener() {}}, postMessage() {}})}},
    });
    context.window = context;
    vm.runInContext(code, context);
    for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0));
    return {sent, out};
}

test('registers in its own world with the right timing and frames', () => {
    const [reg] = runtime.userscriptRegistrations(script('1'), 'tok');
    assert.equal(reg.id, 'tampersloth_abc');
    assert.equal(reg.worldId, 'tsw_abc');
    assert.equal(reg.world, 'USER_SCRIPT');
    assert.equal(reg.allFrames, true);
    assert.deepEqual(plain(reg.matches), ['https://example.com/*']);
    const pageWorld = runtime.userscriptRegistrations(script('1', {world: 'MAIN', grants: ['none']}), 'tok');
    assert.equal(pageWorld.length, 1);
    assert.equal(pageWorld[0].worldId, undefined);
    assert.equal(runtime.userscriptRegistrations(script('1', {matches: []}), 'tok').length, 0);
});

test('values load before the script runs and writes carry the token', async () => {
    const code = runtime.buildUserscriptCode(script(`
        out.before = GM_getValue('count', 0);
        out.missing = GM_getValue('nope', 'fallback');
        GM_setValue('count', out.before + 1);
        out.after = GM_getValue('count');
        out.keys = GM_listValues();
        out.info = GM_info.script.name + ' ' + GM_info.script.version;
    `), 'tok');
    const {sent, out} = await run(code, {values: {count: 4}});
    assert.equal(out.before, 4);
    assert.equal(out.missing, 'fallback');
    assert.equal(out.after, 5);
    assert.deepEqual(plain(out.keys), ['count']);
    assert.equal(out.info, 'Test script 1.0');
    const write = sent.find(m => m.type === 'SCRIPT_SET_VALUE');
    const {instance, ...rest} = write;
    assert.equal(typeof instance, 'string', 'So the background can skip the sender when telling other tabs');
    assert.deepEqual(plain(rest), {type: 'SCRIPT_SET_VALUE', key: 'count', value: 5, scriptId: 'abc', token: 'tok'});
    assert.ok(sent.some(m => m.type === 'SCRIPT_EXECUTION_REPORT' && m.success === true));
});

test('@require code runs first, in the same scope', async () => {
    const code = runtime.buildUserscriptCode(script('out.lib = libValue();', {
        requires: [{url: 'https://cdn/lib.js', code: 'function libValue() { return 42; } // trailing comment'}],
    }), 'tok');
    assert.equal((await run(code)).out.lib, 42);
});

test('GM_xmlhttpRequest goes through the background and builds the response', async () => {
    const code = runtime.buildUserscriptCode(script(`
        GM_xmlhttpRequest({url: '/api', responseType: 'json', onload: function (r) { out.status = r.status; out.data = r.response; out.url = r.finalUrl; }});
        GM_xmlhttpRequest({url: 'https://blocked.test/', onerror: function (r) { out.error = r.error; }});
    `), 'tok');
    const {sent, out} = await run(code, {reply: msg => msg.url.includes('blocked')
        ? {error: 'not in @connect'}
        : {status: 200, statusText: 'OK', headers: 'content-type: application/json', text: '{"a":1}', finalUrl: msg.url, contentType: 'application/json'}});
    const request = sent.find(m => m.type === 'GM_XHR');
    assert.equal(request.url, 'https://example.com/api');
    assert.equal(request.method, 'GET');
    assert.equal(out.status, 200);
    assert.deepEqual(plain(out.data), {a: 1});
    assert.equal(out.error, 'not in @connect');
});

test('errors are reported instead of escaping', async () => {
    const code = runtime.buildUserscriptCode(script('throw new Error("boom")', {grants: []}), 'tok');
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args);
    try {
        const {sent} = await run(code);
        assert.ok(sent.some(m => m.type === 'SCRIPT_EXECUTION_REPORT' && m.success === false && m.error === 'boom'));
    } finally {
        console.error = original;
    }
    assert.equal(errors.length, 1);
});

test('@include scripts check the URL before running', async () => {
    const code = runtime.buildUserscriptCode(script('out.ran = true;', {
        grants: [], matches: [], includes: ['https://*.news.test/*'], excludes: ['*/private/*'],
    }), 'tok');
    assert.equal((await run(code, {href: 'https://www.news.test/a'})).out.ran, true);
    assert.equal((await run(code, {href: 'https://www.news.test/private/a'})).out.ran, undefined);
    assert.equal((await run(code, {href: 'https://elsewhere.test/'})).out.ran, undefined);
});

test('page-world scripts get GM_info and unsafeWindow but no messaging', async () => {
    const code = runtime.buildUserscriptCode(script('out.same = unsafeWindow === window; out.name = GM_info.script.name; out.gm = typeof GM_setValue;', {
        world: 'MAIN', grants: ['none'],
    }), 'tok');
    const {sent, out} = await run(code);
    assert.equal(out.same, true);
    assert.equal(out.name, 'Test script');
    assert.equal(out.gm, 'undefined');
    assert.equal(sent.length, 0);
    assert.ok(!code.includes('tok'));
});
