import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const listeners = () => {
    const set = new Set();
    return {addListener: fn => set.add(fn), set};
};

const PAGE = 'https://greasyfork.org/en/scripts/574417-video-downloader';
const SCRIPT = 'https://update.greasyfork.org/scripts/574417/Video%20Downloader.user.js';
const EXTENSION = 'chrome-extension://ext/';

function fixture(prefs = {}) {
    const session = {};
    const tabs = new Map([[3, {id: 3, index: 0, windowId: 1, url: PAGE}]]);
    const injected = [];
    const chrome = {
        runtime: {id: 'ext', getURL: path => EXTENSION + path, onMessage: listeners()},
        storage: {
            local: {get: async () => ({ts_userscript_prefs: prefs})},
            session: {
                get: async key => ({[key]: session[key]}),
                set: async values => { Object.assign(session, values); },
                remove: async key => { delete session[key]; },
            },
        },
        tabs: {
            onUpdated: listeners(), onRemoved: listeners(),
            create: async options => { const tab = {id: 9, ...options}; tabs.set(9, tab); return tab; },
            get: async id => { if (!tabs.has(id)) throw new Error('gone'); return tabs.get(id); },
            update: async (id, props) => Object.assign(tabs.get(id), props),
            remove: async id => { tabs.delete(id); },
        },
        windows: {update: async () => {}},
        scripting: {executeScript: async details => { injected.push(details); return [{result: true}]; }},
    };
    const document = new EventTarget();
    const navigation = new EventTarget();
    const storage = new Map();
    const localStorage = {
        getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: key => storage.delete(key),
    };
    const mod = createLoader({globals: {chrome, document, CustomEvent, MouseEvent: Event, localStorage, Date, window: {navigation}}})('src/background/greasyForkButton.ts');
    mod.installGreasyForkButton();
    const [listener] = chrome.runtime.onMessage.set;
    const send = (message, sender) => new Promise(resolve => {
        if (!listener(message, sender, resolve)) resolve(undefined);
    });
    return {mod, chrome, session, tabs, injected, send, document, navigation};
}

const buttonSender = {id: 'ext', frameId: 0, url: `${PAGE}/code`, tab: {id: 3, index: 0, windowId: 1}};

test('only .user.js files on Greasy Fork hosts count as installable', () => {
    const {mod} = fixture();
    assert.ok(mod.isGreasyForkScriptUrl(SCRIPT));
    assert.ok(mod.isGreasyForkScriptUrl('https://update.sleazyfork.org/scripts/1/x.user.js'));
    assert.ok(!mod.isGreasyForkScriptUrl('http://update.greasyfork.org/scripts/1/x.user.js'));
    assert.ok(!mod.isGreasyForkScriptUrl('https://evil.example/x.user.js'));
    assert.ok(!mod.isGreasyForkScriptUrl('https://update.greasyfork.org/scripts/1/x.js'));
    assert.ok(!mod.isGreasyForkScriptUrl(undefined));
});

test('the button is injected on script pages but not their post-install page', async () => {
    const {chrome, injected} = fixture();
    const [onUpdated] = chrome.tabs.onUpdated.set;
    onUpdated(3, {status: 'complete'}, {url: PAGE});
    onUpdated(3, {status: 'complete'}, {url: `${PAGE}/post-install`});
    onUpdated(3, {status: 'complete'}, {url: 'https://greasyfork.org/en/scripts'});
    onUpdated(3, {status: 'loading'}, {url: PAGE});
    await tick();
    await tick();
    // The button in the isolated world, then the navigation guard in the page's.
    assert.equal(injected.length, 2);
    assert.equal(injected[0].target.tabId, 3);
    assert.equal(injected[0].world, undefined);
    assert.equal(injected[1].world, 'MAIN');
    assert.equal(injected[0].args[0].channel, injected[1].args[0].channel);
});

/** Runs the injected page-world guard against a fake navigation API. */
async function guard(prefs) {
    const f = fixture(prefs);
    const [onUpdated] = f.chrome.tabs.onUpdated.set;
    onUpdated(3, {status: 'complete'}, {url: PAGE});
    await tick();
    await tick();
    const [details] = f.injected.slice(1);
    details.func(...details.args);
    const channel = details.args[0].channel;
    const installs = [];
    f.document.addEventListener(`ts-gf-install-${channel}`, event => installs.push(event.detail));
    const navigate = url => {
        const event = new Event('navigate', {cancelable: true});
        event.destination = {url};
        f.navigation.dispatchEvent(event);
        return event.defaultPrevented;
    };
    return {...f, channel, installs, navigate};
}

test('after our button is pressed, only the move to the .user.js is taken over', async () => {
    const g = await guard({captureLinks: false});
    assert.equal(g.navigate(SCRIPT), false, 'Not armed yet: the site keeps its own button');
    g.document.dispatchEvent(new CustomEvent(`ts-gf-arm-${g.channel}`));
    assert.equal(g.navigate(`${PAGE}/post-install`), false, "The site's post-install page goes ahead");
    assert.equal(g.navigate(SCRIPT), true);
    assert.deepEqual([...g.installs], [SCRIPT]);
    assert.equal(g.navigate(SCRIPT), false, 'Once per press');
});

test("pressing the site's own button after backing out of a warning stays the site's", async () => {
    const g = await guard({captureLinks: false});
    g.document.dispatchEvent(new CustomEvent(`ts-gf-arm-${g.channel}`));
    const click = new Event('click');
    Object.defineProperty(click, 'isTrusted', {value: true});
    Object.defineProperty(click, 'target', {value: {closest: selector => (selector === '.install-link' ? {} : null)}});
    g.document.dispatchEvent(click);
    assert.equal(g.navigate(SCRIPT), false);
});

