import type {BackgroundScript, ImportedUserscript, ScriptExecutionLog} from "@/src/chat/lib/types.ts";
import {handleBrowserMessage, cdp} from './browserService';
import {captureAnnotatedViewport, captureRegion, captureViewportScreenshot} from './screenshotCapture';
import {installPanelLifecycle, cleanupBrowserGuidance} from './panelLifecycle';
import {installContextMenu} from './contextMenu';
import {installLeftoverGroupCheck} from './taskTabs';
import {BILLING_TOKEN_REQUEST, installPricingBridge} from './pricingBridge';
import {GREASYFORK_INSTALL, installGreasyForkButton, USERSCRIPT_INSTALLED} from './greasyForkButton';
import {queuePanelRequest} from '../chat/lib/panelRequests';
import {userscriptRegistrations, userscriptWorldId} from './userscriptRuntime';
import {handleGmRequest, installGmTabTracking} from './userscriptBridge';
import {installUserscriptHost, pushToScript, refreshUserscriptMenus} from './userscriptHost';
import {CONNECT_DECISION, installConnectPrompt} from './connectPrompt';
import {installUserscriptLinks} from './userscriptLinks';
import {CHECK_USERSCRIPT_UPDATE, installUserscriptUpdates} from './userscriptUpdates';
import {
    deleteScriptValue,
    getScriptValue,
    listScriptValues,
    loadScripts,
    setScriptValue
} from "@/src/chat/lib/storage.ts";

chrome.sidePanel.setOptions({enabled: false});
if(chrome.runtime.onConnect) installPanelLifecycle(cdp);

// Clear state left by the removed global stop control on extension reload, and
// the retired single-key chat archive (chats now live in IndexedDB); remove()
// never reads the value, so an oversized archive is dropped safely.
// Script registration below depends only on each script's own status.
void Promise.all([
    chrome.storage.local.remove(['ts_browser_control', 'ts_browser_audit', 'ts_conversations']),
    chrome.storage.session.remove(['ts_browser_status', 'ts_debugger_tabs']),
    chrome.action.setBadgeText({text: ''}),
    chrome.action.setTitle({title: 'TamperSloth'}),
]).catch(error => console.warn('[Tampersloth] Could not clear legacy browser control state:', error));

/** Opens the tab's panel; call it straight from the user's click, before awaiting anything. */
async function openPanel(tab: chrome.tabs.Tab) {
    chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: `index.html?tabId=${tab.id}`,
        enabled: true
    });
    const opened = chrome.sidePanel.open({tabId: tab.id, windowId: tab.windowId});
    // An already open panel doesn't remount, so ask it to show the chat and focus the input.
    if (tab.id) void queuePanelRequest(tab.id, {kind: 'focus'});
    await opened;
}

chrome.action.onClicked.addListener(openPanel);
installContextMenu(openPanel);
installLeftoverGroupCheck();

chrome.alarms.create('keepalive', {periodInMinutes: 0.5});
chrome.alarms.onAlarm.addListener(() => { /* just waking up is enough */ });

function hasUserScripts(): boolean {
    try {
        return typeof chrome.userScripts !== 'undefined'
            && typeof chrome.userScripts.execute === 'function';
    } catch {
        return false;
    }
}

// Actually exercises the API. A stale reference can survive the user toggling
// "Allow user scripts" off mid-session, so a presence check alone reports a
// false positive — getScripts() rejects once the permission is revoked.
async function probeUserScripts(): Promise<boolean> {
    if (!hasUserScripts()) return false;
    try {
        await chrome.userScripts.getScripts();
        return true;
    } catch {
        return false;
    }
}

function configureUserScriptsWorld() {
    if (!hasUserScripts()) return;
    try {
        chrome.userScripts.configureWorld({
            csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            messaging: true,
        });
    } catch (e) {
        console.warn('[Tampersloth] Failed to configure userScripts world:', e);
    }
}

configureUserScriptsWorld();

// ── Script Cache ─────────────────────────────────────────────
let cachedScripts: BackgroundScript[] | null = null;

async function getScripts(): Promise<BackgroundScript[]> {
    if (!cachedScripts) cachedScripts = await loadScripts();
    return cachedScripts;
}

