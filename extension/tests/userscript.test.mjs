import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

const us = createLoader()('src/scripts/userscript.ts');

const script = (meta, body = '') => `// ==UserScript==\n${meta.map(line => `// ${line}`).join('\n')}\n// ==/UserScript==\n${body}`;
const regex = ([source, flags]) => new RegExp(source, flags);

test('reads the header of a typical Greasy Fork script', () => {
    const parsed = us.parseUserscript(script([
        '@name         Wide GitHub',
        '@name:fr      GitHub large',
        '@namespace    https://example.com',
        '@version      1.4.2',
        '@description  Stretches GitHub to the window',
        '@author       Someone',
        '@match        https://github.com/*',
        '@match        https://gist.github.com/*',
        '@exclude      https://github.com/settings/*',
        '@run-at       document-start',
        '@grant        GM_addStyle',
        '@grant        GM_getValue',
        '@require      https://cdn.example.com/lib.js#sha256=abc',
        '@resource     css https://cdn.example.com/theme.css',
        '@connect      api.github.com',
        '@noframes',
    ], 'GM_addStyle("body{}")'));
    assert.equal(parsed.name, 'Wide GitHub');
    assert.equal(parsed.version, '1.4.2');
    assert.deepEqual(plain(parsed.matches), ['https://github.com/*', 'https://gist.github.com/*']);
    assert.deepEqual(plain(parsed.excludes), ['https://github.com/settings/*']);
    assert.equal(parsed.runAt, 'document_start');
    assert.equal(parsed.allFrames, false);
    assert.equal(parsed.world, 'USER_SCRIPT');
    assert.deepEqual(plain(parsed.grants), ['GM_addStyle', 'GM_getValue']);
    assert.deepEqual(plain(parsed.requires), ['https://cdn.example.com/lib.js#sha256=abc']);
    assert.deepEqual(plain(parsed.resources), [{name: 'css', url: 'https://cdn.example.com/theme.css'}]);
    assert.deepEqual(plain(parsed.connects), ['api.github.com']);
    assert.deepEqual(plain(parsed.warnings), []);
});

test('rejects source without a header or a name', () => {
    assert.throws(() => us.parseUserscript('console.log(1)'), /no ==UserScript== header/);
    assert.throws(() => us.parseUserscript(script(['@match *://*/*'])), /no @name/);
});

test('@grant none and plain unsafeWindow scripts run in the page', () => {
    assert.equal(us.parseUserscript(script(['@name a', '@match *://*/*', '@grant none'])).world, 'MAIN');
    assert.equal(us.parseUserscript(script(['@name a', '@match *://*/*', '@grant unsafeWindow'])).world, 'MAIN');
    assert.equal(us.parseUserscript(script(['@name a', '@match *://*/*', '@grant none', '@inject-into content'])).world, 'USER_SCRIPT');
});

test('unsafeWindow alongside GM functions runs in the page, with a warning', () => {
    const both = us.parseUserscript(script(['@name a', '@match *://*/*', '@grant GM_setValue', '@grant unsafeWindow']));
    assert.equal(both.world, 'MAIN');
    assert.ok(us.needsGmRelay(both));
    assert.ok(both.warnings.some(w => /hostile page/.test(w)));
    const mentioned = us.parseUserscript(script(['@name a', '@match *://*/*', '@grant GM_addStyle'], 'unsafeWindow.foo = 1'));
    assert.equal(mentioned.world, 'MAIN');
    const gmOnly = us.parseUserscript(script(['@name a', '@match *://*/*', '@grant GM_addStyle']));
    assert.equal(gmOnly.world, 'USER_SCRIPT');
    assert.ok(!us.needsGmRelay(gmOnly));
    assert.ok(!us.needsGmRelay(us.parseUserscript(script(['@name a', '@match *://*/*', '@grant none']))));
    const kept = us.parseUserscript(script(['@name a', '@match *://*/*', '@grant GM_addStyle', '@grant unsafeWindow', '@inject-into content']));
    assert.equal(kept.world, 'USER_SCRIPT');
    assert.ok(kept.warnings.some(w => /its own window/.test(w)));
});