test("with .user.js links set to open here, the site's own button comes here too", async () => {
    const g = await guard({captureLinks: true});
    assert.equal(g.navigate(SCRIPT), true);
    assert.deepEqual([...g.installs], [SCRIPT]);
    assert.equal(g.navigate('https://greasyfork.org/en/scripts'), false);
});

/** Runs the injected button against a fake page, with Greasy Fork's button as a link its script may not have reached yet. */
async function buttonOnPage() {
    const f = fixture();
    const [onUpdated] = f.chrome.tabs.onUpdated.set;
    onUpdated(3, {status: 'complete'}, {url: PAGE});
    await tick();
    await tick();
    const ourButton = new EventTarget();
    const link = new EventTarget();
    const attributes = new Map([['data-ping-url', '/scripts/1/install-ping?authenticity_token=t']]);
    const pressed = [];
    Object.assign(link, {
        href: SCRIPT,
        nextElementSibling: null,
        hasAttribute: name => attributes.has(name),
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, value),
        closest: () => ({}),
        after() {},
        click: () => pressed.push(attributes.get('data-ping-url')),
    });
    Object.assign(f.document, {
        getElementById: () => null,
        querySelector: () => link,
        createElement: () => ({attachShadow: () => ({innerHTML: '', querySelector: () => ourButton})}),
    });
    const [details] = f.injected;
    details.func(...details.args);
    // What the site's script does once it has attached.
    const siteAttaches = () => link.addEventListener('mouseover', () => {
        const url = link.getAttribute('data-ping-url');
        if (!/mo=/.test(url)) link.setAttribute('data-ping-url', `${url}&mo=x`);
    });
    const click = () => ourButton.dispatchEvent(new Event('click', {cancelable: true}));
    return {pressed, link, click, siteAttaches};
}

test("our button waits for the site's script, so the install gets counted", async () => {
    const {pressed, click, siteAttaches} = await buttonOnPage();
    click();
    click();
    await tick();
    assert.equal(pressed.length, 0, 'Not pressed while the site is still loading');
    siteAttaches();
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(pressed.length, 1, 'Pressed once, however many clicks came in');
    assert.match(pressed[0], /mo=x/);
});

test('a ready site is pressed straight away', async () => {
    const {pressed, click, siteAttaches} = await buttonOnPage();
    siteAttaches();
    click();
    assert.equal(pressed.length, 1);
    assert.match(pressed[0], /mo=x/);
});

test('the install still goes ahead if the site never gets ready', async () => {
    const {pressed, click} = await buttonOnPage();
    click();
    await new Promise(resolve => setTimeout(resolve, 2500));
    assert.equal(pressed.length, 0);
    await new Promise(resolve => setTimeout(resolve, 800));
    assert.equal(pressed.length, 1);
});

test('a click opens the install tab, and installing sends Greasy Fork to post-install', async () => {
    const {session, tabs, send} = fixture();
    await send({type: 'GREASYFORK_INSTALL', url: SCRIPT}, buttonSender);
    await tick();
    const installTab = tabs.get(9);
    assert.equal(installTab.url, `${EXTENSION}index.html#/install?url=${encodeURIComponent(SCRIPT)}`);
    assert.equal(installTab.openerTabId, 3);
    assert.equal(session.ts_install_return_9.url, `${PAGE}/post-install`);

    const reply = await send({type: 'USERSCRIPT_INSTALLED'}, {id: 'ext', url: `${EXTENSION}index.html#/install`, tab: {id: 9}});
    assert.equal(reply.returned, true);
    assert.equal(tabs.get(3).url, `${PAGE}/post-install`);
    assert.equal(tabs.get(3).active, true);
    assert.equal(tabs.has(9), false);
    assert.equal(session.ts_install_return_9, undefined);
});

test('requests from other pages or for other files are ignored', async () => {
    const {tabs, send} = fixture();
    await send({type: 'GREASYFORK_INSTALL', url: 'https://evil.example/x.user.js'}, buttonSender);
    await send({type: 'GREASYFORK_INSTALL', url: SCRIPT}, {...buttonSender, url: 'https://evil.example/scripts/1'});
    await send({type: 'GREASYFORK_INSTALL', url: SCRIPT}, {...buttonSender, frameId: 2});
    await tick();
    assert.equal(tabs.has(9), false);
});

test('a tab already on the post-install page just comes to the front', async () => {
    const {tabs, send} = fixture();
    await send({type: 'GREASYFORK_INSTALL', url: SCRIPT}, buttonSender);
    await tick();
    tabs.get(3).url = `${PAGE}/post-install`;
    let reloaded = false;
    const update = tabs.get(3);
    Object.defineProperty(update, 'url', {get: () => `${PAGE}/post-install`, set: () => { reloaded = true; }});
    const reply = await send({type: 'USERSCRIPT_INSTALLED'}, {id: 'ext', url: `${EXTENSION}index.html#/install`, tab: {id: 9}});
    assert.equal(reply.returned, true);
    assert.equal(reloaded, false);
    assert.equal(tabs.get(3).active, true);
});

test('no redirect when the Greasy Fork tab has moved on', async () => {
    const {tabs, send} = fixture();
    await send({type: 'GREASYFORK_INSTALL', url: SCRIPT}, buttonSender);
    await tick();
    tabs.get(3).url = 'https://news.example/';
    const reply = await send({type: 'USERSCRIPT_INSTALLED'}, {id: 'ext', url: `${EXTENSION}index.html#/install`, tab: {id: 9}});
    assert.equal(reply.returned, false);
    assert.equal(tabs.get(3).url, 'https://news.example/');
    assert.equal(tabs.has(9), true);
});
