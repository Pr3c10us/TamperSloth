import type {BackgroundScript, ImportedUserscript} from "../chat/lib/types";
import {urlCovered} from "../scripts/userscript";
import {buildUserscriptInjection, userscriptWorldId} from "./userscriptRuntime";
import {SEND_TO_SLOTH_MENU, SEND_TO_SLOTH_CONTEXTS} from "./contextMenu";

// Live connections to running userscripts: what lets the background push to
// them (other tabs' value changes, menu clicks, closed tabs, audio state) and
// what fills the right-click menu with their commands.

interface Channel {
    port: chrome.runtime.Port;
    scriptId: string;
    instance: string;
    tabId?: number;
    frameId: number;
    commands: {id: string; caption: string}[];
    watchesAudio: boolean;
}

interface HostOptions {
    authenticate: (message: any) => Promise<BackgroundScript | null>;
    getScripts: () => Promise<BackgroundScript[]>;
    tokens: (scripts: BackgroundScript[]) => Promise<Record<string, string>>;
}

const channels = new Set<Channel>();
const MENU_IDS_KEY = "ts_us_menu_ids";
const MENU_SEPARATOR = "ts-us-separator";
const MAX_COMMANDS = 50;
let options: HostOptions | null = null;

/** Sends to every running copy of a script, except the one a change came from. */
export function pushToScript(scriptId: string, message: unknown, exceptInstance?: string) {
    for (const channel of channels) {
        if (channel.scriptId !== scriptId || channel.instance === exceptInstance) continue;
        try { channel.port.postMessage(message); } catch { /* it just went away */ }
    }
}

function acceptPort(port: chrome.runtime.Port) {
    if (port.name !== "ts-userscript" || !options) return;
    const {authenticate} = options;
    let channel: Channel | null = null;
    let gone = false;
    let queue: Promise<void> = Promise.resolve();
    port.onMessage.addListener((message: any) => {
        queue = queue.then(async () => {
            if (!channel) {
                if (message?.type !== "hello") return;
                const script = await authenticate(message);
                if (gone) return;
                if (!script) {
                    port.postMessage({type: "bye"});
                    port.disconnect();
                    return;
                }
                channel = {
                    port,
                    scriptId: script.id,
                    instance: String(message.instance),
                    tabId: port.sender?.tab?.id,
                    frameId: port.sender?.frameId ?? 0,
                    commands: [],
                    watchesAudio: false,
                };
                channels.add(channel);
            } else if (message?.type === "menu" && Array.isArray(message.commands)) {
                channel.commands = message.commands.slice(0, MAX_COMMANDS)
                    .map((c: any) => ({id: String(c.id), caption: String(c.caption)}));
                refreshUserscriptMenus();
            } else if (message?.type === "audio-watch") {
                channel.watchesAudio = true;
            }
        }).catch(() => {});
    });
    port.onDisconnect.addListener(() => {
        gone = true;
        if (!channel) return;
        channels.delete(channel);
        if (channel.commands.length) refreshUserscriptMenus();
    });
}

// ── Right-click menu ────────────────────────────────────────

const menuTitle = (text: string) => text.replace(/&/g, "&&").slice(0, 100);

function createItem(properties: chrome.contextMenus.CreateProperties) {
    chrome.contextMenus.create({parentId: SEND_TO_SLOTH_MENU, contexts: SEND_TO_SLOTH_CONTEXTS, ...properties}, () => {
        void chrome.runtime.lastError; // A menu rebuilt meanwhile; the next refresh settles it.
    });
}

