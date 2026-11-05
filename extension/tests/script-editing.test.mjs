import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

function setup(scripts, files = {}) {
    const store = {ts_background_scripts: scripts, ...files};
    const local = {
        get: async key => (key in store ? {[key]: store[key]} : {}),
        set: async values => { Object.assign(store, values); },
    };
    const fetched = [];
    const load = createLoader({globals: {
        chrome: {storage: {local, onChanged: {addListener() {}, removeListener() {}}}, runtime: {sendMessage: async () => ({})}},
        fetch: async url => {
            fetched.push(String(url));
            return {ok: true, headers: {get: () => 'text/javascript'}, arrayBuffer: async () => new TextEncoder().encode('// lib').buffer};
        },
        TextEncoder, TextDecoder, btoa,
    }});
    return {store, fetched, ...load('src/userscripts/editScript.ts'), storage: load('src/storage/codeFiles.ts')};
}

const plainScript = (changes = {}) => ({
    id: 'a', conversationId: 'chat', name: 'A', description: 'd', code: 'function a() {}',
    urlMatchPattern: 'https://a.com/*', status: 'paused', runAt: 'document_idle', ...changes,
});

const header = (...lines) => ['// ==UserScript==', '// @name Mine', ...lines, '// ==/UserScript==', 'console.log(1);'].join('\n');

const installed = (changes = {}) => plainScript({
    name: 'Mine', code: header('// @match https://a.com/*', '// @require https://cdn.example/lib.js'),
    userscript: {
        namespace: '', version: '1', author: '', homepage: '', matches: ['https://a.com/*'], includes: [], excludeMatches: [], excludes: [],
        allFrames: true, world: 'MAIN', grants: [], connects: [], requires: [{url: 'https://cdn.example/lib.js', code: '// kept'}], resources: [],
        updateURL: '', downloadURL: '', sourceUrl: 'https://src.example/mine.user.js', installedAt: 5, contextMenu: false,
        connectAllowed: ['api.example'], pendingUpdate: {version: '2', url: 'https://src.example/2.user.js'},
    },
    ...changes,
});

test('a plain script keeps everything but its code, and needs a function to start from', async () => {
    const {scriptCodeProblem, saveEditedScript, store} = setup([plainScript()]);
    assert.equal(scriptCodeProblem(plainScript(), 'function b() {}'), null);
    assert.match(scriptCodeProblem(plainScript(), 'const b = () => {};'), /named function/);
    await saveEditedScript(plainScript(), 'function b() {}');
    assert.deepEqual(plain(store.ts_background_scripts), [plainScript({code: 'function b() {}'})]);
});

test('the working file follows a hand edit, unless it has edits of its own', async () => {
    const inStep = setup([plainScript({sourcePath: 'scripts/a.js'})]);
    await inStep.storage.writeFile('chat', 'scripts/a.js', 'function a() {}');
    const fileKey = Object.keys(inStep.store).find(k => k.includes('scripts/a.js'));
    await inStep.saveEditedScript(plainScript({sourcePath: 'scripts/a.js'}), 'function b() {}');
    assert.equal(inStep.store[fileKey], 'function b() {}');

    const ahead = setup([plainScript({sourcePath: 'scripts/a.js'})]);
    await ahead.storage.writeFile('chat', 'scripts/a.js', 'function agentWork() {}');
    await ahead.saveEditedScript(plainScript({sourcePath: 'scripts/a.js'}), 'function b() {}');
    assert.equal(ahead.store[fileKey], 'function agentWork() {}');
    assert.equal(ahead.store.ts_background_scripts[0].code, 'function b() {}');
});

