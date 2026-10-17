/**
 * Per-chat record of the tabs an agent task works with. Tabs the agent opens are
 * "owned": they join one task group, and cleanup closes them. Tabs that were
 * already open are "consulted": the agent may read them and keep notes, but
 * their position, pinning, sound and grouping stay the user's.
 */

interface TaskTab {owned: boolean; purpose?: string; notes: string[]; retain?: boolean; /** The blank tab the chat started on: grouped with the task, kept at finish. */ origin?: boolean}
interface Workspace {originTabId?: number; groupId?: number; title?: string; tabs: Record<string, TaskTab>}

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
    await chrome.tabGroups.update(ws.groupId, {title: ws.title});
}

export interface OpenOptions {urls: string[]; group?: string; purpose?: string; background: boolean; openerTabId?: number; originBlank?: boolean}

/** Opens (or reuses) task tabs concurrently and groups them before returning. */
export function openTaskTabs(conversationId: string, originTabId: number | undefined, options: OpenOptions) {
    return transaction(async () => {
        const ws = workspace(conversationId);
        ws.originTabId ??= originTabId;
        ws.title ??= options.group?.trim() || undefined;
        if (!ws.title) throw new Error('Name the task group first: pass group, a short descriptive title such as "Laptop Comparison".');
        const owned = await Promise.all(Object.entries(ws.tabs).filter(([, t]) => t.owned)
            .map(([id]) => chrome.tabs.get(Number(id)).catch(() => undefined)));
        const windowId = originTabId ? await chrome.tabs.get(originTabId).then(t => t.windowId, () => undefined) : undefined;
        const active = !options.background && options.urls.length === 1;
        const opened = await Promise.all(options.urls.map(async url => {
            const existing = owned.find(t => t && (sameUrl(t.url, url) || sameUrl(t.pendingUrl, url)));
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
        if (adoptOrigin) ws.tabs[originTabId] = {...ws.tabs[originTabId], owned: true, origin: true, notes: ws.tabs[originTabId]?.notes ?? []};
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
    return {group: ws.groupId === undefined ? undefined : {groupId: ws.groupId, title: ws.title}, workingTabId: ws.originTabId, tabs: tabs.filter(Boolean)};
}

/** Throws unless every tab was opened by this task or the user asked to change their own tabs. */
export async function assertTaskTabs(conversationId: string | undefined, tabIds: number[], userRequested: boolean | undefined) {
    if (!conversationId || userRequested) return;
    await settled();
    const ws = workspaces[conversationId];
    const foreign = tabIds.filter(id => !ws?.tabs[id]?.owned);
    if (foreign.length) throw new Error(`Tab${foreign.length > 1 ? 's' : ''} ${foreign.join(', ')} ${foreign.length > 1 ? 'were' : 'was'} already open before this task. Leave the user's tabs as they are unless the user explicitly asked to change them; then pass userRequested true.`);
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
