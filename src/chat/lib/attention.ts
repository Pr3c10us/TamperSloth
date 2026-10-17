/**
 * Brings the user to the tab this panel belongs to. Questions and approval
 * cards show only in that tab's side panel, so the user must be looking at it.
 */
export function showPanelTab() {
    const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
    if (!(tabId > 0) || typeof chrome === "undefined" || !chrome.tabs?.update) return;
    void (async () => {
        const tab = await chrome.tabs.update(tabId, {active: true});
        if (tab) await chrome.windows.update(tab.windowId, {focused: true});
    })().catch(error => console.warn("[Tampersloth] Could not show the panel's tab:", error));
}
