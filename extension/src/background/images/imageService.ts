import {
    deleteImage,
    imageFileName,
    imagePreview,
    listImages,
    MAX_IMAGE_BYTES,
    MAX_SOURCE_BYTES,
    normalizeImageName,
    prepareImage,
    readImage,
    blobToBase64,
    referencedImageNames,
    renameImage,
    writeImage,
} from '@/storage/imageLibrary';
import {loadScripts} from '@/storage/scripts';
import {capturePng} from '@/background/browser/screenshotCapture';

// The image library's actions. The extension fetches and holds the bytes itself:
// the model only ever sees a name and a small preview, never the image as text.

const SAVE_PREVIEW = 384;
const VIEW_PREVIEW = 1024;

type Source = {blob: Blob; via: 'network' | 'page' | 'screenshot' | 'data'; source?: string; note?: string};

/** Serialized into the page's isolated world; no extension-side dependencies. */
async function readImageInPage(args: {selector?: string; index: number; url?: string; maxBytes: number}) {
    const toDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
    const fetchHere = async (url: string) => {
        const response = await fetch(url, {credentials: 'include'});
        if (!response.ok) throw new Error(`The image request returned ${response.status}.`);
        const blob = await response.blob();
        if (blob.size > args.maxBytes) throw new Error('That image is too large to save.');
        return toDataUrl(blob);
    };
    if (args.url) {
        try { return {dataUrl: await fetchHere(args.url)}; }
        catch (error) { return {error: String((error as Error)?.message ?? error)}; }
    }
    const queryAll = (root: Document | ShadowRoot): Element[] => {
        const found = [...root.querySelectorAll(args.selector!)];
        for (const element of root.querySelectorAll('*')) if (element.shadowRoot) found.push(...queryAll(element.shadowRoot));
        return found;
    };
    let matches: Element[];
    try { matches = queryAll(document); }
    catch { return {error: `"${args.selector}" isn't a valid selector.`}; }
    const element = matches[args.index];
    if (!element) return {error: matches.length ? `Only ${matches.length} elements match "${args.selector}".` : `Nothing on the page matches "${args.selector}".`};

    const fromCanvas = (draw: (canvas: HTMLCanvasElement) => HTMLCanvasElement) => {
        // A canvas holding another site's pixels refuses to be read; the screenshot fallback still can.
        try { return {dataUrl: draw(document.createElement('canvas')).toDataURL('image/png')}; }
        catch { return {crop: true}; }
    };
    const srcOf = (target: Element): {src?: string; dataUrl?: string; crop?: boolean} | undefined => {
        if (target instanceof HTMLImageElement) return {src: target.currentSrc || target.src};
        if (target instanceof HTMLPictureElement) { const img = target.querySelector('img'); return img ? srcOf(img) : undefined; }
        if (target instanceof HTMLInputElement && target.type === 'image') return {src: target.src};
        if (target instanceof HTMLCanvasElement) return fromCanvas(() => target);
        if (target instanceof HTMLVideoElement && target.videoWidth) return fromCanvas(canvas => {
            canvas.width = target.videoWidth;
            canvas.height = target.videoHeight;
            canvas.getContext('2d')!.drawImage(target, 0, 0);
            return canvas;
        });
        if (target instanceof SVGSVGElement) {
            const markup = new XMLSerializer().serializeToString(target);
            return {dataUrl: `data:image/svg+xml;base64,${btoa(String.fromCharCode(...new TextEncoder().encode(markup)))}`};
        }
        const background = getComputedStyle(target).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1];
        return background ? {src: new URL(background, document.baseURI).href} : undefined;
    };
    // A wrapper around one picture means that picture.
    const inner = element.querySelectorAll('img,canvas,video,svg');
    const found = srcOf(element) ?? (inner.length === 1 ? srcOf(inner[0]) : undefined);
    if (!found?.src) return {...(found ?? {crop: true}), matches: matches.length};
    // These only exist inside the page, so only the page can read them.
    if (found.src.startsWith('blob:')) {
        try { return {dataUrl: await fetchHere(found.src), matches: matches.length}; }
        catch { return {crop: true, matches: matches.length}; }
    }
    return {src: found.src, matches: matches.length};
}

