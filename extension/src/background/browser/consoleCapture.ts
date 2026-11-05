import {cdp} from "./browserService";

/** Attaches to the tab for a while, then answers with what its console and network reported. */
export function captureConsole(message: any, sendResponse: (response: unknown) => void) {
    const targetTabId = message.tabId;
    if (!targetTabId) {
        sendResponse({error: 'No target tab'});
        return;
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
}