test('@run-at context-menu scripts are marked, and only GM_webRequest stays unsupported', () => {
    const parsed = us.parseUserscript(script(['@name a', '@match *://*/*', '@run-at context-menu']));
    assert.equal(parsed.contextMenu, true);
    assert.deepEqual(plain(parsed.warnings), []);
    assert.equal(us.parseUserscript(script(['@name a', '@match *://*/*'])).contextMenu, false);
    const grants = ['GM_registerMenuCommand', 'GM_cookie', 'GM_audio', 'GM_getTab', 'GM_addValueChangeListener'];
    assert.deepEqual(plain(us.parseUserscript(script(['@name a', '@match *://*/*', ...grants.map(g => `@grant ${g}`)])).warnings), []);
    assert.ok(us.parseUserscript(script(['@name a', '@match *://*/*', '@grant GM_webRequest'])).warnings.some(w => /GM_webRequest/.test(w)));
});

test('checks a page against every URL rule for right-click scripts', () => {
    const rules = {matches: ['https://a.com/*'], includes: ['https://b.com/*'], excludeMatches: ['https://a.com/private/*'], excludes: ['*/secret*']};
    assert.ok(us.urlCovered(rules, 'https://a.com/x'));
    assert.ok(us.urlCovered(rules, 'https://b.com/x'));
    assert.ok(!us.urlCovered(rules, 'https://a.com/private/x'));
    assert.ok(!us.urlCovered(rules, 'https://b.com/secret'));
    assert.ok(!us.urlCovered(rules, 'https://c.com/'));
});

test('an update needs review only when it asks for more', () => {
    const base = {grants: ['GM_getValue'], connects: ['a.test'], matches: ['https://a.com/*'], includes: [], world: 'USER_SCRIPT'};
    assert.equal(us.permissionsGrew(base, {...base}), false);
    assert.equal(us.permissionsGrew(base, {...base, grants: ['GM.getValue']}), false, 'Two spellings of one grant');
    assert.equal(us.permissionsGrew(base, {...base, grants: [], connects: [], matches: []}), false, 'Asking for less is fine');
    assert.equal(us.permissionsGrew(base, {...base, grants: ['GM_getValue', 'GM_cookie']}), true);
    assert.equal(us.permissionsGrew(base, {...base, connects: ['a.test', 'b.test']}), true);
    assert.equal(us.permissionsGrew(base, {...base, matches: ['https://a.com/*', 'https://bank.test/*']}), true);
    assert.equal(us.permissionsGrew(base, {...base, includes: ['*']}), true);
    assert.equal(us.permissionsGrew(base, {...base, world: 'MAIN'}), true);
});

test('without @grant lines, GM use is detected from the code', () => {
    const plainScript = us.parseUserscript(script(['@name a', '@match *://*/*'], 'document.title = "x"'));
    assert.equal(plainScript.world, 'MAIN');
    assert.deepEqual(plain(plainScript.grants), []);
    const gm = us.parseUserscript(script(['@name a', '@match *://*/*'], 'GM_setValue("k", 1); GM.xmlHttpRequest({}); GM_info.script'));
    assert.equal(gm.world, 'USER_SCRIPT');
    assert.equal(gm.grantsDetected, true);
    assert.deepEqual(plain(gm.grants), ['GM.xmlHttpRequest', 'GM_setValue']);
    assert.ok(gm.warnings.some(w => /no @grant lines/.test(w)));
    assert.ok(gm.warnings.some(w => /no @connect/.test(w)));
});

test('loose @match values are normalized, and impossible ones fall back to @include', () => {
    assert.equal(us.normalizeMatchPattern('http*://example.com/*'), '*://example.com/*');
    assert.equal(us.normalizeMatchPattern('*://example.com'), '*://example.com/*');
    assert.equal(us.normalizeMatchPattern('*'), '*://*/*');
    assert.equal(us.normalizeMatchPattern('<all_urls>'), '<all_urls>');
    assert.equal(us.normalizeMatchPattern('https://www.google.tld/*'), null);
    assert.equal(us.normalizeMatchPattern('https://foo*.example.com/*'), null);
    const parsed = us.parseUserscript(script(['@name a', '@match https://www.google.tld/search*']));
    assert.deepEqual(plain(parsed.matches), []);
    assert.deepEqual(plain(parsed.includes), ['https://www.google.tld/search*']);
    assert.equal(parsed.warnings.length, 1);
});

