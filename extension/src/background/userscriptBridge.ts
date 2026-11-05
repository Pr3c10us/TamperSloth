import type {BackgroundScript} from "../chat/lib/types";
import {imageForScript, listImages} from "../chat/lib/imageLibrary";
import {connectAllowed, grantKey} from "../scripts/userscript";
import {clipboard} from "./browserService";
import {askToConnect} from "./connectPrompt";
import {pushToScript} from "./userscriptHost";

// Privileged GM_* calls from installed userscripts. The caller is already
// authenticated by its token; each call is checked against the script's own
// @grant (and, for requests, @connect) before anything happens.

type Sender = chrome.runtime.MessageSender;

const hasGrant = (script: BackgroundScript, key: string) =>
    !!script.userscript?.grants.some((g) => grantKey(g) === key);

const denied = (error: string) => ({denied: true, error});

/** Hosts a script may reach without asking: its @connect list plus what the user always allowed. */
const contactable = (script: BackgroundScript) => [...(script.userscript?.connects ?? []), ...(script.userscript?.connectAllowed ?? [])];

function isWebUrl(url: string): boolean {
    try {
        return ["http:", "https:"].includes(new URL(url).protocol);
    } catch {
        return false;
    }
}

function toBase64(bytes: Uint8Array): string {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// ── GM_xmlhttpRequest ───────────────────────────────────────

const requests = new Map<string, AbortController>();

async function xhr(message: any, script: BackgroundScript, sender: Sender) {
    if (!hasGrant(script, "xmlhttprequest")) return denied("GM_xmlhttpRequest isn't in this script's @grant list.");
    const url = String(message.url);
    if (!isWebUrl(url)) return {error: "Only http and https requests are allowed."};
    const host = new URL(url).hostname;
    if (script.userscript?.connectBlocked?.includes(host)
        || (!connectAllowed(url, contactable(script), sender.url) && !(await askToConnect(script, host, sender.url ?? "")))) {
        return {error: `TamperSloth blocked a request to ${host}: you haven't allowed this script to contact it.`};
    }

    const controller = new AbortController();
    const id = String(message.requestId);
    requests.set(id, controller);
    let timedOut = false;
    const timer = message.timeout > 0 ? setTimeout(() => { timedOut = true; controller.abort(); }, message.timeout) : undefined;

    const headers = new Headers();
    for (const [k, v] of Object.entries(message.headers ?? {})) {
        try { headers.set(k, String(v)); } catch { /* a header fetch won't send */ }
    }
    let body: BodyInit | undefined;
    if (message.bodyType === "text") body = String(message.body);
    else if (message.bodyType === "urlencoded") body = new URLSearchParams(String(message.body));
    else if (message.bodyType === "base64") body = fromBase64(String(message.body));
    else if (message.bodyType === "form") {
        const form = new FormData();
        for (const [k, v] of message.body as [string, string][]) form.append(k, v);
        body = form;
    }

    const method = String(message.method || "GET");
    try {
        const res = await fetch(url, {
            method,
            headers,
            body: method === "GET" || method === "HEAD" ? undefined : body,
            credentials: message.anonymous ? "omit" : "include",
            signal: controller.signal,
        });
        // A redirect can land somewhere @connect never named; the script only gets the answer if that's allowed too.
        if (res.redirected) {
            const landedOn = new URL(res.url).hostname;
            if (script.userscript?.connectBlocked?.includes(landedOn)
                || (!connectAllowed(res.url, contactable(script), sender.url) && !(await askToConnect(script, landedOn, sender.url ?? "")))) {
                void res.body?.cancel();
                return {error: `TamperSloth blocked a redirect to ${landedOn}: you haven't allowed this script to contact it.`};
            }
        }
        const payload = message.binary
            ? {base64: toBase64(new Uint8Array(await res.arrayBuffer()))}
            : {text: await res.text()};
        return {
            status: res.status,
            statusText: res.statusText,
            headers: [...res.headers].map(([k, v]) => `${k}: ${v}`).join("\r\n"),
            finalUrl: res.url,
            contentType: res.headers.get("content-type") ?? "",
            ...payload,
        };
    } catch (e: any) {
        if (controller.signal.aborted) return timedOut ? {error: "timeout", timeout: true} : {error: "aborted", aborted: true};
        return {error: e?.message || String(e)};
    } finally {
        clearTimeout(timer);
        requests.delete(id);
    }
}

// ── Tabs, notifications, downloads, clipboard ───────────────

/** Tabs each script opened, so GM_openInTab's close() can't close anything else. */
const openedTabs = new Map<string, Set<number>>();

async function openTab(message: any, script: BackgroundScript, sender: Sender) {
    if (!hasGrant(script, "openintab")) return denied("GM_openInTab isn't in this script's @grant list.");
    const url = String(message.url);
    if (!isWebUrl(url)) return {error: "Only http and https pages can be opened."};
    const from = sender.tab;
    const tab = await chrome.tabs.create({
        url,
        active: message.active !== false,
        ...(from?.id !== undefined ? {openerTabId: from.id, windowId: from.windowId} : {}),
        ...(from && message.insert !== false ? {index: from.index + 1} : {}),
    });
    if (tab.id === undefined) return {error: "The tab didn't open."};
    if (!openedTabs.has(script.id)) openedTabs.set(script.id, new Set());
    openedTabs.get(script.id)!.add(tab.id);
    return {tabId: tab.id};
}

async function closeTab(message: any, script: BackgroundScript) {
    const tabId = Number(message.tabId);
    // onRemoved reports the close back to the script, whichever way the tab goes.
    if (!openedTabs.get(script.id)?.has(tabId)) return {error: "That tab wasn't opened by this script."};
    await chrome.tabs.remove(tabId).catch(() => {});
    return {ok: true};
}

const pendingNotifications = new Map<string, (result: {clicked?: boolean; closed?: boolean}) => void>();
let notificationListeners = false;

function listenForNotifications() {
    if (notificationListeners) return;
    notificationListeners = true;
    chrome.notifications.onClicked.addListener((id) => {
        const done = pendingNotifications.get(id);
        if (!done) return;
        pendingNotifications.delete(id);
        void chrome.notifications.clear(id);
        done({clicked: true});
    });
    chrome.notifications.onClosed.addListener((id) => {
        const done = pendingNotifications.get(id);
        if (!done) return;
        pendingNotifications.delete(id);
        done({closed: true});
    });
}

async function notify(message: any, script: BackgroundScript) {
    if (!hasGrant(script, "notification")) return denied("GM_notification isn't in this script's @grant list.");
    listenForNotifications();
    const id = `ts_gm_${crypto.randomUUID()}`;
    const image = String(message.image ?? "");
    const options = {
        type: "basic" as const,
        title: String(message.title || script.name).slice(0, 200),
        message: String(message.text ?? "").slice(0, 1000),
        contextMessage: script.name,
    };
    const result = new Promise<{clicked?: boolean; closed?: boolean}>((resolve) => pendingNotifications.set(id, resolve));
    try {
        await chrome.notifications.create(id, {...options, iconUrl: image.startsWith("data:image/") ? image : chrome.runtime.getURL("icon.png")});
    } catch {
        await chrome.notifications.create(id, {...options, iconUrl: chrome.runtime.getURL("icon.png")});
    }
    if (message.timeout > 0) setTimeout(() => void chrome.notifications.clear(id), message.timeout);
    return result;
}

async function download(message: any, script: BackgroundScript) {
    if (!hasGrant(script, "download")) return denied("GM_download isn't in this script's @grant list.");
    const url = String(message.url);
    if (!isWebUrl(url) && !url.startsWith("data:")) return {error: "Only http, https and data URLs can be downloaded."};
    // Keep the name to a plain relative path inside Downloads.
    const filename = String(message.name ?? "").replace(/\\/g, "/").split("/").filter((p) => p && p !== "." && p !== "..").join("/");
    try {
        const downloadId = await chrome.downloads.download({url, saveAs: !!message.saveAs, ...(filename ? {filename} : {})});
        return {downloadId};
    } catch (e: any) {
        return {error: e?.message || String(e)};
    }
}

async function setClipboard(message: any, script: BackgroundScript) {
    if (!hasGrant(script, "setclipboard")) return denied("GM_setClipboard isn't in this script's @grant list.");
    return clipboard("write", String(message.text ?? ""));
}

// ── The image library ───────────────────────────────────────

/** Every script's own grant: an installed script reads the user's images only if its review said so. */
async function getImage(message: any, script: BackgroundScript) {
    if (!hasGrant(script, "getimage")) return denied("GM_getImage isn't in this script's @grant list.");
    return {image: await imageForScript(message.name)};
}

async function listLibrary(script: BackgroundScript) {
    if (!hasGrant(script, "listimages")) return denied("GM_listImages isn't in this script's @grant list.");
    return {images: await listImages()};
}

// ── Per-tab storage, cookies, audio ─────────────────────────

const TAB_STORE_PREFIX = "ts_gm_tabs_";

async function tabStore(message: any, script: BackgroundScript, sender: Sender) {
    const key = TAB_STORE_PREFIX + script.id;
    const tabs = ((await chrome.storage.session.get(key))[key] as Record<string, unknown>) ?? {};
    const tabId = sender.tab?.id;
    if (message.action === "list") return {tabs};
    if (tabId === undefined) return {error: "This page isn't in a tab."};
    if (message.action === "get") return {tab: tabs[tabId] ?? {}};
    await chrome.storage.session.set({[key]: {...tabs, [tabId]: message.tab ?? {}}});
    return {ok: true};
}

async function forgetTab(tabId: number) {
    const all = await chrome.storage.session.get(null);
    for (const [key, value] of Object.entries(all)) {
        if (key.startsWith(TAB_STORE_PREFIX) && (value as Record<string, unknown>)[tabId] !== undefined) {
            const {[tabId]: _closed, ...rest} = value as Record<string, unknown>;
            await chrome.storage.session.set({[key]: rest});
        }
    }
}

/** Cookies only for the page itself and sites named one by one: a wildcard @connect doesn't open every site's logins. */
async function cookies(message: any, script: BackgroundScript, sender: Sender) {
    if (!hasGrant(script, "cookie")) return denied("GM_cookie isn't in this script's @grant list.");
    const details = message.details ?? {};
    const hosts = contactable(script).filter(h => h.trim() !== "*");
    const url = String(details.url || sender.url || "");
    if (!isWebUrl(url) || !connectAllowed(url, hosts, sender.url)) return {error: "This script can't use cookies for that site."};
    const domain = details.domain ? String(details.domain) : undefined;
    if (domain && !connectAllowed(`https://${domain.replace(/^\./, "")}/`, hosts, sender.url)) {
        return {error: "This script can't use cookies for that site."};
    }
    const name = details.name === undefined ? {} : {name: String(details.name)};
    try {
        if (message.action === "list") {
            const path = details.path === undefined ? {} : {path: String(details.path)};
            return {result: await chrome.cookies.getAll({...(domain ? {domain} : {url}), ...name, ...path})};
        }
        if (message.action === "set") {
            return {result: await chrome.cookies.set({
                url,
                ...name,
                ...(details.value === undefined ? {} : {value: String(details.value)}),
                ...(domain ? {domain} : {}),
                ...(details.path === undefined ? {} : {path: String(details.path)}),
                ...(details.secure === undefined ? {} : {secure: !!details.secure}),
                ...(details.httpOnly === undefined ? {} : {httpOnly: !!details.httpOnly}),
                ...(details.expirationDate === undefined ? {} : {expirationDate: Number(details.expirationDate)}),
            })};
        }
        if (message.action === "delete") {
            if (details.name === undefined) return {error: "GM_cookie.delete needs a name."};
            return {result: await chrome.cookies.remove({url, name: String(details.name)})};
        }
        return {error: `Unknown cookie action ${message.action}`};
    } catch (e: any) {
        return {error: e?.message || String(e)};
    }
}

async function audio(message: any, script: BackgroundScript, sender: Sender) {
    if (!hasGrant(script, "audio")) return denied("GM_audio isn't in this script's @grant list.");
    const tabId = sender.tab?.id;
    if (tabId === undefined) return {error: "This page isn't in a tab."};
    if (message.action === "setMute") {
        await chrome.tabs.update(tabId, {muted: !!message.isMuted});
        return {ok: true};
    }
    const tab = await chrome.tabs.get(tabId);
    return {state: {isMuted: !!tab.mutedInfo?.muted, muteReason: tab.mutedInfo?.reason, isAudible: !!tab.audible}};
}

/** Tells a script when a tab it opened closes, and clears what closed tabs left behind. */
export function installGmTabTracking() {
    chrome.tabs.onRemoved?.addListener((tabId) => {
        for (const [scriptId, tabs] of openedTabs) {
            if (tabs.delete(tabId)) pushToScript(scriptId, {type: "tab-closed", tabId});
        }
        void forgetTab(tabId).catch(() => {});
    });
}

/** Answers a GM_* request, or returns undefined for a message type it doesn't own. */
export async function handleGmRequest(message: any, sender: Sender, script: BackgroundScript): Promise<unknown> {
    if (!script.userscript) return denied("Only installed userscripts can use GM functions.");
    switch (message.type) {
        case "GM_XHR": return xhr(message, script, sender);
        case "GM_XHR_ABORT": {
            const id = String(message.requestId);
            if (id.startsWith(`${script.id}:`)) requests.get(id)?.abort();
            return {ok: true};
        }
        case "GM_OPEN_TAB": return openTab(message, script, sender);
        case "GM_CLOSE_TAB": return closeTab(message, script);
        case "GM_NOTIFICATION": return notify(message, script);
        case "GM_DOWNLOAD": return download(message, script);
        case "GM_SET_CLIPBOARD": return setClipboard(message, script);
        case "GM_TAB": return tabStore(message, script, sender);
        case "GM_COOKIE": return cookies(message, script, sender);
        case "GM_AUDIO": return audio(message, script, sender);
        case "GM_GET_IMAGE": return getImage(message, script);
        case "GM_LIST_IMAGES": return listLibrary(script);
        default: return undefined;
    }
}
