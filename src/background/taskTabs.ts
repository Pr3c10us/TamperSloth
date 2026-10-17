/**
 * Per-chat record of the tabs an agent task works with. Tabs the agent opens are
 * "owned": they join one task group, and cleanup closes them. Tabs that were
 * already open are "consulted": the agent may read them and keep notes, but
 * their position, pinning, sound and grouping stay the user's.
 */

interface TaskTab {owned: boolean; purpose?: string; notes: string[]; retain?: boolean; /** The blank tab the chat started on: grouped with the task, kept at finish. */ origin?: boolean}
import {loadAgentSettings} from '../chat/lib/agentSettings';

export type TaskStatus = 'working' | 'waiting';
interface Workspace {originTabId?: number; groupId?: number; title?: string; status?: TaskStatus; tabs: Record<string, TaskTab>}

/** Every TamperSloth group carries this prefix and color, so users can tell them from their own groups. */
export const GROUP_PREFIX = '🦥';
export const GROUP_COLOR = 'green' as const;
const PAUSED = '⏸';
/** The bare task name, without our prefix or status marks a model or user may have typed. */
export const bareTitle = (title: string) => title.replace(/^(?:\s*(?:🦥|⏸️?|TS\s*\|))+\s*/u, '').trim();
const groupTitle = (ws: Workspace) => `${GROUP_PREFIX} ${ws.status === 'waiting' ? PAUSED + ' ' : ''}${ws.title}`;
const isOurs = (title: string | undefined) => !!title?.startsWith(GROUP_PREFIX);

