import {loadScripts, saveScript} from "../chat/lib/storage";
import type {BackgroundScript, ImportedUserscript} from "../chat/lib/types";
import {parseUserscript, readIntegrity, type ParsedUserscript} from "./userscript";

/** A parsed userscript with its remote code fetched, ready for the user to review. */
export interface UserscriptDraft {
    source: string;
    sourceUrl: string;
    parsed: ParsedUserscript;
    requires: ImportedUserscript["requires"];
    resources: ImportedUserscript["resources"];
    warnings: string[];
    /** The installed script this would replace: same @name and @namespace. */
    existing: BackgroundScript | null;
}

const MAX_FETCH_BYTES = 10 * 1024 * 1024;

/** Session hand-off from the gallery's file picker to the install tab. */
export const PENDING_USERSCRIPT_KEY = "ts_pending_userscript";

async function fetchBytes(url: string): Promise<{bytes: Uint8Array<ArrayBuffer>; type: string}> {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error(`Only http and https addresses can be fetched: ${url}`);
    const res = await fetch(parsed.href.split("#")[0], {credentials: "omit", cache: "no-cache"});
    if (!res.ok) throw new Error(`${url} answered ${res.status} ${res.statusText}`.trim());
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_FETCH_BYTES) throw new Error(`${url} is larger than 10 MB.`);
    return {bytes: new Uint8Array(buffer), type: res.headers.get("content-type") ?? ""};
}

export async function fetchUserscriptSource(url: string): Promise<string> {
    const {bytes} = await fetchBytes(url);
    return new TextDecoder().decode(bytes);
}

export function toBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

const SUBTLE_ALGORITHMS: Record<string, string> = {sha1: "SHA-1", sha256: "SHA-256", sha384: "SHA-384", sha512: "SHA-512"};

/** Checks any `#sha256=…` style hash on the URL; returns a warning for hashes it can't check. */
async function verifyIntegrity(url: string, bytes: Uint8Array<ArrayBuffer>): Promise<string | null> {
    const hashes = readIntegrity(url);
    const checkable = hashes.filter((h) => SUBTLE_ALGORITHMS[h.algorithm]);
    for (const {algorithm, value} of checkable) {
        const digest = new Uint8Array(await crypto.subtle.digest(SUBTLE_ALGORITHMS[algorithm], bytes));
        const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
        if (value.toLowerCase() !== hex && value !== toBase64(digest)) {
            throw new Error(`${url.split("#")[0]} doesn't match its ${algorithm} hash; it may have changed since the script was written.`);
        }
    }
    if (hashes.length && !checkable.length) return `The ${hashes.map((h) => h.algorithm).join("/")} hash on ${url.split("#")[0]} couldn't be checked.`;
    return null;
}

const MIME_BY_EXTENSION: Record<string, string> = {
    css: "text/css", js: "text/javascript", json: "application/json", html: "text/html", txt: "text/plain",
    svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

function mimeTypeFor(url: string, header: string): string {
    const fromHeader = header.split(";")[0].trim();
    if (fromHeader && fromHeader !== "application/octet-stream") return fromHeader;
    const ext = new URL(url).pathname.split(".").pop()?.toLowerCase() ?? "";
    return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

function resolveUrl(url: string, base: string): string {
    try {
        return new URL(url, base || undefined).href;
    } catch {
        throw new Error(`"${url}" is a relative address, and the script wasn't installed from a URL to resolve it against.`);
    }
}

/** Parses the source and fetches its @require and @resource files. Throws with a readable message. */
export async function prepareUserscript(source: string, sourceUrl = ""): Promise<UserscriptDraft> {
    const parsed = parseUserscript(source);
    const warnings = [...parsed.warnings];

    const requires = await Promise.all(parsed.requires.map(async (raw) => {
        const url = resolveUrl(raw, sourceUrl);
        const {bytes} = await fetchBytes(url);
        const warning = await verifyIntegrity(url, bytes);
        if (warning) warnings.push(warning);
        return {url, code: new TextDecoder().decode(bytes)};
    }));

    const resources = await Promise.all(parsed.resources.map(async ({name, url: raw}) => {
        const url = resolveUrl(raw, sourceUrl);
        const {bytes, type} = await fetchBytes(url);
        const warning = await verifyIntegrity(url, bytes);
        if (warning) warnings.push(warning);
        return {name, url, mimeType: mimeTypeFor(url, type), data: toBase64(bytes)};
    }));

    const existing = (await loadScripts()).find((s) =>
        s.userscript && s.name === parsed.name && s.userscript.namespace === parsed.namespace) ?? null;

    return {source, sourceUrl, parsed, requires, resources, warnings, existing};
}

/** Saves the draft, replacing the script it updates (keeping its id, values and paused state). */
export async function installUserscript(draft: UserscriptDraft, status?: BackgroundScript["status"]): Promise<BackgroundScript> {
    const {parsed} = draft;
    const script: BackgroundScript = {
        id: draft.existing?.id ?? crypto.randomUUID(),
        conversationId: draft.existing?.conversationId ?? "",
        name: parsed.name,
        description: parsed.description,
        code: draft.source,
        urlMatchPattern: parsed.matches[0] ?? parsed.includes[0] ?? "",
        status: status ?? draft.existing?.status ?? "active",
        runAt: parsed.runAt,
        userscript: {
            namespace: parsed.namespace,
            version: parsed.version,
            author: parsed.author,
            homepage: parsed.homepage,
            matches: parsed.matches,
            includes: parsed.includes,
            excludeMatches: parsed.excludeMatches,
            excludes: parsed.excludes,
            allFrames: parsed.allFrames,
            world: parsed.world,
            grants: parsed.grants,
            connects: parsed.connects,
            requires: draft.requires,
            resources: draft.resources,
            updateURL: parsed.updateURL,
            downloadURL: parsed.downloadURL,
            sourceUrl: draft.sourceUrl || draft.existing?.userscript?.sourceUrl || "",
            installedAt: Date.now(),
            contextMenu: parsed.contextMenu,
            connectAllowed: draft.existing?.userscript?.connectAllowed,
            connectBlocked: draft.existing?.userscript?.connectBlocked,
        },
    };
    await saveScript(script);
    return script;
}

/** Opens the install page in its own tab, optionally fetching from a URL. */
export function openInstallPage(url?: string): void {
    const query = url ? `?url=${encodeURIComponent(url)}` : "";
    void chrome.tabs.create({url: chrome.runtime.getURL(`index.html#/install${query}`)});
}
