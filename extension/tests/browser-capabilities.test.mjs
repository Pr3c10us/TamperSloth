import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {createLoader, invoke, plain} from './load-ts.mjs';

function eventBus() {
    const listeners = new Set();
    return {addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
        fire: (...args) => { for (const fn of listeners) fn(...args); }, listeners};
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function fixture(seed = {}) {
    const saved = structuredClone(seed), session = {}, commands = [], downloads = [], tabs = new Map([[7, {id: 7, windowId: 1, url: 'https://example.com', title: 'Page'}]]);
    const groups = new Map();
    let nextId = 8;
    const area = target => ({get: async key => key === null ? structuredClone(target) : Array.isArray(key)
            ? Object.fromEntries(key.filter(k => Object.hasOwn(target, k)).map(k => [k, structuredClone(target[k])]))
            : {[key]: structuredClone(target[key])}, getKeys: async () => Object.keys(target),
        set: async value => { Object.assign(target, structuredClone(value)); }, remove: async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete target[key]; }});
    const chrome = {
        storage: {local: area(saved), session: area(session)},
        action: {setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {}},
        tabs: {onCreated: eventBus(), onRemoved: eventBus(), query: async options => [...tabs.values()].filter(tab =>
            (options?.windowId === undefined || tab.windowId === options.windowId) && (!options?.active || tab.active)
            && (options?.groupId === undefined || tab.groupId === options.groupId)),
            get: async id => { if (!tabs.has(id)) throw new Error('Tab gone'); return tabs.get(id); },
            create: async options => { const tab = {id: nextId++, windowId: 1, ...options}; tabs.set(tab.id, tab); chrome.tabs.onCreated.fire(tab); return tab; },
            update: async (id, options) => {
                if (!tabs.has(id)) throw new Error('Tab gone');
                if (options.active) for (const tab of tabs.values()) if (tab.windowId === tabs.get(id).windowId) tab.active = false;
                Object.assign(tabs.get(id), options); return tabs.get(id);
            },
            remove: async ids => { for (const id of [ids].flat()) { tabs.delete(id); chrome.tabs.onRemoved.fire(id); } },
            move: async (ids, {index, windowId}) => ids.map(id => Object.assign(tabs.get(id), {index, ...(windowId !== undefined ? {windowId} : {})})),
            group: async ({tabIds, groupId}) => {
                const id = groupId ?? groups.size + 1;
                if (!groups.has(id)) groups.set(id, {id, windowId: 1, title: '', color: 'grey', collapsed: false});
                for (const tabId of tabIds) tabs.get(tabId).groupId = id;
                return id;
            },
            ungroup: async ids => { for (const id of ids) tabs.get(id).groupId = -1; }},
        tabGroups: {query: async () => [...groups.values()], get: async id => groups.get(id),
            update: async (id, props) => Object.assign(groups.get(id), props), move: async (id, props) => Object.assign(groups.get(id), props)},
        windows: {update: async () => {}},
        debugger: {onEvent: eventBus(), onDetach: eventBus(), attach: async target => { commands.push({method: 'attach', target}); },
            detach: async target => { commands.push({method: 'detach', target}); chrome.debugger.onDetach.fire(target); },
            sendCommand: async (target, method, params) => {
                commands.push({target, method, params});
                if (method === 'Page.getFrameTree') return {frameTree: {frame: {id: 'main', url: 'https://example.com'}}};
                if (method === 'Page.createIsolatedWorld') return {executionContextId: 11};
                if (method === 'Page.captureScreenshot') return {data: 'aW1hZ2U='};
                if (method === 'DOMDebugger.getEventListeners') return {listeners: []};
                if (method === 'DOM.resolveNode') return {object: {objectId: 'node'}};
                if (method === 'Runtime.evaluate' && params.expression === 'document') return {result: {objectId: 'doc'}};
                if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothScreenshot')) {
                    return {result: {value: {key: 'document-1:0', settled: true, visible: true}}};
                }
                if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothPerception')) {
                    const args = JSON.parse(params.expression.slice(params.expression.lastIndexOf(')(') + 2, -1));
                    const metrics = {url: 'https://example.com', scroll: {x: 0, y: 0}, viewport: {width: 400, height: 300}, devicePixelRatio: 2};
                    if (args.action === 'metrics') return {result: {value: metrics}};
                    if (args.action === 'marks') return {result: {value: {metrics, marks: [{id: 1, selector: '#send', role: 'button', name: 'Send', bbox: {x: 10, y: 20, width: 40, height: 20}, center: {x: 30, y: 30}, source: 'dom', hitTest: true}], candidateLimitReached: false}}};
                    if (args.action === 'resolve') {
                        if (args.target.selector === '.ambiguous') return {exceptionDetails: {text: 'Target is ambiguous'}};
                        if (args.target.selector === '#occluded') return {exceptionDetails: {text: 'Target is occluded'}};
                        return {result: {value: {point: args.target.x !== undefined ? args.target : {x: 30, y: 30}, target: {tag: 'button', role: 'button', name: 'Send'}, hit: {tag: 'button', name: 'Send'}, metrics}}};
                    }
                    if (args.action === 'observeStart') return {result: {value: {url: 'https://example.com', focus: null, dialogs: []}}};
                    if (args.action === 'observeEnd') return {result: {value: {focusMoved: true, mutationCount: 1, mutations: [{type: 'childList'}], events: [{type: 'click', trusted: true, target: {tag: 'button', name: 'Send'}}], newDialogs: []}}};
                }
                if (method === 'DOM.getFlattenedDocument') return {nodes: [{nodeType: 9, nodeId: 1}, {nodeType: 11, nodeId: 2, shadowRootType: 'closed'}, {nodeType: 1, nodeId: 3, backendNodeId: 13}]};
                if (method === 'DOM.querySelectorAll') return {nodeIds: params.nodeId === 2 ? [3] : []};
                if (method === 'Network.getResponseBody') return {body: 'x'.repeat(110000), base64Encoded: false};
                if (method === 'Runtime.evaluate') return {result: {value: {status: 200}}};
                if (method === 'Accessibility.getFullAXTree') return {nodes: [{role: {value: 'RootWebArea'}}, {role: {value: 'button'}}]};
                return {};
            }},
        userScripts: {configureWorld: async () => {}, execute: async ({target, world, js}) => {
            commands.push({method: 'userScripts.execute', target, world});
            const value = await vm.runInNewContext(js[0].code, {setTimeout, clearTimeout, performance});
            return (target.frameIds ?? [0]).map(frameId => ({frameId, documentId: 'doc', result: value}));
        }},
        scripting: {executeScript: async () => [{frameId: 0, result: {source: 'dom-derived', nodes: []}}]},
        runtime: {sendMessage: async msg => msg.type === 'CLIPBOARD_OFFSCREEN' ? msg.action === 'read' ? {text: 'clipboard text'} : {ok: true} : call(msg)},
        offscreen: {hasDocument: async () => true, Reason: {CLIPBOARD: 'CLIPBOARD'}},
        notifications: {create: async args => { commands.push({method: 'notify', params: args}); return 'notification-1'; }},
        downloads: {download: async args => { downloads.push(args); return 0; }, search: async ({id}) => [{id, state: 'complete'}], cancel: async () => {}},
    };
    const canvasOps = [];
    class Canvas {
        constructor(width, height) { this.width = width; this.height = height; }
        getContext() { return Object.fromEntries(['drawImage', 'scale', 'translate', 'strokeRect', 'fillRect', 'fillText', 'beginPath', 'moveTo', 'lineTo', 'stroke'].map(method => [method, (...args) => canvasOps.push({method, args})]).concat([
            ['measureText', text => ({width: text.length * 7})], ['getImageData', () => ({data: new Uint8ClampedArray(this.width * this.height * 4)})],
        ])); }
        async convertToBlob() { return new Blob(['png']); }
    }
    const load = createLoader({globals: {chrome, OffscreenCanvas: Canvas, createImageBitmap: async () => ({width: 800, height: 600, close() {}}),
        fetch: async () => ({blob: async () => new Blob(['png'])}), btoa: s => Buffer.from(s, 'binary').toString('base64')}, mocks: {'src/storage/scripts.ts': {
        loadScripts: async () => [
            {id: 'saved-1', name: 'Test', code: 'function main() { return 1; }', status: 'active', urlMatchPattern: 'https://example.com/*'},
            {id: 'paused-1', name: 'Paused', code: 'function main() {}', status: 'paused', urlMatchPattern: 'https://example.com/*'},
        ],
    }, 'src/storage/scriptValues.ts': {
        getScriptValue: async () => null, setScriptValue: async () => {}, deleteScriptValue: async () => {}, listScriptValues: async () => ({}),
    }}});
    const service = load('src/background/browser/browserService.ts');
    const call = message => service.handleBrowserMessage(message);
    const run = (operation, input) => call({type: 'BROWSER_CALL', operation, input});
    return {load, service, run, call, chrome, commands, saved, session, downloads, tabs, groups, canvasOps};
}

