import type {BackgroundScript} from "./types";

/**
 * Tampermonkey-style userscript metadata, read from the `==UserScript==` block.
 * Pure and dependency-free: the install page, the background and the tests share it.
 */
export interface ParsedUserscript {
    name: string;
    description: string;
    namespace: string;
    version: string;
    author: string;
    homepage: string;
    icon: string;
    /** Valid Chrome match patterns from @match. */
    matches: string[];
    /** @include values (globs or /regex/ literals), plus any @match Chrome can't take. */
    includes: string[];
    excludeMatches: string[];
    /** @exclude values: globs or /regex/ literals. */
    excludes: string[];
    runAt: BackgroundScript["runAt"];
    /** `@run-at context-menu`: runs only when picked from the right-click menu. */
    contextMenu: boolean;
    allFrames: boolean;
    /** MAIN with GM grants means page access plus GM functions, through a relay (see needsGmRelay). */
    world: "USER_SCRIPT" | "MAIN";
    /** As written, or detected from the code when the script has no @grant lines. */
    grants: string[];
    grantsDetected: boolean;
    requires: string[];
    resources: {name: string; url: string}[];
    connects: string[];
    updateURL: string;
    downloadURL: string;
    warnings: string[];
}

const META_BLOCK_RE = /\/\/[ \t]*==UserScript==[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*\/\/[ \t]*==\/UserScript==/;
const META_LINE_RE = /^[ \t]*\/\/[ \t]*@([\w.:-]+)(?:[ \t]+(.*?))?[ \t]*$/;

export function hasUserscriptHeader(source: string): boolean {
    return META_BLOCK_RE.test(source);
}

/** Every `@key value` pair in order; localized keys like `name:fr` are kept as written. */
export function readMetaBlock(source: string): [string, string][] {
    const block = source.match(META_BLOCK_RE);
    if (!block) return [];
    const entries: [string, string][] = [];
    for (const line of block[1].split(/\r?\n/)) {
        const m = line.match(META_LINE_RE);
        if (m) entries.push([m[1], (m[2] ?? "").trim()]);
    }
    return entries;
}

/**
 * Tampermonkey accepts looser @match values than Chrome (`http*://`, a missing
 * path, a bare `*`). Returns the Chrome form, or null when Chrome can't express it.
 */
export function normalizeMatchPattern(raw: string): string | null {
    let p = raw.trim();
    if (p === "<all_urls>") return p;
    if (p === "*" || p === "*://*") return "*://*/*";
    p = p.replace(/^http\*:\/\//i, "*://");
    const m = p.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)?$/i);
    if (!m) return null;
    const scheme = m[1].toLowerCase();
    const host = m[2];
    const path = m[3] ?? "/*";
    if (scheme === "file") return host === "" ? `file://${path}` : null;
    if (!host) return null;
    if (host !== "*" && host.includes("*") && !/^\*\.[^*]+$/.test(host)) return null;
    if (/\.tld(?::\d+)?$/i.test(host)) return null;
    return `${scheme}://${host}${path}`;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `[source, flags]` for a RegExp; kept as strings so it can be embedded in injected code. */
type RegExpParts = [string, string];

/** An @include/@exclude value: a `/regex/flags` literal or a Tampermonkey glob. */
export function includeToRegExp(value: string): RegExpParts {
    const literal = value.match(/^\/(.+)\/([a-z]*)$/i);
    if (literal) return [literal[1], literal[2].replace(/[gy]/g, "")];
    if (value === "*") return ["^.*$", ""];
    // `*` spans anything, including slashes; `.tld` stands for any top-level domain.
    const source = value
        .split("*")
        .map((part) => escapeRegExp(part).replace(/\\\.tld(?=\/|:|$)/gi, "\\.(?:[a-z]{2,}(?:\\.[a-z]{2,})?)"))
        .join(".*");
    return [`^${source}$`, "i"];
}

/** A Chrome match pattern as a RegExp, for scripts whose @include forces a URL check at load time. */
export function matchPatternToRegExp(pattern: string): RegExpParts {
    if (pattern === "<all_urls>") return ["^(?:https?|file|ftp)://", ""];
    const m = pattern.match(/^(\*|https?|file|ftp):\/\/([^/]*)(\/.*)$/);
    if (!m) return ["(?!)", ""];
    const [, scheme, host, path] = m;
    const schemeRe = scheme === "*" ? "https?" : escapeRegExp(scheme);
    let hostRe: string;
    if (host === "*") hostRe = "[^/]*";
    else if (host.startsWith("*.")) hostRe = `(?:[^/]*\\.)?${escapeRegExp(host.slice(2))}(?::\\d+)?`;
    else hostRe = `${escapeRegExp(host)}${host.includes(":") ? "" : "(?::\\d+)?"}`;
    const pathRe = path.split("*").map(escapeRegExp).join(".*");
    return [`^${schemeRe}://${hostRe}${pathRe}$`, "i"];
}

/**
 * What the injected code must check itself. Chrome ANDs `matches` with
 * `includeGlobs`, but Tampermonkey ORs @match with @include, so any @include
 * means registering broadly and testing every URL rule at load time.
 */
export function runtimeUrlFilter(us: {matches: string[]; includes: string[]; excludes: string[]}): {
    include: RegExpParts[] | null;
    exclude: RegExpParts[];
} {
    return {
        include: us.includes.length ? [...us.matches.map(matchPatternToRegExp), ...us.includes.map(includeToRegExp)] : null,
        exclude: us.excludes.map(includeToRegExp),
    };
}

/** Whether the script's URL rules cover a page, for what Chrome doesn't check itself (right-click scripts). */
export function urlCovered(us: {matches: string[]; includes: string[]; excludeMatches: string[]; excludes: string[]}, url: string): boolean {
    const test = ([source, flags]: RegExpParts) => new RegExp(source, flags).test(url);
    return [...us.matches.map(matchPatternToRegExp), ...us.includes.map(includeToRegExp)].some(test)
        && ![...us.excludeMatches.map(matchPatternToRegExp), ...us.excludes.map(includeToRegExp)].some(test);
}

/** The match patterns the script is registered with; empty means it runs nowhere. */
export function registrationMatches(us: {matches: string[]; includes: string[]}): string[] {
    if (us.includes.length) return ["*://*/*"];
    return us.matches;
}

const GM_USE_RE = /\bGM(?:_[A-Za-z]+|\.[A-Za-z]+)\b/g;

/** GM APIs and unsafeWindow the code mentions, for scripts without @grant lines. */
function detectGrants(code: string): string[] {
    const found = new Set(code.match(GM_USE_RE) ?? []);
    found.delete("GM_info");
    found.delete("GM.info");
    if (/\bunsafeWindow\b/.test(code)) found.add("unsafeWindow");
    return [...found].sort();
}

/** `GM_xmlhttpRequest` and `GM.xmlHttpRequest` both become `xmlhttprequest`. */
export const grantKey = (grant: string) => grant.replace(/^GM[_.]/, "").toLowerCase();

const isGmGrant = (grant: string) => /^GM[_.]/.test(grant) && grantKey(grant) !== "info";

/** A page-world script with GM grants can't message the extension itself; a relay in its own world does. */
export const needsGmRelay = (us: {world: string; grants: string[]}) => us.world === "MAIN" && us.grants.some(isGmGrant);

const UNSUPPORTED_GRANTS: Record<string, string> = {
    // Manifest V3 extensions can't block or redirect requests from a listener.
    webrequest: "GM_webRequest can't work in Manifest V3 extensions; calls to it will fail.",
};

const RUN_AT: Record<string, BackgroundScript["runAt"]> = {
    "document-start": "document_start",
    "document-body": "document_end",
    "document-end": "document_end",
    "document-idle": "document_idle",
};

export function parseUserscript(source: string): ParsedUserscript {
    const entries = readMetaBlock(source);
    if (!entries.length) throw new Error("This doesn't look like a userscript: there's no ==UserScript== header.");

    const all = (key: string) => entries.filter(([k]) => k === key).map(([, v]) => v).filter(Boolean);
    const first = (...keys: string[]) => keys.map((k) => all(k)[0]).find(Boolean) ?? "";

    const name = first("name");
    if (!name) throw new Error("The userscript header has no @name.");

    const warnings: string[] = [];
    const matches: string[] = [];
    const includes = [...all("include")];
    for (const raw of all("match")) {
        const normalized = normalizeMatchPattern(raw);
        if (normalized) matches.push(normalized);
        else {
            includes.push(raw);
            warnings.push(`"${raw}" isn't a pattern Chrome accepts, so it's checked as a wildcard when each page loads.`);
        }
    }
    const excludeMatches: string[] = [];
    const excludes = [...all("exclude")];
    for (const raw of all("exclude-match")) {
        const normalized = normalizeMatchPattern(raw);
        if (normalized) excludeMatches.push(normalized);
        else excludes.push(raw);
    }
    if (!matches.length && !includes.length) warnings.push("It has no @match or @include, so it won't run on any page.");

    const runAtRaw = first("run-at").toLowerCase();
    const runAt = RUN_AT[runAtRaw] ?? "document_idle";
    const contextMenu = runAtRaw === "context-menu";

    const written = all("grant");
    const grantsDetected = written.length === 0;
    const grants = grantsDetected ? detectGrants(source) : [...new Set(written)];
    if (grantsDetected && grants.length) {
        warnings.push(`It has no @grant lines; these were detected in the code: ${grants.join(", ")}.`);
    }

    const needsGm = grants.some(isGmGrant);
    const injectInto = first("inject-into").toLowerCase();
    const sandbox = first("sandbox").toLowerCase();
    const isolated = injectInto === "content" || sandbox === "dom";
    const usesPage = grants.includes("unsafeWindow") || /\bunsafeWindow\b/.test(source)
        || injectInto === "page" || sandbox === "raw" || sandbox === "javascript";
    const world: ParsedUserscript["world"] = isolated || (needsGm && !usesPage) ? "USER_SCRIPT" : "MAIN";
    if (needsGm && world === "MAIN") {
        warnings.push("It runs inside the page so it can reach the page's own JavaScript. That also means a hostile page on these sites could try to use its GM functions.");
    }
    if (isolated && usesPage) {
        warnings.push("It asks to stay isolated but uses unsafeWindow, which here is its own window rather than the page's.");
    }

    const unsupported = new Set(grants.map((g) => UNSUPPORTED_GRANTS[grantKey(g)]).filter(Boolean));
    warnings.push(...unsupported);

    const connects = all("connect");
    if (grants.some((g) => grantKey(g) === "xmlhttprequest") && !connects.length) {
        warnings.push("It makes network requests but lists no @connect sites, so you'll be asked the first time it contacts another site.");
    }

    const resources = all("resource").flatMap((value) => {
        const m = value.match(/^(\S+)\s+(\S+)$/);
        return m ? [{name: m[1], url: m[2]}] : [];
    });

    return {
        name,
        description: first("description"),
        namespace: first("namespace"),
        version: first("version"),
        author: first("author"),
        homepage: first("homepage", "homepageURL", "website", "source"),
        icon: first("icon", "iconURL", "defaulticon"),
        matches: [...new Set(matches)],
        includes: [...new Set(includes)],
        excludeMatches: [...new Set(excludeMatches)],
        excludes: [...new Set(excludes)],
        runAt,
        contextMenu,
        allFrames: !entries.some(([k]) => k === "noframes"),
        world,
        grants,
        grantsDetected,
        requires: all("require"),
        resources,
        connects,
        updateURL: first("updateURL"),
        downloadURL: first("downloadURL", "installURL"),
        warnings,
    };
}

/** Whether `@connect` lets a script's GM_xmlhttpRequest reach `target` from `pageUrl`. */
export function connectAllowed(target: string, connects: string[], pageUrl?: string): boolean {
    let host: string, pageHost = "";
    try {
        host = new URL(target).hostname.toLowerCase();
        if (pageUrl) pageHost = new URL(pageUrl).hostname.toLowerCase();
    } catch {
        return false;
    }
    if (host === pageHost) return true;
    return connects.some((raw) => {
        const c = raw.trim().toLowerCase();
        if (c === "*") return true;
        if (c === "self") return host === pageHost;
        return host === c || host.endsWith(`.${c}`);
    });
}

/** Subresource hashes from a URL fragment like `#sha256=…` or `#md5=…,sha256-…`. */
export function readIntegrity(url: string): {algorithm: string; value: string}[] {
    const hash = url.split("#")[1];
    if (!hash) return [];
    return hash.split(/[,;]/).flatMap((part) => {
        const m = part.trim().match(/^(md5|sha1|sha256|sha384|sha512)[=-](.+)$/i);
        return m ? [{algorithm: m[1].toLowerCase(), value: m[2]}] : [];
    });
}

/** Whether a new version asks for something the installed one didn't have, so updating needs the user's say. */
export function permissionsGrew(
    installed: {grants: string[]; connects: string[]; matches: string[]; includes: string[]; world: string},
    next: {grants: string[]; connects: string[]; matches: string[]; includes: string[]; world: string},
): boolean {
    const grew = (before: string[], after: string[]) => after.some((v) => !before.includes(v));
    return grew(installed.grants.map(grantKey), next.grants.map(grantKey))
        || grew(installed.connects, next.connects)
        || grew(installed.matches, next.matches)
        || grew(installed.includes, next.includes)
        || (installed.world !== "MAIN" && next.world === "MAIN");
}

/** -1, 0 or 1, comparing dotted versions the way userscript managers do (numeric parts first). */
export function compareVersions(a: string, b: string): number {
    const pa = a.split(/[.-]/), pb = b.split(/[.-]/);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? "0", y = pb[i] ?? "0";
        const nx = Number(x), ny = Number(y);
        const diff = !Number.isNaN(nx) && !Number.isNaN(ny) ? nx - ny : x.localeCompare(y);
        if (diff) return diff > 0 ? 1 : -1;
    }
    return 0;
}

/** Every site rule a saved script declares, for lists and labels. */
export function scriptTargets(script: BackgroundScript): string[] {
    if (!script.userscript) return script.urlMatchPattern ? [script.urlMatchPattern] : [];
    return [...script.userscript.matches, ...script.userscript.includes];
}

/** Patterns whose open tabs should reload after a change; @include-only scripts wait for the next load. */
export function scriptReloadPatterns(script: BackgroundScript): string[] {
    if (!script.userscript) return script.urlMatchPattern ? [script.urlMatchPattern] : [];
    return script.userscript.matches;
}

/** A short "where it runs" label for a gallery row. */
export function scriptSitesLabel(script: BackgroundScript): string {
    const targets = scriptTargets(script);
    if (!targets.length) return "no sites";
    const short = targets[0].replace("*://", "").replace(/\/\*$/, "");
    return targets.length > 1 ? `${short} +${targets.length - 1}` : short;
}