/** Serialized into the page's isolated world: brings the element on screen and measures it. */
function measureElementInPage(selector: string, index: number) {
    const queryAll = (root: Document | ShadowRoot): Element[] => {
        const found = [...root.querySelectorAll(selector)];
        for (const element of root.querySelectorAll('*')) if (element.shadowRoot) found.push(...queryAll(element.shadowRoot));
        return found;
    };
    const element = queryAll(document)[index];
    if (!element) return null;
    element.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
    const {x, y, width, height} = element.getBoundingClientRect();
    return {x, y, width, height};
}

/** Serialized into the page's isolated world: hands an image to the page as if the user had picked the file. */
function putImageInPage(args: {selector?: string; index: number; method: 'auto' | 'file' | 'paste' | 'drop'; base64: string; mimeType: string; filename: string}) {
    const queryAll = (root: Document | ShadowRoot, selector: string): Element[] => {
        const found = [...root.querySelectorAll(selector)];
        for (const element of root.querySelectorAll('*')) if (element.shadowRoot) found.push(...queryAll(element.shadowRoot, selector));
        return found;
    };
    const EDITABLE = 'textarea,input[type=text],input[type=search],input:not([type]),[contenteditable=""],[contenteditable=true],[contenteditable=plaintext-only]';
    const isEditable = (element: Element | null | undefined): element is HTMLElement => !!element && (element.matches(EDITABLE) || (element as HTMLElement).isContentEditable);
    const isVisible = (element: Element) => element.getClientRects().length > 0;
    const focused = () => {
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        return active;
    };
    const fileFieldIn = (element: Element) => element instanceof HTMLInputElement && element.type === 'file' ? element
        : element instanceof HTMLLabelElement && element.control instanceof HTMLInputElement && element.control.type === 'file' ? element.control
        : element.querySelector<HTMLInputElement>('input[type=file]');
    /** What the user is typing in, or else the page's first visible message box. */
    const messageBox = () => {
        const active = focused();
        return isEditable(active) ? active : queryAll(document, EDITABLE).find(isVisible);
    };

    let target: Element | undefined;
    if (args.selector) {
        try { target = queryAll(document, args.selector)[args.index]; }
        catch { return {error: `"${args.selector}" isn't a valid selector.`}; }
        if (!target) return {error: `Nothing on the page matches "${args.selector}".`};
    } else if (args.method === 'drop') {
        return {error: 'Dropping needs the selector of the drop area.'};
    } else {
        if (args.method !== 'paste') target = queryAll(document, 'input[type=file]')[args.index];
        if (args.method !== 'file') target ??= messageBox();
        if (!target) return {error: args.method === 'file' ? 'This page has no file field.' : 'This page has no file field or message box. Pass the selector of its drop area.'};
    }

    const binary = atob(args.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], args.filename, {type: args.mimeType}));

    const input = args.method === 'auto' || args.method === 'file' ? fileFieldIn(target) : null;
    if (input) {
        input.files = transfer.files;
        input.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
        input.dispatchEvent(new Event('change', {bubbles: true}));
        return {how: 'file field', accept: input.accept || undefined};
    }
    if (args.method === 'file') return {error: `"${args.selector}" has no file field.`};

    // A page that takes the file cancels the event's default, so that's the one sign of it these give.
    const paste = (element: HTMLElement) => {
        element.focus();
        return !element.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, composed: true, clipboardData: transfer}));
    };
    const drop = (element: Element) => {
        let taken = false;
        for (const type of ['dragenter', 'dragover', 'drop']) {
            taken = !element.dispatchEvent(new DragEvent(type, {bubbles: true, cancelable: true, composed: true, dataTransfer: transfer}));
        }
        return taken;
    };
    if (args.method === 'drop') return {how: 'drop', pageResponded: drop(target)};
    const box = isEditable(target) ? target : target.querySelector<HTMLElement>(EDITABLE);
    if (args.method === 'paste') return {how: 'paste', pageResponded: paste(box ?? target as HTMLElement)};
    // Auto: a message box is pasted into, and drop is the try left if it ignores that; anything else is a drop area.
    if (box && paste(box)) return {how: 'paste', pageResponded: true};
    return {how: 'drop', pageResponded: drop(target), ...(box ? {alsoTried: 'paste'} : {})};
}