test('legacy stopped state does not block browser actions or recreate an audit log', async () => {
    const f = fixture({ts_browser_control: {stopped: true, epoch: 5}});
    await f.run('tabs', {action: 'create', url: 'https://example.com'});
    assert.equal(f.tabs.size, 2);
    assert.equal(f.saved.ts_browser_audit, undefined);
    for (const type of ['BROWSER_STOP', 'BROWSER_RESUME', 'BROWSER_STATUS', 'BROWSER_AUDIT', 'BROWSER_BEGIN', 'BROWSER_CHECK', 'BROWSER_END']) {
        await assert.rejects(f.call({type}), /Unknown browser message/);
    }
});

test('tab selection retargets existing page tools and popups track their opener', async () => {
    const f = fixture();
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const created = await invoke(tools, 'browserTabs', {action: 'create', url: 'https://example.com/popup', openerTabId: 7, group: 'Popup Check'});
    assert.equal(created.output.tabId, 8);
    assert.equal((await invoke(tools, 'getCurrentTab')).output.tabId, 8);
    assert.equal((await f.run('tabs', {action: 'waitPopup', openerTabId: 7})).tabId, 8);
    await invoke(tools, 'browserTabs', {action: 'select', tabId: 7});
    assert.equal((await invoke(tools, 'getCurrentTab')).output.tabId, 7);
    await assert.rejects(f.run('tabs', {action: 'create', url: 'chrome://extensions'}), /HTTP/);
});

test('tabs open in the background, move, pin, mute and form labelled groups', async () => {
    const f = fixture();
    const opened = await f.run('tabs', {action: 'create', url: 'https://example.com/later', background: true});
    assert.equal(opened.opened[0].tabId, 8);
    assert.equal(opened.tabId, undefined);
    assert.equal(f.tabs.get(8).active, false);
    assert.equal((await f.run('tabs', {action: 'pin', tabIds: [7, 8]})).tabs.length, 2);
    assert.equal(f.tabs.get(8).pinned, true);
    await f.run('tabs', {action: 'mute', tabId: 8});
    assert.equal(f.tabs.get(8).muted, true);
    await f.run('tabs', {action: 'unpin', tabId: 7});
    assert.equal(f.tabs.get(7).pinned, false);
    assert.equal((await f.run('tabs', {action: 'move', tabId: 8, index: 0})).tabs[0].index, 0);
    const grouped = await f.run('tabGroups', {action: 'group', tabIds: [7, 8], title: 'Research', color: 'blue'});
    assert.deepEqual(plain(grouped.group), {groupId: 1, windowId: 1, title: 'Research', color: 'blue', collapsed: false});
    await f.run('tabGroups', {action: 'update', groupId: 1, collapsed: true});
    const listed = await f.run('tabGroups', {action: 'list'});
    assert.deepEqual(plain(listed.groups[0].tabIds), [7, 8]);
    assert.equal(listed.groups[0].collapsed, true);
    await f.run('tabGroups', {action: 'ungroup', tabIds: [8]});
    assert.deepEqual(plain((await f.run('tabGroups', {action: 'list'})).groups[0].tabIds), [7]);
    assert.equal((await f.run('tabs', {action: 'list'})).tabs.find(t => t.tabId === 7).groupId, 1);
    await assert.rejects(f.run('tabGroups', {action: 'update', title: 'x'}), /groupId is required/);
});

