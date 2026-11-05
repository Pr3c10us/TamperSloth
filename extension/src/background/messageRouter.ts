import {BILLING_TOKEN_REQUEST} from "@/background/billing/pricingBridge";
import {cdp, handleBrowserMessage} from "@/background/browser/browserService";
import {captureConsole} from "@/background/browser/consoleCapture";
import {captureAnnotatedViewport, captureRegion, captureViewportScreenshot} from "@/background/browser/screenshotCapture";
import {cleanupBrowserGuidance} from "@/background/panel/panelLifecycle";
import {CONNECT_DECISION} from "@/background/userscripts/connectPrompt";
import {executeOnTab} from "@/background/userscripts/executeOnTab";
import {GREASYFORK_INSTALL, USERSCRIPT_INSTALLED} from "@/background/userscripts/greasyForkButton";
import {invalidateCache, syncRegisteredScripts} from "@/background/userscripts/scriptRegistration";
import {probeUserScripts} from "@/background/userscripts/scriptWorld";
import {CHECK_USERSCRIPT_UPDATE} from "@/background/userscripts/userscriptUpdates";
import {queuePanelRequest} from "@/shared/panelRequests";

/** Messages from the extension's own pages and overlays. Installed userscripts are answered by installScriptMessages. */
export function installMessageRouter() {
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

        // Debugger: capture console logs
        if (message.type === 'GET_CONSOLE') {
            captureConsole(message, sendResponse);
            return true;
        }
    });
}
