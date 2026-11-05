// Images kept in the browser under a name, for scripts and pages to reuse on any site.
// IndexedDB rather than chrome.storage: storage listeners get old and new values, so large
// values there are what crashed Chrome before (docs/chat-storage.md). Its own database, so
// its upgrades never wait on an open chat panel.

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** What a source may be before maxSize shrinks it to fit. */
export const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const CHANGES_CHANNEL = 'ts-image-library';

export interface LibraryImage {
    name: string;
    mimeType: string;
    size: number;
    /** Absent when the file doesn't say, as with an SVG with no size. */
    width?: number;
    height?: number;
    description?: string;
    /** Where it came from, without a query string: signed URLs carry secrets. */
    source?: string;
    createdAt: number;
    updatedAt: number;
}
interface StoredImage extends LibraryImage {blob: Blob}
/** What a script receives: bytes as base64, since extension messages are JSON. */
interface ImageForScript extends LibraryImage {base64: string}

/** Names are what scripts type, so they stay readable: `My Cursor` is `my-cursor`. */
export function normalizeImageName(raw: string): string {
    const name = String(raw).trim().toLowerCase().replace(/\s+/g, '-');
    if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(name)) {
        throw new Error(`"${raw}" can't be an image name. Use up to 80 letters, numbers, dots, dashes or underscores.`);
    }
    return name;
}

/** A free name from a file's name: `Holiday Photo (1).PNG` is `holiday-photo-1`, or `holiday-photo-1-2` if that's taken. */
export function imageNameFromFile(fileName: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    const stem = fileName.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^[-._]+|[-._]+$/g, '').slice(0, 70) || 'image';
    let name = stem;
    for (let i = 2; used.has(name); i++) name = `${stem}-${i}`;
    return name;
}

/** The file name to hand an image out under, with the extension its type calls for. */
export function imageFileName(image: {name: string; mimeType: string}): string {
    const extension = image.mimeType.split('/')[1].replace('svg+xml', 'svg').replace('jpeg', 'jpg').replace('x-icon', 'ico');
    return image.name.endsWith(`.${extension}`) ? image.name : `${image.name}.${extension}`;
}

// ── Reading image files ─────────────────────────────────────

const startsWith = (bytes: Uint8Array, signature: number[], at = 0) => signature.every((value, i) => bytes[at + i] === value);
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));

/** The file's real type, from its first bytes. Servers mislabel images often enough not to trust them. */
export function sniffImageType(bytes: Uint8Array): string | null {
    if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
    if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
    if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
    if (ascii(bytes, 4, 8) === 'ftyp' && /^avi[fs]$/.test(ascii(bytes, 8, 12))) return 'image/avif';
    if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';
    if (startsWith(bytes, [0, 0, 1, 0])) return 'image/x-icon';
    const text = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^﻿/, '');
    if (/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype[^>]*>\s*)?<svg[\s>]/i.test(text)) return 'image/svg+xml';
    return null;
}

/** An SVG's size from its opening tag, since a worker can't decode one. */
export function svgDimensions(text: string): {width?: number; height?: number} {
    const tag = text.match(/<svg\b[^>]*>/i)?.[0] ?? '';
    const pixels = (attribute: string) => {
        const match = tag.match(new RegExp(`\\s${attribute}\\s*=\\s*["']\\s*([\\d.]+)\\s*(?:px)?\\s*["']`, 'i'));
        return match ? Math.round(Number(match[1])) || undefined : undefined;
    };
    const box = tag.match(/\sviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    return {width: pixels('width') ?? (box ? Math.round(Number(box[1])) || undefined : undefined),
        height: pixels('height') ?? (box ? Math.round(Number(box[2])) || undefined : undefined)};
}

interface ImageOptions {
    /** Longest side in pixels; smaller images are left as they are. */
    maxSize?: number;
    format?: 'png' | 'jpeg' | 'webp';
}

/** Checks that the bytes are an image, and resizes or converts it if asked. */
export async function prepareImage(source: Blob, options: ImageOptions = {}): Promise<{blob: Blob; mimeType: string; width?: number; height?: number}> {
    if (source.size > MAX_SOURCE_BYTES) throw new Error(`That image is over ${MAX_SOURCE_BYTES / 1024 / 1024} MB.`);
    const mimeType = sniffImageType(new Uint8Array(await source.slice(0, 2048).arrayBuffer()));
    if (!mimeType) throw new Error("That file isn't an image TamperSloth can read.");
    if (mimeType === 'image/svg+xml') {
        if (options.maxSize || options.format) throw new Error("An SVG can't be resized or converted here. Save it without maxSize and format.");
        return {blob: source.slice(0, source.size, mimeType), mimeType, ...svgDimensions(await source.text())};
    }
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(source);
    } catch {
        throw new Error('That image is damaged or in a format Chrome can\'t read.');
    }
    try {
        const {width, height} = bitmap;
        const scale = options.maxSize ? Math.min(1, options.maxSize / Math.max(width, height)) : 1;
        const targetType = options.format ? `image/${options.format}` : mimeType;
        if (scale === 1 && targetType === mimeType) return {blob: source.slice(0, source.size, mimeType), mimeType, width, height};
        // Canvases can only write these three; a resized GIF or icon keeps its transparency as PNG.
        const outputType = ['image/png', 'image/jpeg', 'image/webp'].includes(targetType) ? targetType : 'image/png';
        const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
        const context = canvas.getContext('2d')!;
        // JPEG has no transparency, and would turn it black.
        if (outputType === 'image/jpeg') { context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); }
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await canvas.convertToBlob({type: outputType, quality: 0.92});
        return {blob, mimeType: outputType, width: canvas.width, height: canvas.height};
    } finally {
        bitmap.close();
    }
}