test('task tabs open together in one named group, stay tied to their notes, and finish closes only them', async () => {
    const f = fixture();
    f.groups.set(50, {id: 50, windowId: 1, title: 'Mine', color: 'red', collapsed: false});
    f.tabs.get(7).groupId = 50;
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const task = input => f.run('tabs', {conversationId: 'test', originTabId: 7, ...input});
    await assert.rejects(task({action: 'create', url: 'https://www.awwwards.com/'}), /Name the task group/);
    const sites = ['https://www.awwwards.com/', 'https://www.behance.net/', 'https://dribbble.com/'];
    const opened = await invoke(tools, 'browserTabs', {action: 'create', urls: sites, group: 'Portfolio Inspiration', purpose: 'Portfolio references'});
    assert.deepEqual(plain(opened.output.opened.map(t => t.tabId)), [8, 9, 10]);
    assert.equal(opened.output.group.title, 'Portfolio Inspiration');
    const groupId = opened.output.group.groupId;
    assert.equal(f.groups.get(groupId).title, '🦥 Portfolio Inspiration');
    assert.deepEqual([8, 9, 10].map(id => f.tabs.get(id).groupId), [groupId, groupId, groupId]);
    assert.ok([8, 9, 10].every(id => !f.tabs.get(id).active), 'Several pages load in the background');
    assert.equal((await invoke(tools, 'getCurrentTab')).output.tabId, 7);
    assert.equal(f.tabs.get(7).groupId, 50, "The user's tab keeps its own group");

    const again = await invoke(tools, 'browserTabs', {action: 'create', url: 'https://dribbble.com/#shots'});
    assert.equal(again.output.tabId, 10);
    assert.equal(again.output.reused, true);
    assert.equal(f.tabs.size, 4, 'No duplicate tab');
    await f.chrome.tabs.create({url: 'https://dribbble.com/shots/1', openerTabId: 10});
    await task({action: 'list'});
    assert.equal(f.tabs.get(11).groupId, groupId, 'Links opened from a task tab join its group');

    await task({action: 'note', tabId: 8, note: 'Oversized serif headings'});
    await task({action: 'note', tabId: 9, retain: true});
    await task({action: 'note', tabId: 7, purpose: 'Portfolio being redesigned'});
    const listed = await task({action: 'list'});
    assert.deepEqual(plain(listed.task.tabs.find(t => t.tabId === 8).notes), ['Oversized serif headings']);
    assert.equal(listed.task.tabs.find(t => t.tabId === 7).owned, false);

    await assert.rejects(task({action: 'pin', tabId: 7}), /already open before this task/);
    await assert.rejects(task({action: 'close', tabIds: [7, 8]}), /already open/);
    await assert.rejects(f.run('tabGroups', {conversationId: 'test', action: 'update', groupId: 50, title: 'x'}), /not this task's group/);
    await task({action: 'pin', tabId: 7, userRequested: true});
    assert.equal(f.tabs.get(7).pinned, true);

    const finished = (await invoke(tools, 'browserTabs', {action: 'finish', keepTabIds: [10]})).output;
    assert.deepEqual(plain(finished.closed).sort((a, b) => a - b), [8, 11]);
    assert.deepEqual(plain(finished.kept).sort((a, b) => a - b), [9, 10]);
    assert.equal(finished.findings.find(x => x.tabId === 8).url, 'https://www.awwwards.com/');
    assert.deepEqual([...f.tabs.keys()].sort((a, b) => a - b), [7, 9, 10]);
    assert.deepEqual([9, 10].map(id => f.tabs.get(id).groupId), [-1, -1], 'Kept tabs leave the temporary group');
    assert.equal(f.tabs.get(7).groupId, 50);
    assert.ok(f.groups.has(50));
    assert.equal((await task({action: 'list'})).task, undefined);
    assert.deepEqual(plain((await task({action: 'finish'})).closed), []);
});

test('a chat started on a new tab page groups that tab with the task and keeps it at finish', async () => {
    const f = fixture();
    f.tabs.get(7).url = 'chrome://newtab/';
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const opened = await invoke(tools, 'browserTabs', {action: 'create', urls: ['https://www.behance.net/', 'https://dribbble.com/'], group: 'Portfolio Inspiration'});
    const groupId = opened.output.group.groupId;
    assert.deepEqual([7, 8, 9].map(id => f.tabs.get(id).groupId), [groupId, groupId, groupId]);
    await assert.rejects(f.run('tabs', {conversationId: 'test', originTabId: 7, action: 'close', tabIds: [7, 8]}), /working tab/);
    assert.ok(f.tabs.has(7) && f.tabs.has(8), 'A refused close closes nothing');
    f.tabs.set(30, {id: 30, windowId: 1, url: 'https://mine.example', groupId});
    const finished = (await invoke(tools, 'browserTabs', {action: 'finish'})).output;
    assert.deepEqual(plain(finished.kept), [7]);
    assert.deepEqual(plain(finished.closed).sort((a, b) => a - b), [8, 9]);
    assert.equal(f.tabs.get(7).groupId, -1, 'The working tab leaves the group');
    assert.ok(f.tabs.has(30), 'A tab the user dragged into the group stays open');
    assert.equal(f.tabs.get(30).groupId, -1, 'and leaves it, so the group is gone');
});

test('reference tabs are read in place while page actions stay on the working tab', async () => {
    const f = fixture();
    const targets = [];
    f.chrome.scripting.executeScript = async ({target}) => { targets.push(target.tabId); return [{result: {url: 'https://dribbble.com/', text: 'Shots'}}]; };
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const opened = await invoke(tools, 'browserTabs', {action: 'create', urls: ['https://dribbble.com/', 'https://www.behance.net/'], group: 'Portfolio Inspiration'});
    const [reference] = opened.output.opened.map(t => t.tabId);
    await invoke(tools, 'getPageText', {tabId: reference});
    await invoke(tools, 'getPageStructure', {tabId: reference});
    await invoke(tools, 'getPageText', {});
    assert.deepEqual(targets, [reference, reference, 7]);
    assert.equal((await invoke(tools, 'getCurrentTab')).output.tabId, 7, 'Reading a reference tab leaves the target alone');
    const selected = await invoke(tools, 'browserTabs', {action: 'select', tabId: reference});
    assert.equal(selected.output.workingTabId, 7);
    assert.equal((await invoke(tools, 'browserTabs', {action: 'select', tabId: 7})).output.workingTabId, undefined);
});

test('task groups carry the sloth prefix and green color, show waiting, and tidy away behind the working tab', async () => {
    const f = fixture();
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const opened = await invoke(tools, 'browserTabs', {action: 'create', urls: ['https://dribbble.com/', 'https://www.behance.net/'], group: '🦥 TS | Portfolio Inspiration'});
    const groupId = opened.output.group.groupId;
    assert.equal(opened.output.group.title, 'Portfolio Inspiration', 'A prefix the model typed is not doubled');
    assert.equal(f.groups.get(groupId).title, '🦥 Portfolio Inspiration');
    assert.equal(f.groups.get(groupId).color, 'green');

    await f.run('taskStatus', {conversationId: 'test', status: 'waiting'});
    assert.equal(f.groups.get(groupId).title, '🦥 ⏸ Portfolio Inspiration');
    assert.equal((await f.run('tabs', {action: 'list', conversationId: 'test'})).task.group.status, 'waiting');
    await f.run('taskStatus', {conversationId: 'test', status: 'working'});
    assert.equal(f.groups.get(groupId).title, '🦥 Portfolio Inspiration');
    await f.run('taskStatus', {conversationId: 'other', status: 'waiting'});

    await invoke(tools, 'browserTabGroups', {action: 'update', groupId, title: 'Portfolio Ideas', color: 'red'});
    assert.equal(f.groups.get(groupId).title, '🦥 Portfolio Ideas');
    assert.equal(f.groups.get(groupId).color, 'green', 'The agent cannot restyle away the TamperSloth look');

    await invoke(tools, 'browserTabs', {action: 'select', tabId: 8});
    assert.equal(f.groups.get(groupId).collapsed, false);
    await invoke(tools, 'browserTabs', {action: 'select', tabId: 7});
    assert.equal(f.groups.get(groupId).collapsed, true, 'Back on the working tab the references fold away');
});

test('leftover sloth groups from an earlier session are offered for closing, never closed unasked', async () => {
    const f = fixture();
    const notices = [];
    Object.assign(f.chrome.runtime, {onStartup: eventBus(), onInstalled: eventBus()});
    f.chrome.notifications = {create: async (id, options) => { notices.push({id, ...options}); return id; }, clear: async () => {}, onButtonClicked: eventBus()};
    f.groups.set(40, {id: 40, windowId: 1, title: '🦥 Laptop Comparison', color: 'green'});
    f.groups.set(41, {id: 41, windowId: 1, title: 'Work', color: 'green'});
    f.tabs.set(20, {id: 20, windowId: 1, url: 'https://a.example', groupId: 40});
    f.tabs.set(21, {id: 21, windowId: 1, url: 'https://b.example', groupId: 41});
    f.tabs.set(22, {id: 22, windowId: 1, url: 'https://example.com/editor', groupId: 40});
    f.saved.ts_task_origins = {old: 'https://example.com/editor'};
    f.load('src/background/browser/taskTabs.ts').installLeftoverGroupCheck();
    f.chrome.runtime.onStartup.fire();
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(notices.length, 1);
    assert.match(notices[0].message, /"Laptop Comparison" is still open from an earlier session \(1 tab\)/);
    assert.ok(f.tabs.has(20), 'Nothing closes before the user chooses');
    f.chrome.notifications.onButtonClicked.fire(notices[0].id, 0);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(f.tabs.has(20), false);
    assert.ok(f.tabs.has(21), "The user's own green group is untouched");
    assert.equal(f.tabs.get(22).groupId, -1, 'The tab a chat started in leaves the group instead of closing');
    assert.deepEqual(plain(f.saved.ts_task_origins), {});
});

test('a task keeps at most the configured number of tabs open, not counting the working tab', async () => {
    const f = fixture({ts_agent_settings: {maxTaskTabs: 2}});
    f.tabs.get(7).url = 'chrome://newtab/';
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const task = input => f.run('tabs', {conversationId: 'test', originTabId: 7, originBlank: true, ...input});
    await assert.rejects(task({action: 'create', urls: ['https://a.example/', 'https://b.example/', 'https://c.example/'], group: 'Limits'}), /2 tabs open|0 of 2/);
    assert.equal(f.tabs.size, 1, 'Over the limit nothing opens');
    const opened = await invoke(tools, 'browserTabs', {action: 'create', urls: ['https://a.example/', 'https://b.example/'], group: 'Limits'});
    assert.equal(opened.output.opened.length, 2);
    assert.equal(f.tabs.get(7).groupId, opened.output.group.groupId, 'The working tab joins but does not count');
    assert.equal((await task({action: 'create', url: 'https://a.example/#top'})).reused, true, 'Reusing a tab is always allowed');
    await assert.rejects(task({action: 'create', url: 'https://c.example/'}), /Tab limit: this task has 2 of 2/);
    await task({action: 'close', tabId: opened.output.opened[0].tabId});
    assert.ok((await task({action: 'create', url: 'https://c.example/', background: true})).opened[0].tabId);
});

test('raw JS uses isolated world, structured values and per-frame errors', async () => {
    const f = fixture();
    const result = await f.run('evaluate', {tabId: 7, frameIds: [0, 2], code: 'return {answer: await Promise.resolve(42), large: 12n};'});
    assert.equal(f.commands.at(-1).world, 'USER_SCRIPT');
    assert.equal(result.frames.length, 2);
    assert.deepEqual(plain(result.frames[0].result.value), {answer: 42, large: {type: 'bigint', value: '12'}});
    const failure = await f.run('evaluate', {tabId: 7, code: 'throw new TypeError("bad value");'});
    assert.equal(failure.frames[0].result.ok, false);
    assert.equal(failure.frames[0].result.error.name, 'TypeError');
    const timeout = await f.run('evaluate', {tabId: 7, code: 'await new Promise(() => {});', timeoutMs: 100});
    assert.match(timeout.frames[0].result.error.message, /timed out/);
    await f.run('evaluate', {tabId: 7, code: 'return null;', world: 'MAIN'});
    assert.equal(f.commands.at(-1).world, 'MAIN');
});

test('persistent namespaces and site recipes round-trip independently of service lifetime', async () => {
    const f = fixture();
    await f.run('store', {action: 'set', namespace: 'site:a', key: '__proto__', value: {count: 3}});
    await f.run('store', {action: 'set', namespace: 'site:b', key: '__proto__', value: false});
    const restarted = fixture(f.saved);
    assert.deepEqual(plain(await restarted.run('store', {action: 'get', namespace: 'site:a', key: '__proto__'})), {found: true, value: {count: 3}});
    assert.equal((await restarted.run('store', {action: 'get', namespace: 'site:b', key: '__proto__'})).value, false);
    await restarted.run('recipes', {action: 'save', id: 'recipe-1', recipe: {name: 'Search', origin: 'https://example.com/path', steps: ['Find search field', 'Enter query']}});
    assert.equal((await restarted.run('recipes', {action: 'get', id: 'recipe-1'})).recipe.origin, 'https://example.com');
    await assert.rejects(restarted.run('recipes', {action: 'save', id: '__proto__', recipe: {name: 'x', origin: 'https://example.com', steps: ['x']}}), /Invalid recipe/);
});

test('shared CDP attachment captures WebSockets with bounded buffers and releases on stop', async () => {
    const f = fixture();
    await Promise.all([f.run('network', {action: 'start', tabId: 7}), f.run('network', {action: 'start', tabId: 7})]);
    assert.equal(f.commands.filter(c => c.method === 'attach').length, 1);
    for (let i = 0; i < 505; i++) f.chrome.debugger.onEvent.fire({tabId: 7}, 'Network.webSocketFrameReceived', {requestId: 'ws', response: {payloadData: String(i)}});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Network.webSocketFrameSent', {requestId: 'ws', response: {payloadData: 'x'.repeat(30000)}});
    const read = await f.run('network', {action: 'read', tabId: 7});
    assert.equal(read.events.length, 500);
    assert.equal(read.dropped, 6);
    assert.equal(read.events.at(-1).params.truncated, true);
    assert.equal((await f.run('network', {action: 'read', tabId: 7, after: read.cursor})).events.length, 0);
    const body = await f.run('network', {action: 'body', tabId: 7, requestId: 'request-1'});
    assert.equal(body.body.length, 100000);
    assert.equal(body.truncated, true);
    await f.run('network', {action: 'stop', tabId: 7});
    assert.deepEqual(plain(f.service.cdp.status()), []);
    assert.ok(f.commands.some(c => c.method === 'detach'));
});

test('child frame sessions and closed shadow roots can be inspected', async () => {
    const f = fixture();
    await f.run('network', {action: 'start', tabId: 7});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Target.attachedToTarget', {sessionId: 'child', targetInfo: {type: 'iframe', url: 'https://other.example'}});
    await tick();
    f.chrome.debugger.onEvent.fire({tabId: 7, sessionId: 'child'}, 'Runtime.executionContextCreated', {context: {id: 5, auxData: {frameId: 'frame-2'}}});
    const frames = await f.run('dom', {action: 'frames', tabId: 7});
    assert.equal(frames.sessions[0].sessionId, 'child');
    assert.equal(frames.contexts[0].id, 5);
    assert.ok(f.commands.some(c => c.target.sessionId === 'child' && c.method === 'Target.setAutoAttach'));
    assert.deepEqual(plain((await f.run('dom', {action: 'query', tabId: 7, sessionId: 'child', selector: 'button'})).nodeIds), [3]);
    assert.ok(f.commands.some(c => c.method === 'DOM.getFlattenedDocument' && c.params.pierce));
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Target.detachedFromTarget', {sessionId: 'child'});
    await assert.rejects(f.run('dom', {action: 'snapshot', tabId: 7, sessionId: 'child'}), /Unknown or detached/);
});

test('trusted mouse/key/touch/drag dispatch validated CDP sequences', async () => {
    const f = fixture();
    await f.run('input', {tabId: 7, action: 'mouse', type: 'mouseMoved', x: 10, y: 20});
    await f.run('input', {tabId: 7, action: 'key', type: 'keyDown', key: 'Enter', code: 'Enter', keyCode: 13});
    await f.run('input', {tabId: 7, action: 'touch', type: 'touchStart', points: [{x: 10, y: 20, id: 0}]});
    await f.run('input', {tabId: 7, action: 'drag', from: {x: 0, y: 0}, to: {x: 100, y: 200}, steps: 2});
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchKeyEvent' && c.params.windowsVirtualKeyCode === 13));
    assert.equal(f.commands.filter(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mouseReleased').length, 1);
    await assert.rejects(f.run('input', {tabId: 7, action: 'touch', type: 'touchEnd', points: [{x: 0, y: 0}]}), /empty points/);
    await assert.rejects(f.run('input', {tabId: 7, action: 'mouse', type: 'arbitraryCommand', x: 0, y: 0}), /Invalid mouse/);
});

test('captured request replay preserves method/body and uses page credentials', async () => {
    const f = fixture();
    await f.run('network', {action: 'start', tabId: 7});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Network.requestWillBeSent', {requestId: 'post', request: {url: 'https://example.com/api', method: 'POST', postData: 'hello', headers: {Cookie: 'secret', 'Content-Type': 'text/plain'}}});
    await f.run('network', {action: 'replay', tabId: 7, requestId: 'post'});
    const expression = f.commands.find(c => c.method === 'Runtime.evaluate').params.expression;
    assert.ok(expression.includes('"method":"POST"'));
    assert.ok(expression.includes('"body":"hello"'));
    assert.ok(expression.includes('"credentials":"include"'));
    assert.ok(!expression.includes('secret'));
    await assert.rejects(f.run('network', {action: 'replay', tabId: 7, requestId: 'missing'}), /unavailable/);
});

test('clipboard, downloads, notifications and AX trees use their extension APIs', async () => {
    const f = fixture();
    assert.equal((await f.run('clipboard', {action: 'read'})).text, 'clipboard text');
    await f.run('clipboard', {action: 'write', text: 'new text'});
    assert.equal((await f.run('download', {action: 'start', url: 'https://example.com/file', filename: 'report.txt'})).downloadId, 0);
    assert.equal((await f.run('download', {action: 'status', downloadId: 0})).downloads[0].state, 'complete');
    assert.equal((await f.run('notify', {title: 'Done', message: 'Task finished'})).notificationId, 'notification-1');
    const tree = await f.run('accessibility', {tabId: 7, mode: 'cdp', maxNodes: 1});
    assert.equal(tree.nodes.length, 1);
    assert.equal(tree.truncated, true);
    assert.equal((await f.run('accessibility', {tabId: 7})).frames[0].result.source, 'dom-derived');
});

test('ordinary tools do not require the removed automation service', async () => {
    const f = fixture({ts_browser_control: {stopped: true}});
    const raw = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    raw.getCurrentTab.execute = async () => ({tabId: 7});
    f.chrome.runtime.sendMessage = async () => { assert.fail('Unexpected automation IPC'); };
    const runtime = f.load('src/agent/tools/toolRuntime.ts').createToolRuntime(raw, {request: '', findPrevious: () => undefined});
    assert.equal((await invoke(runtime.tools, 'getCurrentTab')).output.tabId, 7);
});

test('chat cancellation still prevents later page mutations', async () => {
    const f = fixture();
    const controller = new AbortController();
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test', abortSignal: controller.signal});
    let injected = false;
    f.chrome.scripting.executeScript = async () => { injected = true; return [{result: {text: 'x'}}]; };
    controller.abort();
    await assert.rejects(invoke(tools, 'getPageText'), {name: 'AbortError'});
    assert.equal(injected, false);
});

test('saved scripts recover from legacy stopped state and browser messages remain restricted', async () => {
    const f = fixture({ts_browser_control: {stopped: true, epoch: 3}, ts_browser_audit: [{operation: 'killSwitch'}]});
    let registrations = [];
    Object.assign(f.chrome.runtime, {id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path,
        onMessage: eventBus(), onUserScriptMessage: eventBus()});
    f.chrome.storage.onChanged = eventBus();
    f.chrome.tabs.onUpdated = eventBus();
    f.chrome.sidePanel = {setOptions: async () => {}, open: async () => {}};
    f.chrome.action.onClicked = eventBus();
    f.chrome.alarms = {create: async () => {}, onAlarm: eventBus()};
    Object.assign(f.chrome.userScripts, {getScripts: async () => registrations,
        register: async scripts => { registrations = scripts; }, unregister: async () => { registrations = []; },
        getWorldConfigurations: async () => [], resetWorldConfiguration: async () => {}});
    f.load('src/background/index.ts');
    // Registration waits on the scripts' tokens and world configuration first.
    for (let i = 0; i < 5; i++) await tick();
    assert.equal(registrations.length, 1);
    assert.equal(registrations[0].id, 'tampersloth_saved-1', 'Paused scripts stay paused');
    const listener = [...f.chrome.runtime.onMessage.listeners][0];
    const send = (message, sender) => new Promise(resolve => listener(message, sender, resolve));
    const denied = await send({type: 'BROWSER_CALL', operation: 'tabs', input: {action: 'list'}}, {id: 'extension-id', url: 'https://evil.example', tab: {id: 7}});
    assert.match(denied.error, /restricted/);
    // The pricing page's relay asks from a tab too; the pricing bridge answers it, not this refusal.
    let refused = false;
    const pricingSender = {id: 'extension-id', url: 'https://tampersloth.com/pricing', tab: {id: 7}, frameId: 0};
    assert.equal(listener({type: 'PRICING_BILLING_TOKEN'}, pricingSender, () => { refused = true; }), false);
    assert.equal(refused, false);
    // The pricing bridge answers only the pricing page itself, and only after a click or in a tab the extension opened.
    const bridge = [...f.chrome.runtime.onMessage.listeners][1];
    const ask = (sender, clicked) => new Promise(resolve => {
        if (!bridge({type: 'PRICING_BILLING_TOKEN', clicked}, sender, resolve)) resolve('ignored');
    });
    assert.equal(await ask({...pricingSender, url: 'https://demo.tampersloth.com/pricing'}, true), 'ignored');
    assert.equal(await ask({...pricingSender, url: 'https://tampersloth.com/'}, true), 'ignored');
    const needsClick = JSON.stringify({ok: false, reason: 'needs-click'});
    assert.equal(JSON.stringify(await ask(pricingSender, false)), needsClick);
    f.session[`ts_pricing_tab_7`] = Date.now() + 60_000;
    assert.notEqual(JSON.stringify(await ask(pricingSender, false)), needsClick, 'A tab the extension opened needs no click');
    assert.equal(f.saved.ts_browser_control, undefined);
    assert.equal(f.saved.ts_browser_audit, undefined);
    const sender = {id: 'extension-id', url: 'chrome-extension://extension-id/index.html'};
    assert.match((await send({type: 'BROWSER_STOP'}, sender)).error, /Unknown browser message/);
    assert.equal(registrations.length, 1);
    assert.equal((await send({type: 'BROWSER_CALL', operation: 'tabs', input: {action: 'list'}}, sender)).tabs.length, 1);
    const scriptListener = [...f.chrome.runtime.onUserScriptMessage.listeners][0];
    const fromScript = message => new Promise(resolve => scriptListener(message, {}, resolve));
    // A script's values answer only to the token baked into its own registered code.
    const token = f.saved.ts_script_tokens['saved-1'];
    assert.ok(registrations[0].js[0].code.includes(JSON.stringify(token)));
    assert.equal((await fromScript({type: 'SCRIPT_SET_VALUE', scriptId: 'saved-1', key: 'count', value: 1})).denied, true);
    assert.equal((await fromScript({type: 'SCRIPT_SET_VALUE', scriptId: 'saved-1', token: 'guess', key: 'count', value: 1})).denied, true);
    assert.equal((await fromScript({type: 'SCRIPT_SET_VALUE', scriptId: 'saved-1', token, key: 'count', value: 1})).ok, true);
});

test('offscreen clipboard accepts the owning service worker without a page URL', async () => {
    const onMessage = eventBus();
    let text = '';
    const load = createLoader({globals: {
        navigator: {clipboard: {writeText: async value => { text = value; }, readText: async () => text}},
        chrome: {runtime: {id: 'extension-id', getURL: path => 'chrome-extension://extension-id/' + path, onMessage}},
    }});
    load('src/background/clipboard.ts');
    const listener = [...onMessage.listeners][0];
    const send = message => new Promise(resolve => listener(message, {id: 'extension-id'}, resolve));
    assert.equal((await send({type: 'CLIPBOARD_OFFSCREEN', action: 'write', text: 'hello'})).ok, true);
    assert.equal((await send({type: 'CLIPBOARD_OFFSCREEN', action: 'read'})).text, 'hello');
    assert.equal(listener({type: 'CLIPBOARD_OFFSCREEN', action: 'read'}, {id: 'other-extension'}, () => assert.fail('Unexpected response')), false);
});

test('marked screenshots preserve legend and pixel transforms through zoom and image projection', async () => {
    const f = fixture();
    const marked = await f.run('perception', {tabId: 7});
    assert.equal(marked.legend[0].name, 'Send');
    assert.equal(marked.legend[0].hitTest, true);
    assert.equal(marked.metadata.devicePixelRatio, 2);
    assert.equal(marked.metadata.imagePixels.width, 800);
    assert.equal(marked.metadata.devicePixelsPerCSSPixel.x, 2);
    const grid = await f.run('perception', {tabId: 7, mode: 'grid'});
    const zoom = await f.run('perception', {tabId: 7, mode: 'grid', snapshotId: grid.snapshotId, region: 'C3', scale: 3, gridSize: 10, crosshair: {x: 250, y: 250}});
    assert.deepEqual(plain(zoom.metadata.cssRegion), {x: 200, y: 200, width: 100, height: 100});
    assert.deepEqual(plain(zoom.metadata.imagePixels), {width: 600, height: 600});
    assert.equal(zoom.cells[0].x, 200);
    assert.ok(f.canvasOps.some(op => op.method === 'moveTo' && op.args[0] === 238));
    const tools = f.load('src/agent/tools/createAgentTools.ts').createAgentTools({conversationId: 'test'});
    const runtime = f.load('src/agent/tools/toolRuntime.ts').createToolRuntime(tools, {request: 'screenshot', findPrevious: () => undefined});
    const projected = await invoke(runtime.tools, 'takeMarkedScreenshot');
    assert.equal(projected.projected.value[0].mediaType, 'image/png');
    assert.ok(projected.projected.value[1].text.includes('"legend"'));
    const recovered = await invoke(runtime.tools, 'readToolResult', {resultId: projected.id});
    assert.equal(recovered.projected.value[0].mediaType, 'image/png');
    assert.ok(recovered.projected.value[1].text.includes('Send'));
});

test('raced marked screenshots rebuild their legend with the replacement image and post-action views verify freshness', async () => {
    const f = fixture();
    const original = f.chrome.debugger.sendCommand;
    let revision = 0, captures = 0;
    f.chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothScreenshot')) {
            return {result: {value: {key: `doc:${revision}`, settled: true, visible: true}}};
        }
        const result = await original(target, method, params);
        if (method === 'Runtime.evaluate' && params.expression.includes('__tamperSlothPerception') && params.expression.endsWith('})')) {
            if (result.result?.value?.marks) result.result.value.marks[0].name = revision ? 'Updated control' : 'Old control';
        }
        if (method === 'Page.captureScreenshot' && ++captures === 1) revision++;
        return result;
    };
    const screenshot = await f.run('perception', {tabId: 7});
    assert.equal(captures, 2);
    assert.equal(screenshot.legend[0].name, 'Updated control');
    assert.equal(screenshot.metadata.freshness.attempts, 2);
    const action = await f.run('gesture', {tabId: 7, target: {selector: '#send'}, feedbackMs: 0, postScreenshot: true});
    assert.equal(action.postAction.metadata.freshness.attempts, 1);
    assert.equal(action.postAction.metadata.freshness.settled, true);
    assert.ok(action.screenshot.startsWith('data:image/png'));
});

test('semantic and marked clicks return feedback and prevent ambiguous or occluded input', async () => {
    const f = fixture();
    const click = await f.run('gesture', {tabId: 7, target: {selector: '#send'}, feedbackMs: 0});
    assert.deepEqual(plain(click.resolved.point), {x: 30, y: 30});
    assert.equal(click.feedback.events[0].target.name, 'Send');
    assert.equal(click.feedback.focusMoved, true);
    const snapshot = await f.run('perception', {tabId: 7});
    await f.run('gesture', {tabId: 7, target: {mark: 1, snapshotId: snapshot.snapshotId}, feedbackMs: 0});
    const count = f.commands.filter(c => c.method === 'Input.dispatchMouseEvent').length;
    await assert.rejects(f.run('gesture', {tabId: 7, target: {selector: '.ambiguous'}, feedbackMs: 0}), /ambiguous/);
    await assert.rejects(f.run('gesture', {tabId: 7, target: {selector: '#occluded'}, feedbackMs: 0}), /occluded/);
    await assert.rejects(f.run('gesture', {tabId: 7, target: {mark: 1, snapshotId: 'missing'}, feedbackMs: 0}), /expired/);
    assert.equal(f.commands.filter(c => c.method === 'Input.dispatchMouseEvent').length, count);
});

test('role targets look up only matching AX nodes and recheck the same node after hover', async () => {
    const f = fixture(), original = f.chrome.debugger.sendCommand;
    f.chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === 'Accessibility.queryAXTree') {
            f.commands.push({target, method, params});
            return {nodes: [{role: {value: 'button'}, name: {value: 'Send'}, backendDOMNodeId: 21}, {role: {value: 'button'}, name: {value: 'Send'}, ignored: true, backendDOMNodeId: 22}]};
        }
        if (method === 'Runtime.callFunctionOn' && params.functionDeclaration.includes('__tamperSlothPerception')) {
            f.commands.push({target, method, params});
            return {result: {value: {point: {x: 30, y: 30}, target: {tag: 'button', role: 'button', name: 'Send'}, hit: {tag: 'button', name: 'Send'}, metrics: {}}}};
        }
        return original(target, method, params);
    };
    const click = await f.run('gesture', {tabId: 7, target: {role: 'button', name: 'Send'}, feedbackMs: 0});
    assert.equal(click.resolved.target.name, 'Send');
    const methods = f.commands.map(c => c.method);
    assert.equal(methods.filter(m => m === 'Accessibility.queryAXTree').length, 1, 'The hover recheck reuses the node it found');
    assert.equal(methods.includes('Accessibility.getFullAXTree'), false);
    assert.deepEqual(plain(f.commands.find(c => c.method === 'Accessibility.queryAXTree').params), {objectId: 'doc', accessibleName: 'Send', role: 'button'});
    assert.deepEqual(f.commands.filter(c => c.method === 'DOM.resolveNode').map(c => c.params.backendNodeId), [21, 21]);
    // Substring names cannot be queried exactly, so they still read the whole tree.
    await f.run('gesture', {tabId: 7, target: {role: 'button', name: 'Sen', exact: false}, feedbackMs: 0});
    assert.ok(f.commands.some(c => c.method === 'Accessibility.getFullAXTree'));
});