const execute = async <T,>(tabId: number, func: (...args: any[]) => T, args: unknown[]): Promise<Awaited<T>> => {
    const [frame] = await chrome.scripting.executeScript({target: {tabId}, func: func as any, args: args as any});
    return frame?.result as Awaited<T>;
};

/** Where an image came from, for the record. Query strings go: signed URLs carry secrets. */
function sourceLabel(url: string) {
    try {
        const parsed = new URL(url);
        return /^https?:$/.test(parsed.protocol) ? parsed.origin + parsed.pathname : undefined;
    } catch {
        return undefined;
    }
}

const dataUrlToBlob = async (dataUrl: string) => (await fetch(dataUrl)).blob();

/** With host access the extension can usually fetch directly; the page can still reach what's tied to its own session. */
async function fetchImage(url: string, tabId: number | undefined): Promise<Source> {
    if (url.startsWith('data:')) return {blob: await dataUrlToBlob(url), via: 'data'};
    if (!/^(https?|blob):/.test(url)) throw new Error('Images can be saved from http, https, blob and data URLs.');
    const source = sourceLabel(url);
    let failure = 'The image could not be fetched.';
    if (!url.startsWith('blob:')) {
        try {
            const response = await fetch(url, {credentials: 'include'});
            if (response.ok) return {blob: await response.blob(), via: 'network', source};
            failure = `The image request returned ${response.status}.`;
        } catch (error) {
            failure = `The image could not be fetched: ${(error as Error)?.message ?? error}`;
        }
    }
    if (tabId === undefined) throw new Error(url.startsWith('blob:') ? 'A blob: URL can only be read from its page.' : failure);
    const read = await execute(tabId, readImageInPage, [{url, index: 0, maxBytes: MAX_SOURCE_BYTES}]);
    if ('dataUrl' in read && read.dataUrl) return {blob: await dataUrlToBlob(read.dataUrl), via: 'page', source};
    throw new Error(('error' in read && read.error) || failure);
}

async function captureElement(tabId: number, selector: string, index: number): Promise<Source> {
    const box = await execute(tabId, measureElementInPage, [selector, index]);
    if (!box) throw new Error(`Nothing on the page matches "${selector}".`);
    const {blob} = await capturePng(tabId, box);
    return {blob, via: 'screenshot', note: 'Saved as a screenshot of the element, because its image could not be read directly. It has the size shown on screen and anything drawn over it.'};
}

async function acquire(a: any): Promise<Source> {
    if ([a.dataUrl, a.url, a.selector, a.screenshot || undefined].filter(value => value !== undefined).length === 0
        || (a.url && (a.selector || a.dataUrl))) {
        throw new Error('Name one source: url, selector, attachment or screenshot (screenshot can take a selector to crop to).');
    }
    if (a.dataUrl) return {blob: await dataUrlToBlob(a.dataUrl), via: 'data'};
    if (a.url) return fetchImage(a.url, a.tabId);
    if (a.tabId === undefined) throw new Error('This needs a page to read from.');
    if (a.screenshot) {
        if (a.selector) return {...await captureElement(a.tabId, a.selector, a.index), note: undefined};
        return {blob: (await capturePng(a.tabId)).blob, via: 'screenshot'};
    }
    const read = await execute(a.tabId, readImageInPage, [{selector: a.selector, index: a.index, maxBytes: MAX_SOURCE_BYTES}]);
    if ('error' in read && read.error) throw new Error(read.error);
    if ('dataUrl' in read && read.dataUrl) return {blob: await dataUrlToBlob(read.dataUrl), via: 'page'};
    if ('src' in read && read.src) {
        try { return await fetchImage(read.src, a.tabId); }
        catch { return captureElement(a.tabId, a.selector, a.index); }
    }
    return captureElement(a.tabId, a.selector, a.index);
}

/** Saved scripts that ask for an image by this name, so a delete or rename can say what it breaks. */
async function scriptsUsing(name: string) {
    const scripts = await loadScripts();
    return scripts.filter(script => referencedImageNames(script.code).includes(name)).map(script => script.name);
}

const previewOutput = (preview: {dataUrl: string; width: number; height: number} | null) =>
    preview ? {screenshot: preview.dataUrl, metadata: {imagePixels: {width: preview.width, height: preview.height}}} : {};