export async function blobToBase64(blob: Blob): Promise<string> {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
}

function base64ToBlob(base64: string, mimeType: string): Blob {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], {type: mimeType});
}

/** A small PNG for the model to check what was saved, or null for an SVG, which a worker can't draw. */
export async function imagePreview(blob: Blob, longestSide: number): Promise<{dataUrl: string; width: number; height: number} | null> {
    if (blob.type === 'image/svg+xml') return null;
    const small = await prepareImage(blob, {maxSize: longestSide, format: 'png'});
    return {dataUrl: `data:image/png;base64,${await blobToBase64(small.blob)}`, width: small.width!, height: small.height!};
}

// ── Storage ─────────────────────────────────────────────────

let database: Promise<IDBDatabase> | undefined;

function openDatabase() {
    if (!database) {
        database = new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('tampersloth-images', 1);
            request.onupgradeneeded = () => { request.result.createObjectStore('images', {keyPath: 'name'}); };
            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => { db.close(); database = undefined; };
                resolve(db);
            };
            request.onerror = () => reject(request.error ?? new Error('Could not open the image library'));
        }).catch(error => { database = undefined; throw error; });
    }
    return database;
}

/** `fail` undoes the transaction and rejects with that error, so a write can check something first in the same transaction. */
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, finish: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
    const db = await openDatabase();
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction('images', mode);
        let result: T;
        let failure: Error | undefined;
        transaction.oncomplete = () => resolve(result);
        transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Could not use the image library'));
        transaction.onerror = () => reject(failure ?? transaction.error ?? new Error('Could not use the image library'));
        const fail = (error: Error) => { failure = error; transaction.abort(); };
        try { work(transaction.objectStore('images'), value => { result = value; }, fail); }
        catch (error) { fail(error as Error); }
    });
}

/** Lets an open library page show what the agent just saved. */
function announceChange() {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANGES_CHANNEL);
    channel.postMessage('changed');
    channel.close();
}

export function subscribeToImages(listener: () => void): () => void {
    if (typeof BroadcastChannel === 'undefined') return () => {};
    const channel = new BroadcastChannel(CHANGES_CHANNEL);
    channel.onmessage = listener;
    return () => channel.close();
}

const withoutBytes = ({blob: _blob, ...image}: StoredImage): LibraryImage => image;