test('marks beyond the DOM scan are resolved in batches instead of three calls per node', async () => {
    const f = fixture(), original = f.chrome.debugger.sendCommand, batches = [];
    f.chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === 'DOMDebugger.getEventListeners') return {listeners: Array.from({length: 60}, (_, i) => ({type: 'click', backendNodeId: 100 + i}))};
        if (method === 'Runtime.callFunctionOn' && params.functionDeclaration.includes('...elements')) {
            batches.push(params.arguments.length - 1);
            return {result: {value: params.arguments.slice(1).map((_, i) => ({id: 2 + i, name: 'Extra', bbox: {x: 1, y: 1, width: 5, height: 5}, center: {x: 3, y: 3}, source: 'dom'}))}};
        }
        return original(target, method, params);
    };
    const shot = await f.run('perception', {tabId: 7, maxMarks: 20});
    assert.deepEqual(batches, [50], 'One call marks a whole batch');
    assert.equal(shot.legend.length, 20);
    assert.equal(shot.candidateLimitReached, true);
    assert.equal(shot.clickHandlerCoverage.inspected, 50);
    assert.ok(f.commands.some(c => c.method === 'Runtime.releaseObjectGroup'), 'Batch objects are released together');
});

test('composite keyboard and touch gestures create complete input sequences', async () => {
    const f = fixture();
    await f.run('gesture', {tabId: 7, action: 'press', chord: 'Ctrl+Shift+K', feedbackMs: 0});
    const keys = f.commands.filter(c => c.method === 'Input.dispatchKeyEvent').map(c => `${c.params.type}:${c.params.key}`);
    assert.deepEqual(keys, ['keyDown:Control', 'keyDown:Shift', 'keyDown:K', 'keyUp:K', 'keyUp:Shift', 'keyUp:Control']);
    await f.run('gesture', {tabId: 7, action: 'pinch', target: {x: 200, y: 150}, factor: 2, steps: 2, duration: 0, feedbackMs: 0});
    const touches = f.commands.filter(c => c.method === 'Input.dispatchTouchEvent');
    assert.equal(touches.length, 4);
    assert.equal(touches[0].params.touchPoints.length, 2);
    assert.equal(touches.at(-1).params.type, 'touchEnd');
    assert.deepEqual(plain(touches.at(-1).params.touchPoints), []);
});

