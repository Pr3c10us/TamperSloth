import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {IDBFactory} from 'fake-indexeddb';
import {createLoader, plain} from './load-ts.mjs';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const pngBlob = () => new Blob([PNG], {type: 'image/png'});
const pngDataUrl = () => `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`;

/** A browser's worth of image APIs: every decoded image is 1000x500, and canvases write a fixed PNG or JPEG. */
function fixture({scripts = [], responses = {}, page = () => ({}), clipboardResult = {ok: true}} = {}) {
    const fetched = [], injected = [], clipboardCalls = [];
    class OffscreenCanvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return {drawImage() {}, fillRect() {}}; }
        async convertToBlob({type}) { return new Blob([type === 'image/jpeg' ? JPEG : PNG], {type}); }
    }
    const fetch = async (url, options) => {
        if (String(url).startsWith('data:')) return new Response(Buffer.from(String(url).split(',')[1], 'base64'));
        fetched.push({url, options});
        const answer = responses[url];
        if (!answer) throw new Error('Failed to fetch');
        return answer();
    };
    const chrome = {
        runtime: {sendMessage: async () => ({ok: true})},
        storage: {local: {get: async () => ({ts_background_scripts: scripts})}, session: {get: async () => ({}), set: async () => {}}},
        scripting: {executeScript: async injection => {
            injected.push(injection);
            return [{result: await page(injection)}];
        }},
    };
    const load = createLoader({
        globals: {chrome, indexedDB: new IDBFactory(), Blob, Response, fetch, atob, btoa, TextDecoder, TextEncoder, OffscreenCanvas,
            createImageBitmap: async () => ({width: 1000, height: 500, close() {}})},
        mocks: {'./screenshotCapture': {capturePng: async (_tabId, box) => ({blob: pngBlob(), box})}},
    });
    const library = load('src/chat/lib/imageLibrary.ts');
    const service = load('src/background/imageService.ts');
    const clipboard = async (...args) => { clipboardCalls.push(args); return clipboardResult; };
    const run = input => service.runImageAction({index: 0, ...input}, clipboard);
    return {library, run, fetched, injected, clipboardCalls};
}

const stored = (library, name, extra = {}) => library.writeImage({name, blob: pngBlob(), mimeType: 'image/png', width: 10, height: 10, ...extra});

test('names are what scripts type: readable, normalized, and anything else is refused', () => {
    const {library} = fixture();
    assert.equal(library.normalizeImageName('  My Cursor '), 'my-cursor');
    assert.equal(library.normalizeImageName('logo_v2.final'), 'logo_v2.final');
    for (const bad of ['', '../secret', '-leading', 'a/b', 'x'.repeat(81)]) assert.throws(() => library.normalizeImageName(bad), /image name/);
    assert.equal(library.imageNameFromFile('Holiday Photo (1).PNG', []), 'holiday-photo-1');
    assert.equal(library.imageNameFromFile('Holiday Photo (1).PNG', ['holiday-photo-1']), 'holiday-photo-1-2');
    assert.equal(library.imageNameFromFile('.png', []), 'image');
    assert.equal(library.imageFileName({name: 'cursor', mimeType: 'image/svg+xml'}), 'cursor.svg');
    assert.equal(library.imageFileName({name: 'photo.jpg', mimeType: 'image/jpeg'}), 'photo.jpg');
});