export async function listImages(): Promise<LibraryImage[]> {
    const images = await transact<StoredImage[]>('readonly', (store, finish) => {
        store.getAll().onsuccess = event => finish((event.target as IDBRequest<StoredImage[]>).result);
    });
    return images.map(withoutBytes).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function readImage(name: string): Promise<StoredImage | null> {
    const record = await transact<StoredImage | undefined>('readonly', (store, finish) => {
        store.get(normalizeImageName(name)).onsuccess = event => finish((event.target as IDBRequest<StoredImage | undefined>).result);
    });
    return record ?? null;
}

/** The answer to a script asking for an image. A name that can't exist is just a missing image. */
export async function imageForScript(name: unknown): Promise<ImageForScript | null> {
    let record: StoredImage | null;
    try { record = await readImage(String(name)); }
    catch { return null; }
    return record ? {...withoutBytes(record), base64: await blobToBase64(record.blob)} : null;
}

interface NewImage {
    name: string;
    blob: Blob;
    mimeType: string;
    width?: number;
    height?: number;
    description?: string;
    source?: string;
}

const ALREADY_EXISTS = (name: string) => new Error(`An image named "${name}" already exists. Pick another name, or replace it.`);

/** Checked in the same transaction as the write, so two saves can't both think a name is free. */
export async function writeImage(image: NewImage, options: {replace?: boolean} = {}): Promise<LibraryImage & {replaced: boolean}> {
    if (image.blob.size > MAX_IMAGE_BYTES) {
        throw new Error(`That image is ${(image.blob.size / 1024 / 1024).toFixed(1)} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit. Save it smaller with maxSize.`);
    }
    const name = normalizeImageName(image.name);
    const now = Date.now();
    const saved = await transact<LibraryImage & {replaced: boolean}>('readwrite', (store, finish, fail) => {
        store.get(name).onsuccess = event => {
            const previous = (event.target as IDBRequest<StoredImage | undefined>).result;
            if (previous && !options.replace) return fail(ALREADY_EXISTS(name));
            const record: StoredImage = {name, blob: image.blob, mimeType: image.mimeType, size: image.blob.size,
                ...(image.width ? {width: image.width} : {}), ...(image.height ? {height: image.height} : {}),
                ...(image.description ? {description: image.description} : {}), ...(image.source ? {source: image.source} : {}),
                createdAt: previous?.createdAt ?? now, updatedAt: now};
            store.put(record);
            finish({...withoutBytes(record), replaced: !!previous});
        };
    });
    announceChange();
    return saved;
}

export async function deleteImage(name: string): Promise<boolean> {
    const deleted = await transact<boolean>('readwrite', (store, finish) => {
        const key = normalizeImageName(name);
        store.getKey(key).onsuccess = event => {
            const found = (event.target as IDBRequest).result !== undefined;
            if (found) store.delete(key);
            finish(found);
        };
    });
    if (deleted) announceChange();
    return deleted;
}

export async function renameImage(name: string, newName: string): Promise<string> {
    const from = normalizeImageName(name), to = normalizeImageName(newName);
    if (from === to) return to;
    await transact<void>('readwrite', (store, _finish, fail) => {
        store.get(from).onsuccess = event => {
            const record = (event.target as IDBRequest<StoredImage | undefined>).result;
            if (!record) return fail(new Error(`There's no image named "${from}".`));
            store.getKey(to).onsuccess = taken => {
                if ((taken.target as IDBRequest).result !== undefined) return fail(ALREADY_EXISTS(to));
                store.delete(from);
                store.put({...record, name: to, updatedAt: Date.now()});
            };
        };
    });
    announceChange();
    return to;
}

// ── Scripts and backups ─────────────────────────────────────

/** Names a script's code asks for literally, so its export can bring those images along. */
export function referencedImageNames(code: string): string[] {
    const names = new Set<string>();
    for (const match of code.matchAll(/\b(?:MH_getImage|GM_getImage|GM\.getImage)\(\s*(['"`])([^'"`\n]+)\1\s*\)/g)) {
        try { names.add(normalizeImageName(match[2])); } catch { /* a name that can't exist */ }
    }
    return [...names];
}

interface ExportedImage extends LibraryImage {dataUrl: string}

export async function exportImages(names?: string[]): Promise<ExportedImage[]> {
    const wanted = names ?? (await listImages()).map(image => image.name);
    const records = await Promise.all(wanted.map(name => readImage(name)));
    return Promise.all(records.filter((record): record is StoredImage => !!record).map(async record =>
        ({...withoutBytes(record), dataUrl: `data:${record.mimeType};base64,${await blobToBase64(record.blob)}`})));
}

/** Adds exported images. An image already here is kept: a backup never overwrites what the user has now. */
export async function importImages(items: unknown): Promise<{added: string[]; kept: string[]; failed: string[]}> {
    const result = {added: [] as string[], kept: [] as string[], failed: [] as string[]};
    for (const item of Array.isArray(items) ? items : []) {
        const label = String(item?.name ?? 'an image');
        try {
            const data = String(item.dataUrl).match(/^data:[^,;]*;base64,(.+)$/s);
            if (!data) throw new Error('No image data');
            const name = normalizeImageName(item.name);
            if (await readImage(name)) { result.kept.push(name); continue; }
            const prepared = await prepareImage(base64ToBlob(data[1], ''));
            await writeImage({...prepared, name, description: typeof item.description === 'string' ? item.description : undefined,
                source: typeof item.source === 'string' ? item.source : undefined});
            result.added.push(name);
        } catch {
            result.failed.push(label);
        }
    }
    return result;
}