function invalidateCache() {
    cachedScripts = null;
}

// ── Script Tokens ────────────────────────────────────────────
// Registered code carries its script's token, and a message naming a script is
// trusted only with it, so one script can't read another's values or act as it.
const TOKENS_KEY = 'ts_script_tokens';
let tokenCache: Record<string, string> | null = null;
let tokenChain: Promise<unknown> = Promise.resolve();

function scriptTokens(scripts: BackgroundScript[]): Promise<Record<string, string>> {
    const task = tokenChain.catch(() => {}).then(async () => {
        if (!tokenCache) tokenCache = ((await chrome.storage.local.get(TOKENS_KEY))[TOKENS_KEY] as Record<string, string>) ?? {};
        const current = tokenCache;
        const next = Object.fromEntries(scripts.map(s => [s.id, current[s.id] ?? crypto.randomUUID()]));
        const changed = Object.keys(next).length !== Object.keys(current).length || Object.keys(next).some(id => next[id] !== current[id]);
        if (changed) {
            tokenCache = next;
            await chrome.storage.local.set({[TOKENS_KEY]: next});
        }
        return tokenCache;
    });
    tokenChain = task;
    return task;
}

async function authenticateScript(message: any): Promise<BackgroundScript | null> {
    if (typeof message.scriptId !== 'string' || typeof message.token !== 'string') return null;
    const scripts = await getScripts();
    const script = scripts.find(s => s.id === message.scriptId);
    if (!script) return null;
    return (await scriptTokens(scripts))[script.id] === message.token ? script : null;
}

// ── Execution Logs ───────────────────────────────────────────
const executionLogs: ScriptExecutionLog[] = [];
const MAX_LOGS = 100;

function logExecution(log: ScriptExecutionLog) {
    executionLogs.unshift(log);
    if (executionLogs.length > MAX_LOGS) executionLogs.length = MAX_LOGS;
}

// ── Code Wrapping ────────────────────────────────────────────

function buildStorageHelpers(scriptId: string, token: string): string {
    return `
        var __tampersloth_scriptId = ${JSON.stringify(scriptId)};
        var __tampersloth_token = ${JSON.stringify(token)};

        function __tampersloth_send(msg, retries) {
            msg.token = __tampersloth_token;
            retries = retries || 0;
            return chrome.runtime.sendMessage(msg).catch(function(err) {
                if (retries < 2 && /receiving end/i.test(err.message || '')) {
                    return new Promise(function(r) { setTimeout(r, 200); })
                        .then(function() { return __tampersloth_send(msg, retries + 1); });
                }
                throw err;
            });
        }

        function MH_setValue(key, value) {
            return __tampersloth_send({
                type: 'SCRIPT_SET_VALUE', scriptId: __tampersloth_scriptId, key: key, value: value
            }).then(function(r) { return r && r.ok; });
        }
        function MH_getValue(key) {
            return __tampersloth_send({
                type: 'SCRIPT_GET_VALUE', scriptId: __tampersloth_scriptId, key: key
            }).then(function(r) { return r ? r.value : null; });
        }
        function MH_deleteValue(key) {
            return __tampersloth_send({
                type: 'SCRIPT_DELETE_VALUE', scriptId: __tampersloth_scriptId, key: key
            }).then(function(r) { return r && r.ok; });
        }
        function MH_listValues() {
            return __tampersloth_send({
                type: 'SCRIPT_LIST_VALUES', scriptId: __tampersloth_scriptId
            }).then(function(r) { return r ? r.values : {}; });
        }
    `;
}