test('the real type comes from the bytes, not the label, and non-images are refused', async () => {
    const {library} = fixture();
    assert.equal(library.sniffImageType(PNG), 'image/png');
    assert.equal(library.sniffImageType(JPEG), 'image/jpeg');
    assert.equal(library.sniffImageType(new TextEncoder().encode('<?xml version="1.0"?>\n<!-- hi --><svg xmlns="x"></svg>')), 'image/svg+xml');
    assert.equal(library.sniffImageType(new TextEncoder().encode('<html><body>Sign in</body></html>')), null);

    const labelled = await library.prepareImage(new Blob([JPEG], {type: 'image/png'}));
    assert.equal(labelled.mimeType, 'image/jpeg');
    assert.equal(labelled.blob.type, 'image/jpeg');
    await assert.rejects(library.prepareImage(new Blob(['<html>Sign in</html>'], {type: 'image/png'})), /isn't an image/);
});

test('an SVG reports its size without being decoded, and refuses what a worker cannot do to it', async () => {
    const {library} = fixture();
    const svg = text => new Blob([text], {type: 'text/plain'});
    assert.deepEqual(plain(library.svgDimensions('<svg width="32" height="24px"></svg>')), {width: 32, height: 24});
    assert.deepEqual(plain(library.svgDimensions('<svg viewBox="0 0 100 50"></svg>')), {width: 100, height: 50});
    const prepared = await library.prepareImage(svg('<svg viewBox="0 0 100 50"></svg>'));
    assert.equal(prepared.mimeType, 'image/svg+xml');
    assert.equal(prepared.width, 100);
    await assert.rejects(library.prepareImage(svg('<svg></svg>'), {maxSize: 32}), /SVG can't be resized/);
    assert.equal(await library.imagePreview(new Blob(['<svg></svg>'], {type: 'image/svg+xml'}), 100), null);
});

test('resizing fits the longest side, never enlarges, and converting keeps the original untouched otherwise', async () => {
    const {library} = fixture();
    const small = await library.prepareImage(pngBlob(), {maxSize: 64});
    assert.deepEqual([small.width, small.height], [64, 32]);
    const same = await library.prepareImage(pngBlob(), {maxSize: 4000});
    assert.deepEqual([same.width, same.height], [1000, 500]);
    const original = await library.prepareImage(pngBlob());
    assert.equal(original.blob.size, PNG.length);
    assert.equal((await library.prepareImage(pngBlob(), {format: 'jpeg'})).mimeType, 'image/jpeg');
});

test('a name is never overwritten by accident', async () => {
    const {library} = fixture();
    const first = await stored(library, 'Hero');
    assert.equal(first.name, 'hero');
    assert.equal(first.replaced, false);
    await assert.rejects(library.writeImage({name: 'hero', blob: new Blob([JPEG]), mimeType: 'image/jpeg'}), /already exists/);
    assert.equal((await library.readImage('hero')).mimeType, 'image/png', 'The refused write changed nothing');
});

test('replacing needs asking for, and keeps the creation date', async () => {
    const {library} = fixture();
    const first = await stored(library, 'hero');
    await new Promise(resolve => setTimeout(resolve, 5));
    const second = await library.writeImage({name: 'hero', blob: new Blob([JPEG]), mimeType: 'image/jpeg'}, {replace: true});
    assert.equal(second.replaced, true);
    assert.equal(second.createdAt, first.createdAt);
    assert.ok(second.updatedAt > first.updatedAt);
    assert.equal((await library.readImage('hero')).mimeType, 'image/jpeg');
});

test('listing carries metadata only, newest first; reading brings the bytes back', async () => {
    const {library} = fixture();
    await stored(library, 'old');
    await new Promise(resolve => setTimeout(resolve, 5));
    await stored(library, 'new');
    const list = await library.listImages();
    assert.deepEqual(list.map(image => image.name), ['new', 'old']);
    assert.ok(list.every(image => !('blob' in image)));
    assert.equal(await (await library.readImage('New')).blob.text(), await pngBlob().text());
    assert.equal(await library.readImage('missing'), null);
});

test('rename and delete report what is missing or taken, and leave things as they were', async () => {
    const {library} = fixture();
    await stored(library, 'a');
    await stored(library, 'b');
    await assert.rejects(library.renameImage('a', 'b'), /already exists/);
    await assert.rejects(library.renameImage('nope', 'c'), /no image named "nope"/);
    assert.deepEqual((await library.listImages()).map(image => image.name).sort(), ['a', 'b']);
    assert.equal(await library.renameImage('a', 'C Name'), 'c-name');
    assert.equal(await library.readImage('a'), null);
    assert.ok(await library.readImage('c-name'));
    assert.equal(await library.deleteImage('b'), true);
    assert.equal(await library.deleteImage('b'), false);
});

test('an image over the limit is refused with what to do about it', async () => {
    const {library} = fixture();
    const big = new Blob([new Uint8Array(library.MAX_IMAGE_BYTES + 1)]);
    await assert.rejects(library.writeImage({name: 'big', blob: big, mimeType: 'image/png'}), /over the 20 MB limit.*maxSize/);
});

test('saving from a data URL stores it, returns a preview for the model and never the image bytes as text', async () => {
    const {library, run} = fixture();
    const result = await run({action: 'save', name: 'Logo', dataUrl: pngDataUrl(), description: 'The logo'});
    assert.equal(result.ok, true);
    assert.equal(result.image.name, 'logo');
    assert.equal(result.image.description, 'The logo');
    assert.equal(result.image.width, 1000);
    assert.ok(result.screenshot.startsWith('data:image/png;base64,'), 'A preview goes to the model as an image');
    assert.deepEqual(plain(result.metadata.imagePixels), {width: 384, height: 192});
    assert.match(result.hint, /MH_getImage\("logo"\)/);
    assert.ok(!JSON.stringify({...result, screenshot: ''}).includes(Buffer.from(PNG).toString('base64')));
    assert.equal((await library.readImage('logo')).size, PNG.length);
});

test('saving asks for one source and refuses to overwrite unless told', async () => {
    const {run} = fixture();
    await assert.rejects(run({action: 'save', name: 'x'}), /one source/);
    await assert.rejects(run({action: 'save', dataUrl: pngDataUrl()}), /name is required/);
    await run({action: 'save', name: 'x', dataUrl: pngDataUrl()});
    await assert.rejects(run({action: 'save', name: 'x', dataUrl: pngDataUrl()}), /already exists.*replace: true/);
    assert.equal((await run({action: 'save', name: 'x', dataUrl: pngDataUrl(), replace: true})).image.replaced, true);
});

test('a url is fetched with the session, and a signed query string never reaches the record', async () => {
    const url = 'https://cdn.example.com/img/a.png?sig=SECRET&token=SECRET';
    const {run, fetched} = fixture({responses: {[url]: () => new Response(pngBlob())}});
    const {image, via} = await run({action: 'save', name: 'a', url});
    assert.equal(via, 'network');
    assert.equal(fetched[0].options.credentials, 'include');
    assert.equal(image.source, 'https://cdn.example.com/img/a.png');
    assert.ok(!JSON.stringify(image).includes('SECRET'));
});

test('a url the extension cannot reach is read by the page, which can', async () => {
    const url = 'https://site.example/private.png';
    const {run, injected} = fixture({
        responses: {[url]: () => new Response('nope', {status: 403})},
        page: () => ({dataUrl: pngDataUrl()}),
    });
    const {via, image} = await run({action: 'save', name: 'private', url, tabId: 3});
    assert.equal(via, 'page');
    assert.equal(image.mimeType, 'image/png');
    assert.equal(injected[0].args[0].url, url);
    assert.ok(!injected[0].world, 'Reading runs in the isolated world, away from the page');
});

test('a sign-in page served in place of an image is not saved as one', async () => {
    const url = 'https://site.example/expired.png';
    const {library, run} = fixture({responses: {[url]: () => new Response('<html>Sign in</html>')}});
    await assert.rejects(run({action: 'save', name: 'expired', url}), /isn't an image/);
    assert.deepEqual(plain(await library.listImages()), []);
});

test('a blob: URL only exists in its page, so it needs one', async () => {
    const {run, fetched} = fixture({page: () => ({dataUrl: pngDataUrl()})});
    await assert.rejects(run({action: 'save', name: 'b', url: 'blob:https://x/1'}), /read from its page/);
    assert.equal((await run({action: 'save', name: 'b', url: 'blob:https://x/1', tabId: 3})).via, 'page');
    assert.equal(fetched.length, 0);
});

test('an element gives its image; one that cannot be read falls back to a screenshot and says so', async () => {
    const url = 'https://cdn.example/generated.png';
    const direct = fixture({responses: {[url]: () => new Response(pngBlob())}, page: ({func}) => func.name === 'readImageInPage' ? {src: url} : null});
    const saved = await direct.run({action: 'save', name: 'generated', selector: 'img.result', tabId: 3});
    assert.equal(saved.via, 'network');
    assert.equal(saved.note, undefined);

    const tainted = fixture({page: ({func}) => func.name === 'readImageInPage' ? {crop: true} : {x: 1, y: 2, width: 3, height: 4}});
    const cropped = await tainted.run({action: 'save', name: 'shot', selector: 'canvas', tabId: 3});
    assert.equal(cropped.via, 'screenshot');
    assert.match(cropped.note, /screenshot of the element/);

    const unreachable = fixture({page: ({func, args}) => func.name === 'readImageInPage' && !args[0].url ? {src: url} : func.name === 'readImageInPage' ? {error: 'CORS'} : {x: 1, y: 2, width: 3, height: 4}});
    assert.equal((await unreachable.run({action: 'save', name: 'shot2', selector: 'img', tabId: 3})).via, 'screenshot');

    const missing = fixture({page: () => ({error: 'Nothing on the page matches "img".'})});
    await assert.rejects(missing.run({action: 'save', name: 'none', selector: 'img', tabId: 3}), /Nothing on the page/);
});

test('view shows the image, or the markup for an SVG', async () => {
    const {library, run} = fixture();
    await stored(library, 'photo');
    const shown = await run({action: 'view', name: 'photo'});
    assert.ok(shown.screenshot.startsWith('data:image/png'));
    assert.deepEqual(plain(shown.metadata.imagePixels), {width: 1000, height: 500});
    assert.ok(!('blob' in shown.image));
    await library.writeImage({name: 'vector', blob: new Blob(['<svg></svg>'], {type: 'image/svg+xml'}), mimeType: 'image/svg+xml'});
    const vector = await run({action: 'view', name: 'vector'});
    assert.equal(vector.svg, '<svg></svg>');
    assert.equal(vector.screenshot, undefined);
    await assert.rejects(run({action: 'view', name: 'nope'}), /no image named "nope"/);
});

test('delete and rename name the saved scripts they break', async () => {
    const scripts = [{id: '1', name: 'Cursor', code: "const i = await MH_getImage('logo');"}, {id: '2', name: 'Other', code: 'x()'}];
    const {library, run} = fixture({scripts});
    await stored(library, 'logo');
    const renamed = await run({action: 'rename', name: 'logo', newName: 'brand'});
    assert.equal(renamed.name, 'brand');
    assert.deepEqual(plain(renamed.usedBy), ['Cursor']);
    assert.match(renamed.note, /still ask for "logo"/);
    await stored(library, 'logo');
    assert.deepEqual(plain((await run({action: 'delete', name: 'logo'})).usedBy), ['Cursor']);
    assert.equal((await run({action: 'delete', name: 'brand'})).usedBy, undefined);
    await assert.rejects(run({action: 'delete', name: 'brand'}), /no image named/);
});

test('upload hands the page a named file, and surfaces what the page reports', async () => {
    const {library, run, injected} = fixture({page: () => ({how: 'file field', accept: 'image/*'})});
    await stored(library, 'avatar');
    const result = await run({action: 'upload', name: 'avatar', tabId: 3});
    assert.equal(result.filename, 'avatar.png');
    assert.equal(result.how, 'file field');
    const args = injected[0].args[0];
    assert.equal(args.filename, 'avatar.png');
    assert.equal(args.base64, Buffer.from(PNG).toString('base64'));
    await assert.rejects(run({action: 'upload', name: 'avatar'}), /needs a page/);

    const none = fixture({page: () => ({error: 'This page has no file field.'})});
    await stored(none.library, 'avatar');
    await assert.rejects(none.run({action: 'upload', name: 'avatar', tabId: 3}), /no file field/);
});

test('copy sends a PNG to the clipboard document, and an SVG or a failure says so', async () => {
    const {library, run, clipboardCalls} = fixture();
    await stored(library, 'pic');
    assert.equal((await run({action: 'copy', name: 'pic'})).copied, 'pic');
    assert.equal(clipboardCalls[0][0], 'writeImage');
    assert.ok(clipboardCalls[0][2].startsWith('data:image/png;base64,'));
    await library.writeImage({name: 'vector', blob: new Blob(['<svg></svg>'], {type: 'image/svg+xml'}), mimeType: 'image/svg+xml'});
    await assert.rejects(run({action: 'copy', name: 'vector'}), /SVG can't be copied/);

    const failing = fixture({clipboardResult: {error: 'Document is not focused.'}});
    await stored(failing.library, 'pic');
    await assert.rejects(failing.run({action: 'copy', name: 'pic'}), /not focused/);
});

test('a script export can find the images its code names literally', () => {
    const {library} = fixture();
    const code = `await MH_getImage('Hero Shot'); await GM_getImage("logo"); GM.getImage(\`icon\`); MH_getImage(dynamic); MH_getImage('../bad');`;
    assert.deepEqual([...library.referencedImageNames(code)], ['hero-shot', 'logo', 'icon']);
});

test('a backup round trip restores images, keeps what is already here and skips what cannot be read', async () => {
    const source = fixture();
    await stored(source.library, 'kept');
    await stored(source.library, 'moved', {description: 'Brought along'});
    const exported = await source.library.exportImages();
    assert.equal(exported.length, 2);
    assert.ok(exported.every(image => image.dataUrl.startsWith('data:image/png;base64,')));
    assert.equal((await source.library.exportImages(['moved', 'gone'])).length, 1);

    const target = fixture();
    await target.library.writeImage({name: 'kept', blob: new Blob([JPEG]), mimeType: 'image/jpeg'});
    const result = await target.library.importImages([...exported, {name: 'bad', dataUrl: 'data:image/png;base64,PGh0bWw+'}, {name: '../evil', dataUrl: pngDataUrl()}, null]);
    assert.deepEqual([...result.added], ['moved']);
    assert.deepEqual([...result.kept], ['kept']);
    assert.equal(result.failed.length, 3);
    assert.equal((await target.library.readImage('kept')).mimeType, 'image/jpeg', 'A backup never overwrites');
    assert.equal((await target.library.readImage('moved')).description, 'Brought along');
    assert.deepEqual(plain(await target.library.importImages(undefined)), {added: [], kept: [], failed: []});
});

test('importing a script brings its images, and exporting one packs them', async () => {
    const saved = {};
    const chrome = {storage: {local: {
        get: async key => ({[key]: saved[key]}),
        set: async value => Object.assign(saved, value),
    }}, runtime: {sendMessage: async () => ({ok: true})}};
    const downloads = [];
    class CapturingURL extends URL {
        static createObjectURL(blob) { downloads.push(blob); return 'blob:x'; }
        static revokeObjectURL() {}
    }
    const load = createLoader({globals: {chrome, indexedDB: new IDBFactory(), Blob, atob, btoa, TextDecoder, OffscreenCanvas: class {}, URL: CapturingURL,
        document: {createElement: () => ({click() {}})}, createImageBitmap: async () => ({width: 4, height: 4, close() {}})}});
    const storage = load('src/chat/lib/storage.ts');
    const library = load('src/chat/lib/imageLibrary.ts');
    const script = {id: 'old', name: 'S', description: '', code: "MH_getImage('logo')", urlMatchPattern: '<all_urls>', status: 'active', runAt: 'document_idle', conversationId: ''};
    const count = await storage.importScriptsFromJson(JSON.stringify({...script, images: [{name: 'logo', dataUrl: pngDataUrl()}]}));
    assert.equal(count, 1);
    assert.ok(await library.readImage('logo'), 'The image arrived with the script');
    const [imported] = await storage.loadScripts();
    assert.equal('images' in imported, false, 'The bytes stay out of the script record');
    assert.notEqual(imported.id, 'old');

    await storage.exportScript(imported);
    const exported = JSON.parse(await downloads[0].text());
    assert.deepEqual(exported.images.map(image => image.name), ['logo']);
    assert.equal(exported.images[0].dataUrl, pngDataUrl());

    await storage.exportScript({...imported, code: 'nothing()'});
    assert.equal('images' in JSON.parse(await downloads[1].text()), false, 'A script that names no image exports as before');
});

// ── Scripts reading the library ─────────────────────────────

test('userscripts: GM_getImage reaches the background, gets a usable image, and missing means null', async () => {
    const chrome = {runtime: {getManifest: () => ({version: '3.2'}), sendMessage: async () => ({ok: true})}};
    const runtime = createLoader({globals: {chrome}})('src/background/userscriptRuntime.ts');
    const code = runtime.buildUserscriptCode({
        id: 'abc', conversationId: '', name: 'T', description: '', urlMatchPattern: '', status: 'active', runAt: 'document_idle',
        code: `Promise.all([GM_getImage('Logo'), GM.getImage('none'), GM_listImages()]).then(function (r) { out.done(r); });`,
        userscript: {namespace: '', version: '', author: '', homepage: '', matches: [], includes: [], excludeMatches: [], excludes: [],
            allFrames: false, world: 'USER_SCRIPT', grants: ['GM_getImage', 'GM_listImages'], connects: [], requires: [], resources: [], updateURL: '', downloadURL: '', sourceUrl: '', installedAt: 0},
    }, 'token');
    const sent = [];
    const result = await new Promise((resolve, reject) => {
        const context = vm.createContext({console, atob, Blob, URL, setTimeout, location: {href: 'https://a.example/'}, out: {done: resolve},
            chrome: {runtime: {sendMessage: async message => {
                sent.push(structuredClone(message));
                if (message.type === 'GM_LIST_IMAGES') return {images: [{name: 'logo'}]};
                if (message.type === 'GM_GET_IMAGE') return {image: message.name === 'Logo'
                    ? {name: 'logo', mimeType: 'image/png', size: 12, width: 4, height: 4, base64: Buffer.from(PNG).toString('base64')} : null};
                return {ok: true};
            }, connect: () => ({onMessage: {addListener() {}}, onDisconnect: {addListener() {}}, postMessage() {}})}}});
        context.window = context;
        vm.runInContext(code, context);
        setTimeout(() => reject(new Error('The script never finished')), 1000);
    });
    const [image, missing, list] = result;
    assert.equal(image.name, 'logo');
    assert.equal(image.dataUrl, pngDataUrl());
    assert.equal(image.blob.type, 'image/png');
    assert.equal(image.blob.size, PNG.length);
    assert.equal(missing, null);
    assert.equal(list[0].name, 'logo');
    assert.ok(sent.filter(m => m.type.startsWith('GM_')).every(m => m.token === 'token' && m.scriptId === 'abc'));
});

test('userscripts need their own @grant to read the library, and a reviewed one sees it', async () => {
    const load = createLoader({
        globals: {chrome: {runtime: {sendMessage: async () => ({ok: true})}, tabs: {}, storage: {session: {}}}, indexedDB: new IDBFactory(), Blob, atob, btoa, TextDecoder},
        mocks: {'./browserService': {clipboard: async () => ({})}, './connectPrompt': {askToConnect: async () => false}, './userscriptHost': {pushToScript() {}}},
    });
    const bridge = load('src/background/userscriptBridge.ts');
    const library = load('src/chat/lib/imageLibrary.ts');
    await stored(library, 'logo');
    const script = grants => ({id: 'a', name: 'A', userscript: {grants}});
    const none = script(['GM_xmlhttpRequest']);
    assert.equal((await bridge.handleGmRequest({type: 'GM_GET_IMAGE', name: 'logo'}, {}, none)).denied, true);
    assert.equal((await bridge.handleGmRequest({type: 'GM_LIST_IMAGES'}, {}, none)).denied, true);
    const granted = script(['GM.getImage', 'GM_listImages']);
    const {image} = await bridge.handleGmRequest({type: 'GM_GET_IMAGE', name: 'logo'}, {}, granted);
    assert.equal(image.base64, Buffer.from(PNG).toString('base64'));
    assert.deepEqual(plain(await bridge.handleGmRequest({type: 'GM_GET_IMAGE', name: '../nope'}, {}, granted)), {image: null});
    assert.equal((await bridge.handleGmRequest({type: 'GM_LIST_IMAGES'}, {}, granted)).images[0].name, 'logo');
    assert.equal((await bridge.handleGmRequest({type: 'GM_GET_IMAGE', name: 'logo'}, {}, {id: 'p', name: 'Plain'})).denied, true);
});

test('saved and one-off scripts get the same helpers; one-off code only carries the token when it uses them', async () => {
    const session = {};
    const load = createLoader({globals: {chrome: {storage: {session: {
        get: async key => ({[key]: session[key]}), set: async value => Object.assign(session, value),
    }}}}});
    const api = load('src/background/imageScriptApi.ts');
    assert.equal(api.usesImageHelpers('const a = 1;'), false);
    assert.equal(api.usesImageHelpers('await MH_getImage("a")'), true);
    const token = await api.temporaryImageToken();
    assert.equal(await api.temporaryImageToken(), token, 'Steady for the browser session');

    const sent = [];
    const context = vm.createContext({atob, Blob, chrome: {runtime: {sendMessage: async message => {
        sent.push(structuredClone(message));
        if (message.type === 'SCRIPT_LIST_IMAGES') return {images: []};
        return message.name === 'boom' ? {error: 'Denied'} : {image: null};
    }}}});
    vm.runInContext(`${api.temporaryImageHelpers(token)}; this.get = MH_getImage; this.list = MH_listImages;`, context);
    assert.equal(await context.get('missing'), null);
    assert.deepEqual([...await context.list()], []);
    await assert.rejects(context.get('boom'), /Denied/);
    assert.ok(sent.every(message => message.imageToken === token));
});

// ── How the agent sees it ───────────────────────────────────

test('the model cannot pass image bytes in, and an attachment goes through by file name', async () => {
    const calls = [];
    const load = createLoader({globals: {btoa, Blob, chrome: {runtime: {sendMessage: async message => { calls.push(message); return {ok: true}; }}}}});
    const tools = load('src/chat/lib/browserTools.ts').createBrowserTools(() => 9, () => {}, undefined, {
        conversationId: 'c', findAttachment: async name => name === 'me.png' ? pngBlob() : null,
    });
    const schema = tools.imageLibrary.inputSchema;
    assert.equal(schema.shape.dataUrl, undefined);
    await tools.imageLibrary.execute({action: 'save', name: 'me', attachment: 'me.png', index: 0});
    assert.equal(calls[0].operation, 'images');
    assert.equal(calls[0].input.tabId, 9);
    assert.equal(calls[0].input.dataUrl, `data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    assert.match((await tools.imageLibrary.execute({action: 'save', name: 'x', attachment: 'other.png', index: 0})).error, /No file named/);
    calls.length = 0;
    await tools.imageLibrary.execute({action: 'save', name: 'x', ref: 'c3', index: 0});
    assert.equal(calls[0].input.action, 'resolveRef');
});

test('image requests load the tool, and the group can be enabled', async () => {
    const {initialToolGroups, TOOL_GROUPS} = createLoader({globals: {}})('src/chat/lib/toolRuntime.ts');
    assert.ok(initialToolGroups('save this picture and use it as my cursor').includes('images'));
    assert.ok(initialToolGroups('Generate an image on ChatGPT').includes('images'));
    assert.ok(!initialToolGroups('summarize this article').includes('images'));
    assert.deepEqual([...TOOL_GROUPS.images], ['imageLibrary']);
});

test('the safety layer sees saves, replacements, uploads and deletions for what they are', () => {
    const {assessAction} = createLoader({globals: {}})('src/chat/lib/actionScreen.ts');
    assert.equal(assessAction('imageLibrary', {action: 'list'}).risk, 'none');
    assert.equal(assessAction('imageLibrary', {action: 'view', name: 'a'}).risk, 'none');
    const save = assessAction('imageLibrary', {action: 'save', name: 'a', url: 'https://x.example/a.png'});
    assert.equal(save.risk, 'low');
    assert.deepEqual([...save.payload], ['https://x.example/a.png']);
    assert.equal(assessAction('imageLibrary', {action: 'save', name: 'a', replace: true}).risk, 'medium');
    const upload = assessAction('imageLibrary', {action: 'upload', name: 'a'});
    assert.equal(upload.risk, 'medium');
    assert.equal(upload.changes, true);
    assert.equal(assessAction('imageLibrary', {action: 'delete', name: 'a'}).changes, true);
});