const KEY = 'ts_task_tabs';
const MAX_NOTES = 20;
let workspaces: Record<string, Workspace> = {};
const ready = chrome.storage.session.get(KEY).then(data => { workspaces = {...(data[KEY] ?? {}), ...workspaces}; }, () => {});
let chain: Promise<unknown> = Promise.resolve();
/** Serializes every read-modify-write, so concurrent opens and popups join the same group. */
function transaction<T>(fn: () => Promise<T>): Promise<T> {
    const task = chain.catch(() => {}).then(() => ready).then(async () => {
        try { return await fn(); } finally { await chrome.storage.session.set({[KEY]: workspaces}).catch(() => {}); }
    });
    chain = task;
    return task;
}
/** Reads wait for queued writes, such as a popup still joining the group. */
const settled = () => chain.catch(() => {}).then(() => ready);
const workspace = (conversationId: string) => workspaces[conversationId] ??= {tabs: {}};
const ownerOf = (tabId: number) => Object.entries(workspaces).find(([, ws]) => ws.tabs[tabId]?.owned)?.[0];
const sameUrl = (a?: string, b?: string) => !!a && !!b && a.replace(/#.*$/, '').replace(/\/$/, '') === b.replace(/#.*$/, '').replace(/\/$/, '');

type TabIds = [number, ...number[]];

/** Adds tabs to the task group, creating it in the tabs' window when it is missing or was removed. */
async function joinGroup(ws: Workspace, tabIds: TabIds) {
    const group = ws.groupId === undefined ? undefined : await chrome.tabGroups.get(ws.groupId).catch(() => undefined);
    const windowId = (await chrome.tabs.get(tabIds[0])).windowId;
    if (group && group.windowId === windowId) {
        await chrome.tabs.group({groupId: group.id, tabIds});
        return;
    }
    ws.groupId = await chrome.tabs.group({tabIds, createProperties: {windowId}});
    await chrome.tabGroups.update(ws.groupId, {title: groupTitle(ws), color: GROUP_COLOR});
}

export interface OpenOptions {urls: string[]; group?: string; purpose?: string; background: boolean; openerTabId?: number; originBlank?: boolean}

/** Opens (or reuses) task tabs concurrently and groups them before returning. */
export function openTaskTabs(conversationId: string, originTabId: number | undefined, options: OpenOptions) {
    return transaction(async () => {
        const ws = workspace(conversationId);
        ws.originTabId ??= originTabId;
        ws.title ??= bareTitle(options.group ?? '') || undefined;
        if (!ws.title) throw new Error('Name the task group first: pass group, a short descriptive title such as "Laptop Comparison".');
        const owned = await Promise.all(Object.entries(ws.tabs).filter(([, t]) => t.owned)
            .map(([id]) => chrome.tabs.get(Number(id)).catch(() => undefined)));
        const windowId = originTabId ? await chrome.tabs.get(originTabId).then(t => t.windowId, () => undefined) : undefined;
        const active = !options.background && options.urls.length === 1;
        const reusable = (url: string) => owned.find(t => t && (sameUrl(t.url, url) || sameUrl(t.pendingUrl, url)));
        // The working tab never counts: the limit is on the extra tabs a task keeps open at once.
        const open = owned.filter(t => t && t.id !== ws.originTabId && !ws.tabs[t.id!]?.origin).length;
        const adding = new Set(options.urls.filter(url => !reusable(url)).map(url => url.replace(/#.*$/, ''))).size;
        const {maxTaskTabs} = await loadAgentSettings();
        if (open + adding > maxTaskTabs) {
            throw new Error(`Tab limit: this task has ${open} of ${maxTaskTabs} tabs open, and this would open ${adding} more. Close task tabs you no longer need (browserTabs close), or read pages one after another. The user can raise "Tabs per task" in settings.`);
        }
        const opened = await Promise.all(options.urls.map(async url => {
            const existing = reusable(url);
            if (existing?.id) return {tab: existing, reused: true};
            const tab = await chrome.tabs.create({url, active, ...(windowId !== undefined ? {windowId} : {}),
                ...(options.openerTabId ? {openerTabId: options.openerTabId} : {})});
            return {tab, reused: false};
        }));
        for (const {tab} of opened) {
            const record = ws.tabs[tab.id!] ??= {owned: true, notes: []};
            if (options.purpose) record.purpose = options.purpose;
        }
        // A chat started on a new tab page is using that tab for the task, so it joins the group too.
        const adoptOrigin = options.originBlank && originTabId !== undefined && !ws.tabs[originTabId]?.owned;
        if (adoptOrigin) {
            ws.tabs[originTabId] = {...ws.tabs[originTabId], owned: true, origin: true, notes: ws.tabs[originTabId]?.notes ?? []};
            await rememberOrigin(conversationId, originTabId);
        }
        let groupError: string | undefined;
        await joinGroup(ws, [...(adoptOrigin ? [originTabId] : []), ...opened.map(o => o.tab.id!)] as TabIds).catch(error => { groupError = String(error?.message ?? error); });
        return {group: {groupId: ws.groupId, title: ws.title, ...(groupError ? {error: groupError} : {})},
            tabs: opened.map(({tab, reused}) => ({tabId: tab.id!, url: tab.pendingUrl ?? tab.url, ...(reused ? {reused} : {})}))};
    });
}

/** Records purpose, findings or keep-on-cleanup for any tab the task uses, owned or consulted. */
export function noteTaskTab(conversationId: string, tabId: number, change: {purpose?: string; note?: string; retain?: boolean}) {
    return transaction(async () => {
        await chrome.tabs.get(tabId);
        const record = workspace(conversationId).tabs[tabId] ??= {owned: false, notes: []};
        if (change.purpose) record.purpose = change.purpose;
        if (change.note) record.notes = [...record.notes, change.note].slice(-MAX_NOTES);
        if (change.retain !== undefined) record.retain = change.retain;
        // No top-level tabId: callers read that as the page tool target changing.
        return {noted: {tabId, ...record}};
    });
}

/** The task's tabs with live URL/title, for listings and run-start context. */
export async function describeTask(conversationId: string) {
    await settled();
    const ws = workspaces[conversationId];
    if (!ws || !Object.keys(ws.tabs).length) return undefined;
    const tabs = await Promise.all(Object.entries(ws.tabs).map(async ([id, record]) => {
        const tab = await chrome.tabs.get(Number(id)).catch(() => undefined);
        return tab && {tabId: tab.id, url: tab.url, title: tab.title, ...record};
    }));
    return {group: ws.groupId === undefined ? undefined : {groupId: ws.groupId, title: ws.title, status: ws.status ?? 'working'}, workingTabId: ws.originTabId, tabs: tabs.filter(Boolean)};
}

/** Throws unless every tab was opened by this task or the user asked to change their own tabs. */
export async function assertTaskTabs(conversationId: string | undefined, tabIds: number[], userRequested: boolean | undefined) {
    if (!conversationId || userRequested) return;
    await settled();
    const ws = workspaces[conversationId];
    const foreign = tabIds.filter(id => !ws?.tabs[id]?.owned);
    if (foreign.length) throw new Error(`Tab${foreign.length > 1 ? 's' : ''} ${foreign.join(', ')} ${foreign.length > 1 ? 'were' : 'was'} already open before this task. Leave the user's tabs as they are unless the user explicitly asked to change them; then pass userRequested true.`);
}

/** The tab the chat started in holds the user's result, so the agent never closes it on its own. */
export async function assertNotWorkingTab(conversationId: string | undefined, tabIds: number[], userRequested: boolean | undefined) {
    if (!conversationId || userRequested) return;
    await settled();
    const ws = workspaces[conversationId];
    const working = tabIds.find(id => id === ws?.originTabId || ws?.tabs[id]?.origin);
    if (working !== undefined) throw new Error(`Tab ${working} is the working tab the chat started in; it stays open. Close only reference tabs, or pass userRequested true if the user asked to close it.`);
}

/** Throws unless the group is this task's group or the user asked to change their own groups. */
export async function assertTaskGroup(conversationId: string | undefined, groupId: number, userRequested: boolean | undefined) {
    if (!conversationId || userRequested) return;
    await settled();
    if (workspaces[conversationId]?.groupId !== groupId) throw new Error(`Group ${groupId} is not this task's group. Leave the user's groups as they are unless the user explicitly asked to change them; then pass userRequested true.`);
}

/**
 * Ends the task: closes the tabs it opened except retained ones, which leave the
 * group first so it disappears with the closed tabs. Consulted tabs, the original
 * tab and other groups are never touched. Notes are returned so findings survive.
 */
export function finishTask(conversationId: string, keepTabIds: number[] = []) {
    return transaction(async () => {
        const ws = workspaces[conversationId];
        delete workspaces[conversationId];
        if (!ws) return {closed: [], kept: [], findings: []};
        const live = (await Promise.all(Object.entries(ws.tabs).map(async ([id, record]) => {
            const tab = await chrome.tabs.get(Number(id)).catch(() => undefined);
            return tab ? {tab, record} : undefined;
        }))).filter(entry => entry !== undefined);
        const owned = live.filter(({record}) => record.owned);
        const keep = owned.filter(({tab, record}) => record.origin || tab.id === ws.originTabId || record.retain || keepTabIds.includes(tab.id!)).map(({tab}) => tab);
        const close = owned.filter(({tab}) => !keep.includes(tab)).map(({tab}) => tab.id!);
        const grouped = keep.filter(tab => tab.groupId !== -1 && tab.groupId === ws.groupId).map(tab => tab.id!);
        if (grouped.length) await chrome.tabs.ungroup(grouped as TabIds);
        if (close.length) await chrome.tabs.remove(close);
        // Chrome removes a group with its last tab. Tabs the task didn't open (e.g. dragged in by the user)
        // leave it open and ungrouped, so the group always goes away while their tabs stay.
        const group = ws.groupId === undefined ? undefined : await chrome.tabGroups.get(ws.groupId).catch(() => undefined);
        if (group && isOurs(group.title)) {
            const stragglers = (await chrome.tabs.query({groupId: group.id})).map(tab => tab.id!);
            if (stragglers.length) await chrome.tabs.ungroup(stragglers as TabIds);
        }
        await forgetOrigin(conversationId);
        return {closed: close, kept: keep.map(tab => tab.id!),
            findings: live.filter(({record}) => record.notes.length || record.purpose)
                .map(({tab, record}) => ({tabId: tab.id, url: tab.url, title: tab.title, purpose: record.purpose, notes: record.notes}))};
    });
}

/** Tabs a task tab opens (target=_blank links, popups) belong to the same task. */
chrome.tabs.onCreated.addListener(tab => {
    if (!tab.id || !tab.openerTabId) return;
    const opener = tab.openerTabId, id = tab.id;
    void transaction(async () => {
        const conversationId = ownerOf(opener);
        if (!conversationId || workspaces[conversationId].tabs[id]) return;
        const ws = workspaces[conversationId];
        ws.tabs[id] = {owned: true, purpose: `Opened from tab ${opener}`, notes: []};
        await joinGroup(ws, [id]).catch(() => {});
    });
});
chrome.tabs.onRemoved.addListener(id => {
    void transaction(async () => { for (const ws of Object.values(workspaces)) delete ws.tabs[id]; });
});

/** Shows in the group title whether the task is working or waiting on the user. */
export function setTaskStatus(conversationId: string, status: TaskStatus) {
    return transaction(async () => {
        const ws = workspaces[conversationId];
        if (!ws || ws.status === status && status === 'working') return {ok: true};
        ws.status = status;
        if (ws.groupId !== undefined) await chrome.tabGroups.update(ws.groupId, {title: groupTitle(ws)}).catch(() => {});
        return {ok: true};
    });
}

/**
 * Keeps the task group's prefix and color through the agent's own edits. For any
 * other group, the requested style passes through unchanged.
 */
export function taskGroupStyle(conversationId: string | undefined, groupId: number, style: chrome.tabGroups.UpdateProperties) {
    return transaction(async () => {
        const ws = conversationId ? workspaces[conversationId] : undefined;
        if (!ws || ws.groupId !== groupId) return style;
        if (style.title !== undefined) ws.title = bareTitle(style.title) || ws.title;
        return {...style, title: groupTitle(ws), color: GROUP_COLOR};
    });
}

/** Back on the working tab the references are out of the way; opening a reference shows its group again. */
export function tidyTaskGroup(conversationId: string, selectedTabId: number) {
    return transaction(async () => {
        const ws = workspaces[conversationId];
        if (ws?.groupId === undefined) return;
        const tab = await chrome.tabs.get(selectedTabId).catch(() => undefined);
        if (!tab) return;
        if (tab.groupId === ws.groupId) await chrome.tabGroups.update(ws.groupId, {collapsed: false}).catch(() => {});
        else if (selectedTabId === ws.originTabId) await chrome.tabGroups.update(ws.groupId, {collapsed: true}).catch(() => {});
    });
}

const LEFTOVER_KEY = 'ts_leftover_groups';
const LEFTOVER_NOTICE = 'tampersloth-leftover-groups';

/** Groups with our prefix that no live task owns, e.g. restored by Chrome after a restart. */
async function leftoverGroups() {
    await settled();
    const owned = new Set(Object.values(workspaces).map(ws => ws.groupId));
    return (await chrome.tabGroups.query({})).filter(group => isOurs(group.title) && !owned.has(group.id));
}

/** Offers, never forces, closing leftover TamperSloth groups: the user may have adopted one. */
async function offerLeftoverCleanup() {
    const groups = await leftoverGroups();
    if (!groups.length) return;
    const origins = await rememberedOrigins();
    const tabs = await chrome.tabs.query({});
    const count = tabs.filter(tab => groups.some(group => group.id === tab.groupId) && !isRememberedOrigin(origins, tab.url)).length;
    await chrome.storage.session.set({[LEFTOVER_KEY]: groups.map(group => group.id)});
    await chrome.notifications.create(LEFTOVER_NOTICE, {type: 'basic', iconUrl: 'icon.png', title: 'Leftover TamperSloth tabs',
        message: `${groups.length === 1 ? `"${bareTitle(groups[0].title ?? '')}" is` : `${groups.length} TamperSloth groups are`} still open from an earlier session (${count} tab${count === 1 ? '' : 's'}).`,
        buttons: [{title: 'Close them'}, {title: 'Keep them'}], requireInteraction: true});
}

/** Closes the offered groups' tabs, skipping any group the user renamed or a task has taken over since. */
export async function closeLeftoverGroups() {
    const offered = new Set((await chrome.storage.session.get(LEFTOVER_KEY))[LEFTOVER_KEY] as number[] | undefined);
    const groups = (await leftoverGroups()).filter(group => offered.has(group.id)).map(group => group.id);
    const origins = await rememberedOrigins();
    const grouped = (await chrome.tabs.query({})).filter(tab => groups.includes(tab.groupId));
    // A tab the user started a chat in may sit in its task's group: it leaves the group instead of closing.
    const spared = grouped.filter(tab => isRememberedOrigin(origins, tab.url)).map(tab => tab.id!);
    const tabIds = grouped.filter(tab => !spared.includes(tab.id!)).map(tab => tab.id!);
    if (spared.length) await chrome.tabs.ungroup(spared as TabIds);
    if (tabIds.length) await chrome.tabs.remove(tabIds);
    await chrome.storage.session.remove(LEFTOVER_KEY);
    await pruneOrigins();
    return {closed: tabIds, spared};
}

export function installLeftoverGroupCheck() {
    const check = () => { void offerLeftoverCleanup().catch(error => console.warn('[Tampersloth] Leftover group check failed:', error)); };
    // Session storage, and so every task record, is gone after a browser restart or extension update.
    chrome.runtime.onStartup?.addListener(check);
    chrome.runtime.onInstalled?.addListener(check);
    chrome.notifications.onButtonClicked?.addListener((id, button) => {
        if (id !== LEFTOVER_NOTICE) return;
        void chrome.notifications.clear(id);
        if (button === 0) void closeLeftoverGroups();
        else void chrome.storage.session.remove(LEFTOVER_KEY).then(pruneOrigins);
    });
}

/**
 * Grouped working tabs by URL, in local storage: unlike task records it survives a
 * browser restart, when tab ids change and only the URL still identifies the tab.
 */
const ORIGINS_KEY = 'ts_task_origins';
async function rememberedOrigins(): Promise<Record<string, string>> {
    return ((await chrome.storage.local.get(ORIGINS_KEY))[ORIGINS_KEY] ?? {}) as Record<string, string>;
}
const isRememberedOrigin = (origins: Record<string, string>, url?: string) => Object.values(origins).some(origin => sameUrl(origin, url));
async function rememberOrigin(conversationId: string, tabId: number) {
    const tab = await chrome.tabs.get(tabId).catch(() => undefined);
    const url = tab?.url || tab?.pendingUrl;
    if (url) await chrome.storage.local.set({[ORIGINS_KEY]: {...await rememberedOrigins(), [conversationId]: url}});
}
async function forgetOrigin(conversationId: string) {
    const origins = await rememberedOrigins();
    if (!(conversationId in origins)) return;
    delete origins[conversationId];
    await chrome.storage.local.set({[ORIGINS_KEY]: origins});
}
/** Drops entries whose task is gone; after a restart, that is all of them once leftovers are handled. */
async function pruneOrigins() {
    await settled();
    const origins = await rememberedOrigins();
    await chrome.storage.local.set({[ORIGINS_KEY]: Object.fromEntries(Object.entries(origins).filter(([id]) => workspaces[id]))});
}
// The working tab is usually navigated to the site the work belongs on; follow it.
chrome.tabs.onUpdated?.addListener((tabId, change) => {
    if (!change.url) return;
    const entry = Object.entries(workspaces).find(([, ws]) => ws.tabs[tabId]?.origin);
    if (entry) void rememberOrigin(entry[0], tabId);
});