function buildWrappedCode(
    code: string,
    fnName: string,
    scriptId?: string,
    token = '',
): string {
    const storageHelpers = scriptId ? buildStorageHelpers(scriptId, token) : '';
    const scriptIdJson = JSON.stringify(scriptId ?? '');
    const tokenJson = JSON.stringify(token);
    const reportExecution = scriptId ? `
        try { chrome.runtime.sendMessage({
            type: 'SCRIPT_EXECUTION_REPORT',
            scriptId: ${scriptIdJson},
            token: ${tokenJson},
            success: true,
            url: location.href
        }).catch(function() {}); } catch(e) {}
    ` : '';
    const reportError = scriptId ? `
        try { chrome.runtime.sendMessage({
            type: 'SCRIPT_EXECUTION_REPORT',
            scriptId: ${scriptIdJson},
            token: ${tokenJson},
            success: false,
            error: __err.message || String(__err),
            url: location.href
        }).catch(function() {}); } catch(e) {}
    ` : '';

    return `
(function() {
    // Per-script persistent storage helpers
    ${storageHelpers}

    // User code
    ${code}

    try {
        var __result = ${fnName}();
        ${reportExecution}
        return __result;
    } catch (__err) {
        ${reportError}
        throw __err;
    }
})();
    `.trim();
}

// ── On-Demand Execution (temp scripts from AI tools) ─────────

async function executeOnTab(
    tabId: number,
    code: string,
    options?: { scriptId?: string }
): Promise<any> {
    const fnMatch = code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (!fnMatch) {
        throw new Error('code must be a named function definition, e.g. function myFn() { ... }');
    }
    const fnName = fnMatch[1];

    if (!hasUserScripts()) {
        throw new Error(
            '[Tampersloth] userScripts API not available. Go to chrome://extensions, click Tampersloth details, and enable "Allow in Developer Mode" (or "Allow User Scripts"). Then reload the extension.'
        );
    }

    const wrappedCode = buildWrappedCode(code, fnName, options?.scriptId);

    const results = await chrome.userScripts.execute({
        target: {tabId},
        js: [{code: wrappedCode}],
        world: 'USER_SCRIPT',
    });
    return results?.[0]?.result;
}

// ── Registered Scripts Sync (auto-execution on matching pages) ──

let syncChain: Promise<void> = Promise.resolve();
function syncRegisteredScripts() {
    syncChain = syncChain.catch(() => {}).then(syncRegisteredScriptsNow);
    return syncChain;
}
async function syncRegisteredScriptsNow() {
    if (!hasUserScripts()) {
        console.warn('[Tampersloth] Skipping script registration — userScripts API not available. Go to chrome://extensions > Tampersloth details > enable "Allow User Scripts", then reload.');
        return;
    }

    // Ensure world is configured (may not have been at startup)
    configureUserScriptsWorld();

    try {
        // Unregister all existing tampersloth userscripts
        const existing = await chrome.userScripts.getScripts();
        const tamperslothIds = existing
            .filter((s: any) => s.id.startsWith('tampersloth_'))
            .map((s: any) => s.id);
        if (tamperslothIds.length) {
            await chrome.userScripts.unregister({ids: tamperslothIds});
        }

        const scripts = await getScripts();
        const tokens = await scriptTokens(scripts);
        const registrations: chrome.userScripts.RegisteredUserScript[] = [];
        const worlds = new Set<string>();
        for (const script of scripts) {
            if (script.status !== 'active') continue;
            if (script.userscript) {
                registrations.push(...userscriptRegistrations(script as BackgroundScript & {userscript: ImportedUserscript}, tokens[script.id]));
                // Right-click scripts register nothing but still run in their own world.
                if (script.userscript.contextMenu) worlds.add(userscriptWorldId(script.id));
                continue;
            }
            if (!script.urlMatchPattern) continue;
            const fnMatch = script.code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
            const fnName = fnMatch?.[1] ?? 'main';
            registrations.push({
                id: `tampersloth_${script.id}`,
                matches: [script.urlMatchPattern] as string[],
                js: [{code: buildWrappedCode(script.code, fnName, script.id, tokens[script.id])}],
                runAt: (script.runAt ?? 'document_idle') as 'document_start' | 'document_end' | 'document_idle',
                world: 'USER_SCRIPT' as const,
            });
        }

        // Each isolated userscript has its own world; forget worlds whose script is gone or paused.
        for (const {worldId} of registrations) if (worldId) worlds.add(worldId);
        for (const worldId of worlds) {
            await chrome.userScripts.configureWorld({worldId, csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline'", messaging: true});
        }
        for (const world of await chrome.userScripts.getWorldConfigurations()) {
            if (world.worldId?.startsWith('tsw_') && !worlds.has(world.worldId)) {
                await chrome.userScripts.resetWorldConfiguration(world.worldId);
            }
        }

        if (registrations.length === 0) return;
        try {
            await chrome.userScripts.register(registrations);
        } catch (e) {
            // One bad registration rejects the whole batch; keep the rest running.
            console.warn('[Tampersloth] Batch registration failed, registering one by one:', e);
            for (const registration of registrations) {
                await chrome.userScripts.register([registration])
                    .catch(error => console.error(`[Tampersloth] Could not register ${registration.id}:`, error));
            }
        }
        console.log(`[Tampersloth] Registered ${registrations.length} userscripts`);
    } catch (e) {
        console.error('[Tampersloth] Failed to sync registered scripts:', e);
    }
}

// Re-sync whenever scripts change in storage
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes['ts_background_scripts']) {
        invalidateCache();
        syncRegisteredScripts();
        refreshUserscriptMenus();
    }
});