test('@include globs and regexes match the way Tampermonkey does', () => {
    const glob = regex(us.includeToRegExp('https://*.example.com/*'));
    assert.ok(glob.test('https://a.example.com/x/y?z'));
    assert.ok(!glob.test('https://example.org/'));
    const tld = regex(us.includeToRegExp('https://www.google.tld/search*'));
    assert.ok(tld.test('https://www.google.co.uk/search?q=1'));
    assert.ok(tld.test('https://www.google.com/search'));
    assert.ok(!tld.test('https://www.google.evil.com.attacker.net/search'));
    const literal = regex(us.includeToRegExp('/^https?:\\/\\/news\\.ycombinator\\.com\\/item/i'));
    assert.ok(literal.test('https://news.ycombinator.com/item?id=1'));
    assert.ok(regex(us.includeToRegExp('*')).test('https://anything/'));
});

test('match patterns become equivalent regexes for the load-time check', () => {
    const sub = regex(us.matchPatternToRegExp('*://*.example.com/app/*'));
    assert.ok(sub.test('https://example.com/app/1'));
    assert.ok(sub.test('http://x.y.example.com:8080/app/'));
    assert.ok(!sub.test('https://example.com.evil.net/app/'));
    assert.ok(!sub.test('ftp://example.com/app/'));
});

test('@include forces a broad registration with a load-time URL check', () => {
    const onlyMatch = {matches: ['https://a.com/*'], includes: [], excludes: []};
    assert.deepEqual(plain(us.registrationMatches(onlyMatch)), ['https://a.com/*']);
    assert.equal(us.runtimeUrlFilter(onlyMatch).include, null);

    const mixed = {matches: ['https://a.com/*'], includes: ['https://b.com/*'], excludes: ['*/private/*']};
    assert.deepEqual(plain(us.registrationMatches(mixed)), ['*://*/*']);
    const filter = us.runtimeUrlFilter(mixed);
    const allowed = url => filter.include.some(p => regex(p).test(url)) && !filter.exclude.some(p => regex(p).test(url));
    assert.ok(allowed('https://a.com/x'));
    assert.ok(allowed('https://b.com/x'));
    assert.ok(!allowed('https://b.com/private/x'));
    assert.ok(!allowed('https://c.com/'));
});

test('@connect allows listed hosts, their subdomains and the page itself', () => {
    assert.ok(us.connectAllowed('https://api.github.com/x', ['github.com']));
    assert.ok(us.connectAllowed('https://github.com/x', ['github.com']));
    assert.ok(!us.connectAllowed('https://evilgithub.com/x', ['github.com']));
    assert.ok(us.connectAllowed('https://site.com/api', [], 'https://site.com/page'));
    assert.ok(!us.connectAllowed('https://other.com/api', [], 'https://site.com/page'));
    assert.ok(us.connectAllowed('https://other.com/api', ['*']));
    assert.ok(!us.connectAllowed('not a url', ['*']));
});

test('reads subresource hashes and compares versions', () => {
    assert.deepEqual(plain(us.readIntegrity('https://x/lib.js#md5=aa,sha256=bb')), [
        {algorithm: 'md5', value: 'aa'}, {algorithm: 'sha256', value: 'bb'},
    ]);
    assert.deepEqual(plain(us.readIntegrity('https://x/lib.js')), []);
    assert.equal(us.compareVersions('1.10', '1.9'), 1);
    assert.equal(us.compareVersions('2.0', '2.0.0'), 0);
    assert.equal(us.compareVersions('1.0-beta', '1.0-alpha'), 1);
    assert.equal(us.compareVersions('0.9', '1'), -1);
});

test('labels where saved scripts run', () => {
    const agent = {urlMatchPattern: '*://example.com/*'};
    assert.equal(us.scriptSitesLabel(agent), 'example.com');
    const imported = {urlMatchPattern: 'https://a.com/*', userscript: {matches: ['https://a.com/*'], includes: ['/b/']}};
    assert.equal(us.scriptSitesLabel(imported), 'https://a.com +1');
    assert.deepEqual(plain(us.scriptReloadPatterns(imported)), ['https://a.com/*']);
});
