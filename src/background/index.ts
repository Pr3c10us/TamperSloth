import type {BackgroundScript, ScriptExecutionLog} from "@/src/chat/lib/types.ts";
import {handleBrowserMessage, cdp} from './browserService';
import {captureAnnotatedViewport, captureRegion, captureViewportScreenshot} from './screenshotCapture';
import {installPanelLifecycle, cleanupBrowserGuidance} from './panelLifecycle';
import {installContextMenu} from './contextMenu';
import {queuePanelRequest} from '../chat/lib/panelRequests';
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
    await chrome.sidePanel.open({tabId: tab.id, windowId: tab.windowId});
}

chrome.action.onClicked.addListener(openPanel);
installContextMenu(openPanel);

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

// ── Execution Logs ───────────────────────────────────────────
const executionLogs: ScriptExecutionLog[] = [];
const MAX_LOGS = 100;

function logExecution(log: ScriptExecutionLog) {
    executionLogs.unshift(log);
    if (executionLogs.length > MAX_LOGS) executionLogs.length = MAX_LOGS;
}

// ── Code Wrapping ────────────────────────────────────────────

function buildStorageHelpers(scriptId: string): string {
    return `
        var __tampersloth_scriptId = ${JSON.stringify(scriptId)};

        function __tampersloth_send(msg, retries) {
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
): string {
    const storageHelpers = scriptId ? buildStorageHelpers(scriptId) : '';
    const scriptIdJson = JSON.stringify(scriptId ?? '');
    const reportExecution = scriptId ? `
        try { chrome.runtime.sendMessage({
            type: 'SCRIPT_EXECUTION_REPORT',
            scriptId: ${scriptIdJson},
            success: true,
            url: location.href
        }).catch(function() {}); } catch(e) {}
    ` : '';
    const reportError = scriptId ? `
        try { chrome.runtime.sendMessage({
            type: 'SCRIPT_EXECUTION_REPORT',
            scriptId: ${scriptIdJson},
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
        const active = scripts.filter(s => s.status === 'active' && s.urlMatchPattern);

        if (active.length === 0) return;

        const registrations = active.map(script => {
            const fnMatch = script.code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
            const fnName = fnMatch?.[1] ?? 'main';

            return {
                id: `tampersloth_${script.id}`,
                matches: [script.urlMatchPattern] as string[],
                js: [{code: buildWrappedCode(script.code, fnName, script.id)}],
                runAt: (script.runAt ?? 'document_idle') as 'document_start' | 'document_end' | 'document_idle',
                world: 'USER_SCRIPT' as const,
            };
        });

        await chrome.userScripts.register(registrations);
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
    }
});

// Initial sync on extension startup
syncRegisteredScripts();

// ── Message Handlers ─────────────────────────────────────────
function handleUserScriptMessage(message: any, _: any, sendResponse: (r: any) => void): boolean {
    if (message.type === 'SCRIPT_GET_VALUE') {
        getScriptValue(message.scriptId, message.key).then((value: any) => sendResponse({value}));
        return true;
    }
    if (message.type === 'SCRIPT_SET_VALUE') {
        void setScriptValue(message.scriptId, message.key, message.value)
            .then(() => sendResponse({ok: true}), error => sendResponse({error: error.message}));
        return true;
    }
    if (message.type === 'SCRIPT_DELETE_VALUE') {
        void deleteScriptValue(message.scriptId, message.key)
            .then(() => sendResponse({ok: true}), error => sendResponse({error: error.message}));
        return true;
    }
    if (message.type === 'SCRIPT_LIST_VALUES') {
        listScriptValues(message.scriptId).then((values: any) => sendResponse({values}));
        return true;
    }
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
    return false;
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
    // Reload a specific tab (e.g. after pausing/deleting a script)
    if (message.type === 'RELOAD_TAB') {
        void (async () => {
            if (message.tabId) await chrome.tabs.reload(message.tabId);
            sendResponse({ok: true});
        })().catch(error => sendResponse({error: error.message}));
        return true;
    }

    // Developer mode / userScripts availability check
    if (message.type === 'CHECK_USERSCRIPTS') {
        void probeUserScripts().then((available) => sendResponse({available}));
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