// Initial sync on extension startup
syncRegisteredScripts();

// ── Message Handlers ─────────────────────────────────────────
// Value writes for one script run in order; each rewrites the script's whole record.
const valueChains = new Map<string, Promise<unknown>>();
function queueValueWrite(scriptId: string, write: () => Promise<void>): Promise<void> {
    const next = (valueChains.get(scriptId) ?? Promise.resolve()).catch(() => {}).then(write);
    valueChains.set(scriptId, next);
    void next.catch(() => {}).finally(() => { if (valueChains.get(scriptId) === next) valueChains.delete(scriptId); });
    return next;
}

async function answerUserScript(message: any, sender: chrome.runtime.MessageSender): Promise<unknown> {
    const script = await authenticateScript(message);
    if (!script) return {denied: true, error: "TamperSloth doesn't recognise this script anymore. Reload the page."};
    switch (message.type) {
        case 'SCRIPT_GET_VALUE':
            await valueChains.get(script.id)?.catch(() => {});
            return {value: await getScriptValue(script.id, message.key)};
        case 'SCRIPT_SET_VALUE':
            await queueValueWrite(script.id, () => setScriptValue(script.id, message.key, message.value));
            // Its other tabs keep their copy of the values current, and listeners hear about it.
            pushToScript(script.id, {type: 'value', key: message.key, value: message.value}, message.instance);
            return {ok: true};
        case 'SCRIPT_DELETE_VALUE':
            await queueValueWrite(script.id, () => deleteScriptValue(script.id, message.key));
            pushToScript(script.id, {type: 'value', key: message.key, deleted: true}, message.instance);
            return {ok: true};
        case 'SCRIPT_LIST_VALUES':
            await valueChains.get(script.id)?.catch(() => {});
            return {values: await listScriptValues(script.id)};
        case 'SCRIPT_EXECUTION_REPORT':
            logExecution({
                scriptId: script.id,
                scriptName: script.name,
                url: message.url ?? '',
                timestamp: Date.now(),
                success: message.success,
                error: message.error,
            });
            return {ok: true};
        default:
            return (await handleGmRequest(message, sender, script)) ?? {error: `Unknown request ${message.type}`};
    }
}

function handleUserScriptMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (r: any) => void): boolean {
    if (typeof message?.type !== 'string' || !/^(SCRIPT|GM)_/.test(message.type)) return false;
    answerUserScript(message, sender).then(sendResponse, error => sendResponse({error: error?.message || String(error)}));
    return true;
}