async function rebuildMenus() {
    if (!options) return;
    const stored = await chrome.storage.session.get(MENU_IDS_KEY);
    for (const id of (stored[MENU_IDS_KEY] as string[] | undefined) ?? []) {
        await chrome.contextMenus.remove(id).catch(() => {});
    }

    const scripts = await options.getScripts();
    const [tab] = await chrome.tabs.query({active: true, lastFocusedWindow: true});
    const items: {id: string; title: string}[] = [];
    if (tab?.id !== undefined && tab.url) {
        const seen = new Set<string>();
        // Top frames first, so a command a script registers in every frame shows once and goes to the page.
        const here = [...channels].filter(c => c.tabId === tab.id).sort((a, b) => a.frameId - b.frameId);
        for (const channel of here) {
            const name = scripts.find(s => s.id === channel.scriptId)?.name ?? "Userscript";
            for (const command of channel.commands) {
                const key = `${channel.scriptId}|${command.caption}`;
                if (seen.has(key)) continue;
                seen.add(key);
                items.push({
                    id: `ts-us-cmd|${channel.scriptId}|${channel.instance}|${encodeURIComponent(command.id)}`,
                    title: menuTitle(`${name}: ${command.caption}`),
                });
            }
        }
        for (const script of scripts) {
            if (script.status === "active" && script.userscript?.contextMenu && urlCovered(script.userscript, tab.url)) {
                items.push({id: `ts-us-run|${script.id}`, title: menuTitle(`Run ${script.name}`)});
            }
        }
    }

    if (items.length) createItem({id: MENU_SEPARATOR, type: "separator"});
    for (const item of items) createItem(item);
    await chrome.storage.session.set({[MENU_IDS_KEY]: items.length ? [MENU_SEPARATOR, ...items.map(i => i.id)] : []});
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let rebuildChain: Promise<void> = Promise.resolve();
export function refreshUserscriptMenus() {
    if (!chrome.contextMenus) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => {
        rebuildChain = rebuildChain.then(rebuildMenus).catch(error => console.warn("[Tampersloth] Could not update userscript menus:", error));
    }, 60);
}

/** Runs a `@run-at context-menu` script once in the frame that was right-clicked. */
async function runContextMenuScript(scriptId: string, tab: chrome.tabs.Tab, frameId: number) {
    if (!options || tab.id === undefined || !tab.url) return;
    const scripts = await options.getScripts();
    const script = scripts.find(s => s.id === scriptId);
    const us = script?.userscript;
    if (!script || !us || script.status !== "active" || !urlCovered(us, tab.url)) return;
    const token = (await options.tokens(scripts))[script.id];
    const injection = buildUserscriptInjection(script as BackgroundScript & {userscript: ImportedUserscript}, token);
    const target = {tabId: tab.id, frameIds: [frameId]};
    const worldId = userscriptWorldId(script.id);
    if (injection.relay) {
        await chrome.userScripts.execute({target, js: [{code: injection.relay}], world: "USER_SCRIPT", worldId});
    }
    await chrome.userScripts.execute({
        target,
        js: [{code: injection.main}],
        world: us.world,
        ...(us.world === "USER_SCRIPT" ? {worldId} : {}),
    });
}

function onMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab) {
    const [kind, scriptId, instance, commandId] = String(info.menuItemId).split("|");
    if (kind === "ts-us-run" && tab) {
        void runContextMenuScript(scriptId, tab, info.frameId ?? 0)
            .catch(error => console.warn("[Tampersloth] Could not run the script:", error));
    }
    if (kind !== "ts-us-cmd") return;
    const deliver = () => {
        const channel = [...channels].find(c => c.scriptId === scriptId && c.instance === instance);
        channel?.port.postMessage({type: "menu", id: decodeURIComponent(commandId)});
        return !!channel;
    };
    // A click can wake a stopped worker before the script has reconnected.
    if (!deliver()) setTimeout(deliver, 2500);
}

function onTabUpdated(tabId: number, info: chrome.tabs.OnUpdatedInfo, tab: chrome.tabs.Tab) {
    if (info.url || info.status === "complete") refreshUserscriptMenus();
    if (info.mutedInfo === undefined && info.audible === undefined) return;
    const state = {isMuted: !!tab.mutedInfo?.muted, muteReason: tab.mutedInfo?.reason, isAudible: !!tab.audible};
    for (const channel of channels) {
        if (channel.tabId === tabId && channel.watchesAudio) {
            try { channel.port.postMessage({type: "audio", state}); } catch { /* it just went away */ }
        }
    }
}

export function installUserscriptHost(hostOptions: HostOptions) {
    options = hostOptions;
    chrome.runtime.onUserScriptConnect?.addListener(acceptPort);
    chrome.tabs.onUpdated?.addListener(onTabUpdated);
    chrome.tabs.onActivated?.addListener(refreshUserscriptMenus);
    chrome.windows?.onFocusChanged?.addListener(refreshUserscriptMenus);
    if (chrome.contextMenus) {
        chrome.contextMenus.onClicked.addListener(onMenuClick);
        // The menu is rebuilt from nothing on install; put these back after it.
        chrome.runtime.onInstalled?.addListener(() => setTimeout(refreshUserscriptMenus, 500));
    }
}
