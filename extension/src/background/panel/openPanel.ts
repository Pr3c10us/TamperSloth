import {queuePanelRequest} from "@/shared/panelRequests";

/** Opens the tab's panel; call it straight from the user's click, before awaiting anything. */
export async function openPanel(tab: chrome.tabs.Tab) {
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