if (chrome.runtime.onUserScriptMessage) {
    chrome.runtime.onUserScriptMessage.addListener(handleUserScriptMessage);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CLIPBOARD_OFFSCREEN') return false;
    // The on-page Stop button is handled by the side panel that owns the run.
    if (message.type === 'AGENT_STOP_REQUESTED') return false;
    // Element picker preview, requested by the picker overlay (our own isolated-world
    // script; page scripts cannot reach runtime messaging). It only captures the
    // sender's own visible tab, after the overlay has hidden itself.
    if (message.type === 'PICKER_CAPTURE') {
        const windowId = sender.tab?.windowId;
        if (sender.id !== chrome.runtime.id || windowId === undefined || sender.frameId !== 0) return false;
        captureRegion(windowId, message.rect, message.viewport)
            .then(dataUrl => sendResponse({dataUrl}), () => sendResponse({dataUrl: null}));
        return true;
    }
    // The drawing overlay's "Add to chat", once its toolbar is hidden. Same sender
    // rules as above; the capture goes to the sender tab's panel, never back to the page.
    if (message.type === 'DRAW_CAPTURE') {
        const tabId = sender.tab?.id, windowId = sender.tab?.windowId;
        if (sender.id !== chrome.runtime.id || tabId === undefined || windowId === undefined || sender.frameId !== 0) return false;
        const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
        captureAnnotatedViewport(windowId)
            .then(dataUrl => queuePanelRequest(tabId, {kind: 'image', dataUrl, name: `marked-up-${stamp}.jpg`}))
            .then(() => sendResponse({ok: true}), error => sendResponse({error: error instanceof Error ? error.message : String(error)}));
        return true;
    }
    // Overlay notices for the panel.
    if (message.type === 'DRAW_ENDED') return false;
    // The pricing page's relay; installPricingBridge answers it, so the refusal below must not.
    if (message.type === BILLING_TOKEN_REQUEST) return false;
    // The Greasy Fork button and the install tab's hand-back; installGreasyForkButton answers them.
    if (message.type === GREASYFORK_INSTALL || message.type === USERSCRIPT_INSTALLED) return false;
    // The "may this script contact that site?" window; installConnectPrompt answers it.
    if (message.type === CONNECT_DECISION) return false;
    // "Check for updates" from the script viewer's tab; installUserscriptUpdates answers it.
    if (message.type === CHECK_USERSCRIPT_UPDATE) return false;
    // After a saved script is paused, resumed, deleted or imported: re-register
    // first so reloaded pages get the change, then reload every tab its pattern
    // covers. Any extension page may ask, including the script viewer's own tab.
    if (message.type === 'RELOAD_SCRIPT_TABS') {
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
        void (async () => {
            invalidateCache();
            await syncRegisteredScripts();
            const ids = new Set<number>();
            for (const url of (message.patterns ?? []) as string[]) {
                try {
                    (await chrome.tabs.query({url})).forEach(tab => tab.id !== undefined && ids.add(tab.id));
                } catch { /* a pattern tabs.query rejects; nothing to reload for it */ }
            }
            await Promise.all([...ids].map(id => chrome.tabs.reload(id).catch(() => {})));
            sendResponse({count: ids.size});
        })().catch(error => sendResponse({error: error.message}));
        return true;
    }
    // Whether "Allow User Scripts" is on. Read-only, so any extension page may
    // ask, including the install and viewer tabs the check below would refuse.
    if (message.type === 'CHECK_USERSCRIPTS') {
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return false;
        void probeUserScripts().then((available) => sendResponse({available}));
        return true;
    }
    // Only the extension's own UI may control tabs or evaluate code.
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || sender.tab) {
        sendResponse({error: 'Browser control is restricted to the extension UI'});
        return false;
    }
    if(message.type==='BROWSER_RUN_END') {
        void cleanupBrowserGuidance(cdp).then(()=>sendResponse({ok:true})).catch(error=>sendResponse({error:error.message}));
        return true;
    }
    if (message.type?.startsWith('BROWSER_')) {
        void handleBrowserMessage(message).then(sendResponse).catch(error => sendResponse({error: error.message}));
        return true;
    }
    // On-demand script execution (temp scripts from AI)
    if (message.type === 'EXECUTE_SCRIPT') {
        (async () => {
            try {
                const targetTabId = message.tabId;
                if (!targetTabId) throw new Error('No target tab');
                const result = await executeOnTab(targetTabId, message.code);
                sendResponse({result});
            } catch (e: any) {
                sendResponse({error: e.message});
            }
        })();
        return true;
    }

    // Screenshot
    if (message.type === 'TAKE_SCREENSHOT') {
        (async () => {
            try {
                sendResponse(await captureViewportScreenshot(message.tabId, message.maxWidth));
            } catch (e: any) {
                sendResponse({error: e.message});
            }
        })();
        return true;
    }

    // Per-script storage
    if (message.type === 'SCRIPT_GET_VALUE') {
        getScriptValue(message.scriptId, message.key).then((value: any) => sendResponse({value}));
        return true;
    }
    if (message.type === 'SCRIPT_SET_VALUE') {
        setScriptValue(message.scriptId, message.key, message.value).then(() => sendResponse({ok: true}));
        return true;
    }
    if (message.type === 'SCRIPT_DELETE_VALUE') {
        deleteScriptValue(message.scriptId, message.key).then(() => sendResponse({ok: true}));
        return true;
    }
    if (message.type === 'SCRIPT_LIST_VALUES') {
        listScriptValues(message.scriptId).then((values: any) => sendResponse({values}));
        return true;
    }

    // Script execution reports (from registered userscripts)
    if (message.type === 'SCRIPT_EXECUTION_REPORT') {
        (async () => {
            const scripts = await getScripts();
            const script = scripts.find(s => s.id === message.scriptId);
            logExecution({
                scriptId: message.scriptId,
                scriptName: script?.name ?? 'Unknown',
                url: message.url ?? '',
                timestamp: Date.now(),
                success: message.success,
                error: message.error,
            });
            sendResponse({ok: true});
        })();
        return true;
    }

    // Execution logs retrieval
    if (message.type === 'GET_EXECUTION_LOGS') {
        const logs = message.scriptId
            ? executionLogs.filter(l => l.scriptId === message.scriptId)
            : executionLogs;
        sendResponse({logs});
        return true;
    }

    // Debugger: capture console logs
    if (message.type === 'GET_CONSOLE') {
        const targetTabId = message.tabId;
        if (!targetTabId) {
            sendResponse({error: 'No target tab'});
            return true;
        }

        const captured: Array<{type: string; args: any[]; timestamp: number; requestId?: string}> = [];
        const duration = Math.min(message.duration ?? 5000, 30000);

        const onEvent = (source: chrome.debugger.Debuggee, method: string, params: any) => {
            if (source.tabId !== targetTabId) return;
            if (method === 'Runtime.consoleAPICalled') {
                captured.push({
                    type: params.type,
                    args: params.args.map((arg: any) => arg.value ?? arg.description ?? arg.type),
                    timestamp: params.timestamp,
                });
            }
            if (method === 'Runtime.exceptionThrown') {
                const ex = params.exceptionDetails;
                captured.push({
                    type: 'exception',
                    args: [ex.exception?.description ?? ex.text ?? 'Unknown error'],
                    timestamp: params.timestamp,
                });
            }
            if (method === 'Log.entryAdded') {
                const entry = params.entry;
                captured.push({
                    type: `browser:${entry.level}`,
                    args: [entry.text, entry.url ? `(${entry.url}:${entry.lineNumber ?? ''})` : ''].filter(Boolean),
                    timestamp: entry.timestamp,
                });
            }
            if (method === 'Network.loadingFailed') {
                captured.push({
                    type: 'network:failed',
                    args: [params.errorText, params.blockedReason ?? ''].filter(Boolean),
                    timestamp: Date.now(),
                    requestId: params.requestId,
                });
            }
            if (method === 'Network.responseReceived') {
                const status = params.response?.status;
                if (status && status >= 400) {
                    captured.push({
                        type: `network:${status}`,
                        args: [params.response.url, params.response.statusText],
                        timestamp: Date.now(),
                        requestId: params.requestId,
                    });
                }
            }
        };

        chrome.debugger.onEvent.addListener(onEvent);

        (async () => {
            try {
                await cdp.attach(targetTabId);

                await new Promise(resolve => setTimeout(resolve, duration));

                chrome.debugger.onEvent.removeListener(onEvent);
                sendResponse({logs: captured});
            } catch (e: any) {
                chrome.debugger.onEvent.removeListener(onEvent);
                sendResponse({error: e.message});
            }
        })();
        return true;
    }
});

// The pricing page's token requests, beside the panel's own messages above.
installPricingBridge();
// The "Install with TamperSloth" button on Greasy Fork script pages.
installGreasyForkButton();
// What installed userscripts need while they run: push channels, menus, the @connect question.
installUserscriptHost({authenticate: authenticateScript, getScripts, tokens: scriptTokens});
installConnectPrompt();
installGmTabTracking();
installUserscriptLinks();
installUserscriptUpdates();
