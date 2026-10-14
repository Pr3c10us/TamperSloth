import {queuePanelRequest} from '../chat/lib/panelRequests';

const MENU = {
    show: 'tampersloth-show',
    open: 'tampersloth-open',
    openSeparator: 'tampersloth-open-separator',
    pick: 'tampersloth-pick',
    draw: 'tampersloth-draw',
    talk: 'tampersloth-talk',
    ask: 'tampersloth-ask',
} as const;

/** The longest quote kept; past this a selection is clipped rather than flooding the chat. */
const MAX_QUOTE = 20000;

// "Show Sloth" is left out of the selection context so Chrome never folds it and
// "Ask Sloth" together under a TamperSloth parent: each stays one click away.
const SHOW_CONTEXTS: chrome.contextMenus.CreateProperties['contexts'] = ['page', 'frame', 'link', 'image', 'video', 'audio'];

function createMenus() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({id: MENU.show, title: 'Send to Sloth', contexts: SHOW_CONTEXTS});
        chrome.contextMenus.create({id: MENU.open, parentId: MENU.show, title: 'Open Sloth', contexts: SHOW_CONTEXTS});
        chrome.contextMenus.create({id: MENU.openSeparator, parentId: MENU.show, type: 'separator', contexts: SHOW_CONTEXTS});
        chrome.contextMenus.create({id: MENU.pick, parentId: MENU.show, title: 'Pick an element', contexts: SHOW_CONTEXTS});
        chrome.contextMenus.create({id: MENU.draw, parentId: MENU.show, title: 'Draw or highlight an area', contexts: SHOW_CONTEXTS});
        chrome.contextMenus.create({id: MENU.talk, parentId: MENU.show, title: 'Talk to Sloth', contexts: SHOW_CONTEXTS});
        chrome.contextMenus.create({id: MENU.ask, title: 'Ask Sloth', contexts: ['selection']});
    });
}

/**
 * The selection with its line breaks; Chrome's selectionText collapses them.
 * Text selected inside a form field is only in selectionText.
 */
async function selectedText(tabId: number, info: chrome.contextMenus.OnClickData) {
    let text = '';
    try {
        const [result] = await chrome.scripting.executeScript({
            target: {tabId, frameIds: [info.frameId ?? 0]},
            func: () => getSelection()?.toString() ?? '',
        });
        text = typeof result?.result === 'string' ? result.result : '';
    } catch { /* Pages we cannot script still report the plain selection. */ }
    text = (text.trim() ? text : info.selectionText ?? '').trim();
    return text.length > MAX_QUOTE ? text.slice(0, MAX_QUOTE - 1) + '…' : text;
}

/** Adds "Send to Sloth › Open Sloth / Pick an element / Draw or highlight an area / Talk to Sloth" and "Ask Sloth" to the page's context menu. */
export function installContextMenu(openPanel: (tab: chrome.tabs.Tab) => Promise<void>) {
    if (!chrome.contextMenus) return;
    // Menus persist across restarts; rebuild them when the extension is installed or updated.
    chrome.runtime.onInstalled.addListener(createMenus);

    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (!tab?.id || tab.id < 0) return;
        const tabId = tab.id;
        // The click is the user gesture sidePanel.open needs, so the panel opens before anything is awaited.
        // "Open Sloth" needs nothing more.
        void openPanel(tab).catch(error => console.warn('[Tampersloth] Could not open the panel:', error));
        if (info.menuItemId === MENU.pick) void queuePanelRequest(tabId, {kind: 'pick'});
        else if (info.menuItemId === MENU.draw) void queuePanelRequest(tabId, {kind: 'draw'});
        else if (info.menuItemId === MENU.talk) void queuePanelRequest(tabId, {kind: 'dictate'});
        else if (info.menuItemId === MENU.ask) void (async () => {
            const text = await selectedText(tabId, info);
            if (text) await queuePanelRequest(tabId, {kind: 'quote', text, url: info.frameUrl ?? info.pageUrl ?? tab.url, title: tab.title});
        })();
    });
}