test('nested cross-origin frame offsets compose before trusted input dispatch', async () => {
    const f = fixture();
    const original = f.chrome.debugger.sendCommand;
    f.chrome.debugger.sendCommand = async (target, method, params) => {
        if (method === 'Page.getFrameTree') {
            const tree = target.sessionId === 'nested'
                ? {frame: {id: 'nested-frame', parentId: 'child-frame'}}
                : target.sessionId === 'child'
                    ? {frame: {id: 'child-frame', parentId: 'main'}, childFrames: [{frame: {id: 'nested-frame', parentId: 'child-frame'}}]}
                    : {frame: {id: 'main'}, childFrames: [{frame: {id: 'child-frame', parentId: 'main'}}]};
            return {frameTree: tree};
        }
        if (method === 'DOM.getFrameOwner') return {backendNodeId: 55};
        if (method === 'Runtime.callFunctionOn' && params.functionDeclaration.includes('DOMMatrix')) return {result: {value: target.sessionId === 'child' ? {x: 10, y: 20, scaleX: 2, scaleY: 2} : {x: 100, y: 50, scaleX: 1, scaleY: 1}}};
        return original(target, method, params);
    };
    await f.run('network', {action: 'start', tabId: 7});
    f.chrome.debugger.onEvent.fire({tabId: 7}, 'Target.attachedToTarget', {sessionId: 'child', targetInfo: {type: 'iframe', targetId: 'child-frame'}});
    f.chrome.debugger.onEvent.fire({tabId: 7, sessionId: 'child'}, 'Target.attachedToTarget', {sessionId: 'nested', targetInfo: {type: 'iframe', targetId: 'nested-frame'}});
    await tick();
    const click = await f.run('gesture', {tabId: 7, sessionId: 'nested', target: {selector: '#send'}, feedbackMs: 0});
    assert.deepEqual(plain(click.resolved.localPoint), {x: 30, y: 30});
    assert.deepEqual(plain(click.resolved.point), {x: 170, y: 130});
    const press = f.commands.find(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mousePressed');
    assert.equal(press.target.sessionId, undefined, 'Input uses the root main-frame viewport');
    assert.equal(press.params.x, 170);
    assert.equal(press.params.y, 130);
});

test('network capture stop releases raw held keys, mouse and touch before debugger detach', async () => {
    const f = fixture();
    await f.run('input', {tabId: 7, action: 'key', type: 'keyDown', key: 'Control', code: 'ControlLeft', keyCode: 17, feedbackMs: 0});
    await f.run('input', {tabId: 7, action: 'mouse', type: 'mousePressed', x: 10, y: 10, button: 'left', feedbackMs: 0});
    await f.run('input', {tabId: 7, action: 'touch', type: 'touchStart', points: [{x: 20, y: 20, id: 0}], feedbackMs: 0});
    await f.run('network', {action: 'stop', tabId: 7});
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchKeyEvent' && c.params.type === 'keyUp'));
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mouseReleased'));
    assert.ok(f.commands.some(c => c.method === 'Input.dispatchTouchEvent' && c.params.type === 'touchEnd'));
    const release = f.commands.findIndex(c => c.method === 'Input.dispatchKeyEvent' && c.params.type === 'keyUp');
    const detach = f.commands.findIndex(c => c.method === 'detach');
    assert.ok(release < detach);
});

test('manifest and build entries include all platform permissions and clipboard service', () => {
    const manifest = JSON.parse(fs.readFileSync('public/manifest.json', 'utf8'));
    for (const permission of ['tabGroups', 'debugger', 'downloads', 'notifications', 'clipboardRead', 'clipboardWrite', 'offscreen']) assert.ok(manifest.permissions.includes(permission));
    assert.ok(fs.readFileSync('vite.config.ts', 'utf8').includes('clipboard.html'));
});

test('gesture projection keeps only outcome signals and flags problems', () => {
    const {compactGestureOutput, compactGestureSteps} = createLoader({globals: {chrome: {}}})('src/agent/tools/browserTools.ts');
    const target = {tag: 'button', role: 'button', name: 'Send', selector: '#send'};
    const focus = {tag: 'input', role: 'textbox', name: 'Message', selector: '#msg'};
    const other = {tag: 'div', role: '', name: 'Overlay', selector: '#overlay'};
    const result = (events, {targetMatched = true, actualHit = target, after = 'https://a.test/'} = {}) => ({ok: true, action: 'click',
        resolved: {point: {x: 5, y: 5}, localPoint: {x: 5, y: 5}, frameOffset: {x: 0, y: 0, scaleX: 1, scaleY: 1},
            bbox: {x: 0, y: 0, width: 10, height: 10}, target, hit: target, metrics: {url: 'https://a.test/', scroll: {x: 0, y: 0}}},
        feedback: {before: {url: 'https://a.test/', focus: null, scroll: {x: 0, y: 0}, dialogs: []}, after: {url: after, focus, scroll: {x: 0, y: 0}, dialogs: []},
            focusMoved: true, urlChanged: after !== 'https://a.test/', newDialogs: [], mutationCount: 3, mutations: [{type: 'childList'}], events,
            actualHit, expectedTarget: target, targetMatched, tabURL: {before: 'https://a.test/', after}, javascriptDialogs: []}});
    const events = [{type: 'mousedown', trusted: true, target, hit: target}, {type: 'click', trusted: true, target, hit: target}];

    assert.deepEqual(plain(compactGestureOutput(result(events))), {target: 'button "Send"', focus: 'textbox "Message"', mutations: 3});
    assert.equal(compactGestureOutput(result(events, {after: 'https://a.test/next'})).url, 'https://a.test/next');
    assert.equal(compactGestureOutput(result(events, {targetMatched: false, actualHit: other})).landedOn, 'div "Overlay"');
    assert.equal(compactGestureOutput(result([])).noInputEvents, true);
    assert.deepEqual(plain(compactGestureOutput(result([{...events[0], trusted: false}])).untrustedEvents), ['mousedown']);
    const lost = plain(compactGestureOutput({ok: true, action: 'click', resolved: {target}, feedback: {observationLost: true, tabURL: {before: 'https://a.test/', after: 'https://b.test/'}}}));
    assert.deepEqual(lost, {target: 'button "Send"', observationLost: true, url: 'https://b.test/'});

    const drag = {ok: true, action: 'drag', resolved: {from: {target: {tag: 'canvas', role: 'canvas', name: ''}}, to: {target: {tag: 'canvas', role: 'canvas', name: ''}}},
        feedback: {events: [], mutationCount: 0, tabURL: {before: 'https://a.test/', after: 'https://a.test/'}}};
    assert.deepEqual(plain(compactGestureSteps([drag, drag])), [{target: 'canvas', mutations: 0}, {mutations: 0}]);
});

test('browserGesture runs a batch in order and reports completed steps on failure', async () => {
    const calls = [];
    let failAt = -1;
    const chrome = {runtime: {sendMessage: async ({operation, input}) => {
        calls.push({operation, input});
        if (calls.length - 1 === failAt) return {error: 'Target is occluded'};
        const feedback = {events: [{type: 'mousedown', trusted: true}], mutationCount: 1, mutations: [{type: 'childList'}], targetMatched: true,
            tabURL: {before: 'https://a.test/', after: 'https://a.test/'}};
        return {ok: true, action: input.action, resolved: {point: {x: 1, y: 1}, metrics: {url: 'https://a.test/', scroll: {x: 0, y: 0}}}, feedback,
            ...(input.postScreenshot ? {screenshot: 'data:image/png;base64,aW1hZ2U=', postAction: {metadata: {imagePixels: {width: 200, height: 150}, cssRegion: {x: 0, y: 0, width: 200, height: 150}}}} : {})};
    }}};
    const load = createLoader({globals: {chrome}});
    const {browserSchemas} = load('src/shared/browserSchemas.ts');
    const tools = load('src/agent/tools/browserTools.ts').createBrowserTools(() => 7, () => {});
    const input = tools.browserGesture.inputSchema.parse({feedbackMs: 0, postScreenshot: true, gestures: [
        {action: 'drag', from: {x: 10, y: 10}, to: {x: 90, y: 10}},
        {action: 'drag', from: {x: 90, y: 10}, to: {x: 90, y: 60}},
        {action: 'press', chord: 'Escape'},
    ]});
    const output = await tools.browserGesture.execute(input, {abortSignal: new AbortController().signal});
    assert.equal(output.ok, true);
    assert.equal(output.steps, 3);
    assert.deepEqual(calls.map(call => [call.input.action, call.input.tabId, call.input.feedbackMs, call.input.postScreenshot]),
        [['drag', 7, 0, false], ['drag', 7, 0, false], ['press', 7, 0, true]]);
    // Every step must still satisfy the browser service's full schema.
    for (const call of calls) assert.ok(browserSchemas.gesture.safeParse(call.input).success);
    assert.ok(output.screenshot);
    assert.equal(output.results[2].screenshot, undefined);
    const projected = tools.browserGesture.toModelOutput({output});
    assert.equal(projected.type, 'content');
    const text = JSON.parse(projected.value[1].text);
    assert.deepEqual(text, {ok: true, results: [{mutations: 1}, {mutations: 1}, {mutations: 1}],
        screenshotRegion: {x: 0, y: 0, width: 200, height: 150}});

    calls.length = 0; failAt = 1;
    const failed = await tools.browserGesture.execute(input, {abortSignal: new AbortController().signal});
    assert.equal(failed.failedStep, 1);
    assert.match(failed.error, /occluded/);
    assert.equal(failed.completed.length, 1);
    assert.equal(calls.length, 2);

    calls.length = 0; failAt = 0;
    await assert.rejects(tools.browserGesture.execute(input, {abortSignal: new AbortController().signal}), /occluded/);
});

test('compact gesture schemas reject incomplete targets and clickTarget always clicks', async () => {
    const calls = [];
    const chrome = {runtime: {sendMessage: async ({input}) => { calls.push(input); return {ok: true}; }}};
    const tools = createLoader({globals: {chrome}})('src/agent/tools/browserTools.ts').createBrowserTools(() => 7, () => {});
    assert.equal(tools.clickTarget.inputSchema.safeParse({target: {role: 'button'}}).success, false);
    assert.equal(tools.clickTarget.inputSchema.safeParse({target: {mark: 3}}).success, false);
    assert.equal(tools.browserGesture.inputSchema.safeParse({gestures: []}).success, false);
    await tools.clickTarget.execute(tools.clickTarget.inputSchema.parse({target: {role: 'button', name: 'Send'}}), {});
    assert.equal(calls[0].action, 'click');
    assert.equal(calls[0].tabId, 7);
});
