import {installPricingBridge} from "./billing/pricingBridge";
import {cdp} from "./browser/browserService";
import {installLeftoverGroupCheck} from "./browser/taskTabs";
import {installMessageRouter} from "./messageRouter";
import {installContextMenu} from "./panel/contextMenu";
import {openPanel} from "./panel/openPanel";
import {installPanelLifecycle} from "./panel/panelLifecycle";
import {installConnectPrompt} from "./userscripts/connectPrompt";
import {installGreasyForkButton} from "./userscripts/greasyForkButton";
import {installScriptMessages} from "./userscripts/scriptMessages";
import {authenticateScript, getScripts, installScriptRegistration, scriptTokens} from "./userscripts/scriptRegistration";
import {installGmTabTracking} from "./userscripts/userscriptBridge";
import {installUserscriptHost} from "./userscripts/userscriptHost";
import {installUserscriptLinks} from "./userscripts/userscriptLinks";
import {installUserscriptUpdates} from "./userscripts/userscriptUpdates";

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

chrome.action.onClicked.addListener(openPanel);
installContextMenu(openPanel);
installLeftoverGroupCheck();

chrome.alarms.create('keepalive', {periodInMinutes: 0.5});
chrome.alarms.onAlarm.addListener(() => { /* just waking up is enough */ });

installScriptRegistration();
installScriptMessages();
installMessageRouter();

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
