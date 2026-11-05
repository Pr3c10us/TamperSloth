/** Closes the tab this page is in, or the window when it is not in a tab. */
export function closeTab() {
    chrome.tabs.getCurrent((tab) => {
        if (tab?.id) void chrome.tabs.remove(tab.id);
        else window.close();
    });
}