/** How scripts ask for it, so the agent doesn't have to look it up. */
const usageHint = (name: string) => `In scripts: const image = await MH_getImage(${JSON.stringify(name)}); gives dataUrl, blob, objectUrl(), bitmap() and file().`;

async function requireImage(name: string) {
    const image = await readImage(name);
    if (!image) throw new Error(`There's no image named "${normalizeImageName(name)}". List the library to see what's there.`);
    return image;
}

async function asPng(blob: Blob) {
    if (blob.type === 'image/svg+xml') throw new Error("An SVG can't be copied as a picture.");
    return (await prepareImage(blob, {format: 'png'})).blob;
}

type Clipboard = (action: string, text?: string, dataUrl?: string) => Promise<any>;

export async function runImageAction(a: any, clipboard: Clipboard): Promise<unknown> {
    const requireName = () => {
        if (!a.name) throw new Error('name is required for this action');
        return a.name as string;
    };
    switch (a.action as string) {
        case 'list': {
            const images = await listImages();
            return {images, count: images.length, totalBytes: images.reduce((sum, image) => sum + image.size, 0)};
        }
        case 'save': {
            const name = normalizeImageName(requireName());
            if (!a.replace && await readImage(name)) throw new Error(`An image named "${name}" already exists. Pick another name, or pass replace: true to overwrite it.`);
            const {blob, via, source, note} = await acquire(a);
            const prepared = await prepareImage(blob, {maxSize: a.maxSize, format: a.format});
            if (prepared.blob.size > MAX_IMAGE_BYTES) {
                throw new Error(`That image is ${(prepared.blob.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit. Save it smaller with maxSize.`);
            }
            const saved = await writeImage({...prepared, name, description: a.description, source}, {replace: a.replace});
            return {ok: true, image: saved, via, ...(note ? {note} : {}), hint: usageHint(name),
                ...previewOutput(await imagePreview(prepared.blob, SAVE_PREVIEW).catch(() => null))};
        }
        case 'view': {
            const {blob, ...image} = await requireImage(requireName());
            const preview = await imagePreview(blob, VIEW_PREVIEW);
            return {image, ...(preview ? previewOutput(preview) : {svg: (await blob.text()).slice(0, 4000)})};
        }
        case 'delete': {
            const name = normalizeImageName(requireName());
            const usedBy = await scriptsUsing(name);
            if (!await deleteImage(name)) throw new Error(`There's no image named "${name}".`);
            return {ok: true, deleted: name, ...(usedBy.length ? {note: 'These saved scripts ask for it by name and will now get null.', usedBy} : {})};
        }
        case 'rename': {
            if (!a.newName) throw new Error('newName is required for this action');
            const from = normalizeImageName(requireName());
            const usedBy = await scriptsUsing(from);
            const name = await renameImage(from, a.newName);
            return {ok: true, name, ...(usedBy.length ? {note: `These saved scripts still ask for "${from}" and will get null until they are updated.`, usedBy} : {})};
        }
        case 'upload': {
            if (a.tabId === undefined) throw new Error('This needs a page to put the image on.');
            const {blob, ...image} = await requireImage(requireName());
            const filename = imageFileName(image);
            const placed = await execute(a.tabId, putImageInPage, [{selector: a.selector, index: a.index, method: a.method, base64: await blobToBase64(blob), mimeType: image.mimeType, filename}]);
            if ('error' in placed && placed.error) throw new Error(placed.error);
            const ignored = 'pageResponded' in placed && placed.pageResponded === false;
            return {ok: true, name: image.name, filename, ...placed, hint: ignored
                ? "The page gave no sign of taking the file, though some don't. Check the page; if it isn't there, try another method or the page's own file field."
                : 'Check the page to confirm it took the file.'};
        }
        case 'copy': {
            const {blob, name} = await requireImage(requireName());
            const png = await asPng(blob);
            const result = await clipboard('writeImage', undefined, `data:image/png;base64,${await blobToBase64(png)}`);
            if (!result || result.error) throw new Error(result?.error ?? 'Clipboard document did not respond');
            return {ok: true, copied: name};
        }
        default:
            throw new Error(`Unknown image action ${a.action}`);
    }
}
