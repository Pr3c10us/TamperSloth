import type {BackgroundScript} from "@/userscripts/types";
import {loadScripts, saveScript} from "@/storage/storage";

// When a userscript asks to contact a site its @connect doesn't list, the user
// decides in a small window, as with Tampermonkey. "For now" lasts until the
// browser closes; "always" is saved on the script.

export const CONNECT_DECISION = "CONNECT_DECISION";

export interface ConnectAsk {
    scriptName: string;
    host: string;
    pageUrl: string;
}

export interface ConnectDecision {
    allow: boolean;
    remember: "session" | "always";
}

const askKey = (askId: string) => `ts_connect_ask_${askId}`;
const SESSION_DECISIONS_KEY = "ts_connect_session";
const ASK_TIMEOUT_MS = 2 * 60 * 1000;

const resolvers = new Map<string, (decision: ConnectDecision | null) => void>();
const inFlight = new Map<string, Promise<boolean>>();

async function remember(scriptId: string, host: string, decision: ConnectDecision) {
    if (decision.remember === "session") {
        const stored = await chrome.storage.session.get(SESSION_DECISIONS_KEY);
        const decisions = (stored[SESSION_DECISIONS_KEY] as Record<string, boolean>) ?? {};
        await chrome.storage.session.set({[SESSION_DECISIONS_KEY]: {...decisions, [`${scriptId}|${host}`]: decision.allow}});
        return;
    }
    const script = (await loadScripts()).find(s => s.id === scriptId);
    if (!script?.userscript) return;
    const us = script.userscript;
    us.connectAllowed = (us.connectAllowed ?? []).filter(h => h !== host);
    us.connectBlocked = (us.connectBlocked ?? []).filter(h => h !== host);
    (decision.allow ? us.connectAllowed : us.connectBlocked).push(host);
    await saveScript(script);
}

async function ask(script: BackgroundScript, host: string, pageUrl: string): Promise<boolean> {
    const askId = crypto.randomUUID();
    const details: ConnectAsk = {scriptName: script.name, host, pageUrl};
    await chrome.storage.session.set({[askKey(askId)]: details});
    const window = await chrome.windows.create({
        url: chrome.runtime.getURL(`index.html#/connect/${askId}`),
        type: "popup",
        width: 460,
        height: 430,
        focused: true,
    });
    const decision = await new Promise<ConnectDecision | null>(resolve => {
        const finish = (value: ConnectDecision | null) => {
            clearTimeout(timer);
            chrome.windows.onRemoved.removeListener(onClosed);
            resolvers.delete(askId);
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), ASK_TIMEOUT_MS);
        const onClosed = (windowId: number) => { if (windowId === window?.id) finish(null); };
        chrome.windows.onRemoved.addListener(onClosed);
        resolvers.set(askId, finish);
    });
    await chrome.storage.session.remove(askKey(askId));
    if (window?.id !== undefined) await chrome.windows.remove(window.id).catch(() => {});
    if (!decision) return false;
    await remember(script.id, host, decision);
    return decision.allow;
}

/** Whether a script may contact a host beyond its @connect list, asking the user if nothing's decided yet. */
export async function askToConnect(script: BackgroundScript, host: string, pageUrl: string): Promise<boolean> {
    if (script.userscript?.connectBlocked?.includes(host)) return false;
    const stored = await chrome.storage.session.get(SESSION_DECISIONS_KEY);
    const earlier = ((stored[SESSION_DECISIONS_KEY] as Record<string, boolean>) ?? {})[`${script.id}|${host}`];
    if (earlier !== undefined) return earlier;

    // A script often fires several requests at once; they share one question.
    const key = `${script.id}|${host}`;
    let pending = inFlight.get(key);
    if (!pending) {
        pending = ask(script, host, pageUrl).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
    }
    return pending;
}

export function installConnectPrompt() {
    chrome.runtime.onMessage.addListener((message, sender) => {
        if (message?.type !== CONNECT_DECISION) return false;
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
        resolvers.get(String(message.askId))?.({
            allow: message.allow === true,
            remember: message.remember === "always" ? "always" : "session",
        });
        return false;
    });
}
