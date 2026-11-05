import {isSignedIn, requestBillingToken, SITE_URL} from '@/account/account';
import {isTrustedPricingTab, trustPricingTab} from '@/account/pricingTabs';

/** The relay's request to this worker; page-side names are in landing-page/src/lib/extension.ts. */
export const BILLING_TOKEN_REQUEST = 'PRICING_BILLING_TOKEN';

export type BillingTokenReply =
    | {ok: true; token: string}
    | {ok: false; reason: 'signed-out'; panelOpened: boolean}
    | {ok: false; reason: 'needs-click'}
    | {ok: false; reason: 'unavailable'};

/** Where the pricing page lives: the site and its www host, plus the site this build points Upgrade at in dev. */
const PRICING_ORIGINS = new Set(['https://tampersloth.com', 'https://www.tampersloth.com']);

/** Only the pricing page itself, not every page or subdomain of the site. */
function isPricingPage(url: string | undefined): boolean {
    if (!url) return false;
    let page: URL;
    try {
        page = new URL(url);
    } catch {
        return false;
    }
    if (!/^\/pricing\/?$/.test(page.pathname)) return false;
    if (PRICING_ORIGINS.has(page.origin)) return true;
    try {
        return page.origin === new URL(SITE_URL).origin;
    } catch {
        return false;
    }
}

/**
 * The pricing page's Upgrade buttons ask whichever TamperSloth build is
 * installed for a billing token, through a relay injected into the page, so the
 * page needs no extension ID. A token goes to a page only right after a click
 * on it, or to a tab the extension opened itself (see pricingTabs), so a script
 * on the page can't quietly act for the user.
 */
export function installPricingBridge() {
    const inject = (tabId: number) => chrome.scripting.executeScript({target: {tabId}, func: pricingRelay}).catch(() => {});

    chrome.tabs.onUpdated?.addListener((tabId, change, tab) => {
        if (change.status === 'complete' && isPricingPage(tab.url)) void inject(tabId);
    });
    // Pages already open when the extension starts or updates.
    void chrome.tabs.query({}).then(tabs => {
        for (const tab of tabs) if (tab.id !== undefined && isPricingPage(tab.url)) void inject(tab.id);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type !== BILLING_TOKEN_REQUEST) return false;
        if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !isPricingPage(sender.url)) return false;
        void reply(sender.tab, message.clicked === true).then(sendResponse);
        return true;
    });
}

async function reply(tab: chrome.tabs.Tab | undefined, clicked: boolean): Promise<BillingTokenReply> {
    if (tab?.id === undefined) return {ok: false, reason: 'unavailable'};
    if (!clicked && !(await isTrustedPricingTab(tab.id))) return {ok: false, reason: 'needs-click'};
    // Opening the panel unasked would be odd; a click asked for it.
    if (!(await isSignedIn())) return {ok: false, reason: 'signed-out', panelOpened: clicked && await openSignIn(tab)};
    const token = await requestBillingToken();
    if (!token) return {ok: false, reason: 'unavailable'};
    // The page can renew its token later, while checkout is open, without another click.
    await trustPricingTab(tab.id);
    return {ok: true, token};
}

/**
 * Opens the panel on Settings to sign in. Chrome only opens it from a user
 * gesture, which a page's message may not carry, so this is best effort.
 */
async function openSignIn(tab: chrome.tabs.Tab): Promise<boolean> {
    if (tab.id === undefined) return false;
    try {
        await chrome.sidePanel.setOptions({tabId: tab.id, path: `index.html?tabId=${tab.id}#/settings?tab=connections`, enabled: true});
        await chrome.sidePanel.open({tabId: tab.id, windowId: tab.windowId});
        return true;
    } catch {
        return false;
    }
}

/**
 * Runs in the pricing page's isolated world; serialized by executeScript, so it
 * can't use anything from this file. It marks the page so it knows the
 * extension is installed, and passes the page's token requests to the worker,
 * saying whether the user had just clicked on the page: the page itself can't
 * fake that, since the check runs here.
 */
function pricingRelay() {
    const flags = window as unknown as {__tamperslothPricingRelay?: boolean};
    if (flags.__tamperslothPricingRelay) return;
    flags.__tamperslothPricingRelay = true;

    window.addEventListener('message', (event) => {
        const data = event.data as {source?: string; type?: string; id?: string} | null;
        if (event.source !== window || data?.source !== 'tampersloth-page' || data.type !== 'billing-token') return;
        const clicked = navigator.userActivation?.isActive === true;
        chrome.runtime.sendMessage({type: 'PRICING_BILLING_TOKEN', clicked}, (reply) => {
            // Reading lastError marks it handled when the worker couldn't answer.
            const failed = chrome.runtime.lastError || !reply;
            window.postMessage({
                source: 'tampersloth-extension',
                type: 'billing-token',
                id: data.id,
                reply: failed ? {ok: false, reason: 'unavailable'} : reply,
            }, location.origin);
        });
    });

    document.documentElement.dataset.tampersloth = 'ready';
    window.postMessage({source: 'tampersloth-extension', type: 'ready'}, location.origin);
}
