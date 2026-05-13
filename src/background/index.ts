import type {BackgroundScript, ScriptExecutionLog} from "@/src/chat/lib/types.ts";
import {
    deleteScriptValue,
    getScriptValue,
    listScriptValues,
    loadScripts,
    setScriptValue
} from "@/src/chat/lib/storage.ts";

chrome.sidePanel.setOptions({enabled: false});

chrome.action.onClicked.addListener(async (tab) => {
    chrome.sidePanel.setOptions({
        tabId: tab.id,
        path: `index.html?tabId=${tab.id}`,
        enabled: true
    });
    await chrome.sidePanel.open({tabId: tab.id, windowId: tab.windowId});
});

chrome.alarms.create('keepalive', {periodInMinutes: 0.5});
chrome.alarms.onAlarm.addListener(() => { /* just waking up is enough */ });

function hasUserScripts(): boolean {
    return typeof chrome.userScripts !== 'undefined'
        && typeof chrome.userScripts.execute === 'function';
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

async function syncRegisteredScripts() {
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

chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
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
                const tab = await chrome.tabs.get(message.tabId);
                if (!tab?.windowId) throw new Error('No window for tab');
                await chrome.windows.update(tab.windowId, {focused: true});
                await chrome.tabs.update(message.tabId, {active: true});
                const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
                    format: 'jpeg',
                    quality: 80,
                });
                sendResponse({dataUrl});
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
        if (message.tabId) chrome.tabs.reload(message.tabId).catch(() => {});
        sendResponse({ok: true});
        return true;
    }

    // Developer mode / userScripts availability check
    if (message.type === 'CHECK_USERSCRIPTS') {
        sendResponse({available: hasUserScripts()});
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
                await chrome.debugger.attach({tabId: targetTabId}, '1.3');
                await chrome.debugger.sendCommand({tabId: targetTabId}, 'Runtime.enable');
                await chrome.debugger.sendCommand({tabId: targetTabId}, 'Log.enable');
                await chrome.debugger.sendCommand({tabId: targetTabId}, 'Network.enable');

                await new Promise(resolve => setTimeout(resolve, duration));

                chrome.debugger.onEvent.removeListener(onEvent);
                await chrome.debugger.detach({tabId: targetTabId}).catch(() => {});
                sendResponse({logs: captured});
            } catch (e: any) {
                chrome.debugger.onEvent.removeListener(onEvent);
                await chrome.debugger.detach({tabId: targetTabId}).catch(() => {});
                sendResponse({error: e.message});
            }
        })();
        return true;
    }
});