test('a hand edit keeps what the working file last shared, so the agent cannot quietly undo it', async () => {
    const {saveEditedScript, store, storage} = setup([]);
    const {codeFingerprint, compareWorkingFile} = createLoader()('src/userscripts/workingFile.ts');
    const linked = plainScript({sourcePath: 'scripts/a.js'});
    const fileKey = 'ts_file:chat/scripts/a.js';

    await storage.writeFile('chat', 'scripts/a.js', 'function a() {}');
    const followed = await saveEditedScript(linked, 'function b() {}');
    assert.equal(followed.sourceBase, codeFingerprint('function b() {}'), 'a file in step follows, and so does what they share');
    assert.equal(compareWorkingFile(followed, store[fileKey]), 'saved');

    await storage.writeFile('chat', 'scripts/a.js', 'function agentWork() {}');
    const kept = await saveEditedScript(followed, 'function c() {}');
    assert.equal(kept.sourceBase, codeFingerprint('function b() {}'));
    assert.equal(compareWorkingFile(kept, store[fileKey]), 'diverged');

    // Linked to another chat: that chat's file follows, not one named the same here.
    await storage.writeFile('elsewhere', 'scripts/a.js', 'function c() {}');
    await saveEditedScript({...kept, code: 'function c() {}', sourceConversationId: 'elsewhere'}, 'function d() {}');
    assert.equal(store['ts_file:elsewhere/scripts/a.js'], 'function d() {}');
    assert.equal(store[fileKey], 'function agentWork() {}');
});

test('a userscript edit reads its header again and keeps what the header does not decide', async () => {
    const {withEditedCode, fetched} = setup([installed()]);
    const code = header('// @match https://b.com/*', '// @require https://cdn.example/lib.js', '// @run-at document-start', '// @grant GM_setValue', '// @version 3');
    const edited = plain(await withEditedCode(installed(), code));
    assert.equal(edited.code, code);
    assert.equal(edited.id, 'a');
    assert.equal(edited.status, 'paused');
    assert.equal(edited.runAt, 'document_start');
    assert.equal(edited.urlMatchPattern, 'https://b.com/*');
    assert.deepEqual(edited.userscript.matches, ['https://b.com/*']);
    assert.deepEqual(edited.userscript.grants, ['GM_setValue']);
    assert.equal(edited.userscript.version, '3');
    assert.equal(edited.userscript.world, 'USER_SCRIPT');
    assert.equal(edited.userscript.installedAt, 5);
    assert.deepEqual(edited.userscript.connectAllowed, ['api.example']);
    assert.equal(edited.userscript.pendingUpdate.version, '2');
    assert.equal(edited.userscript.requires[0].code, '// kept');
    assert.deepEqual(fetched, [], 'the same @require list needs no fetching');
});

test('a userscript edit fetches a changed @require, and a removed header is refused', async () => {
    const {withEditedCode, scriptCodeProblem, fetched} = setup([installed()]);
    const edited = plain(await withEditedCode(installed(), header('// @match https://a.com/*', '// @require https://cdn.example/new.js')));
    assert.deepEqual(fetched, ['https://cdn.example/new.js']);
    assert.deepEqual(edited.userscript.requires, [{url: 'https://cdn.example/new.js', code: '// lib'}]);
    assert.match(scriptCodeProblem(installed(), 'console.log(1);'), /==UserScript==/);
    await assert.rejects(withEditedCode(installed(), 'console.log(1);'), /==UserScript==/);
});

test('a rename stays the same script', async () => {
    const {withEditedCode} = setup([installed()]);
    const edited = plain(await withEditedCode(installed(), installed().code.replace('@name Mine', '@name Renamed')));
    assert.equal(edited.id, 'a');
    assert.equal(edited.name, 'Renamed');
});

test('syntax problems are found with their line, and valid script code passes', () => {
    const {findSyntaxProblem} = createLoader()('src/userscripts/scriptSyntax.ts');
    assert.equal(findSyntaxProblem('function a() {\n  return /x\\/y/.test(`t${1}`) ? a?.b ?? 1 / 2 : class { #p = 1; };\n}'), null);
    assert.equal(findSyntaxProblem('const x = 1;\nreturn x;'), null, 'a script body runs inside a function');
    const broken = 'function a() {\n  const x = ;\n}';
    assert.equal(findSyntaxProblem(broken).line, 2);
    assert.equal(findSyntaxProblem('function a() {\n  foo(;\n').line, 2);
});
