import {isSignedIn, requestBillingToken, SITE_URL} from '../settings/lib/account';

/** The relay's request to this worker; page-side names are in landing-page/src/lib/extension.ts. */
export const BILLING_TOKEN_REQUEST = 'PRICING_BILLING_TOKEN';

export type BillingTokenReply =
    | {ok: true; token: string}
    | {ok: false; reason: 'signed-out'; panelOpened: boolean}
    | {ok: false; reason: 'unavailable'};

/** tampersloth.com and its subdomains, plus the site this build points Upgrade at (a local landing page in dev). */
function isPricingOrigin(url: string | undefined): boolean {
    if (!url) return false;
    let origin: string;
    try {
        origin = new URL(url).origin;
    } catch {
        return false;
    }
    if (/^https:\/\/([a-z0-9-]+\.)*tampersloth\.com$/.test(origin)) return true;
    try {
        return origin === new URL(SITE_URL).origin;
    } catch {
        return false;
    }
}

/**
 * The pricing page's Upgrade buttons ask whichever TamperSloth build is
 * installed for a billing token, so a visitor who is signed in here checks out
 * without going through the panel first. A relay injected into our own site
 * carries the request, so the page needs no extension ID.
 */
export function installPricingBridge() {
    const inject = (tabId: number) => chrome.scripting.executeScript({target: {tabId}, func: pricingRelay}).catch(() => {});

    chrome.tabs.onUpdated?.addListener((tabId, change, tab) => {
        if (change.status === 'complete' && isPricingOrigin(tab.url)) void inject(tabId);
    });
    // Pages already open when the extension starts or updates.
    void chrome.tabs.query({}).then(tabs => {
        for (const tab of tabs) if (tab.id !== undefined && isPricingOrigin(tab.url)) void inject(tab.id);
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type !== BILLING_TOKEN_REQUEST) return false;
        if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !isPricingOrigin(sender.url)) return false;
        void reply(sender.tab).then(sendResponse);
        return true;
    });
}

async function reply(tab: chrome.tabs.Tab | undefined): Promise<BillingTokenReply> {
    if (!(await isSignedIn())) return {ok: false, reason: 'signed-out', panelOpened: await openSignIn(tab)};
    const token = await requestBillingToken();
    return token ? {ok: true, token} : {ok: false, reason: 'unavailable'};
}

/**
 * Opens the panel on Settings to sign in. Chrome only opens it from a user
 * gesture, which a page's message may not carry, so this is best effort.
 */
async function openSignIn(tab: chrome.tabs.Tab | undefined): Promise<boolean> {
    if (tab?.id === undefined) return false;
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
 * extension is installed, and passes the page's token requests to the worker.
 */
function pricingRelay() {
    const flags = window as unknown as {__tamperslothPricingRelay?: boolean};
    if (flags.__tamperslothPricingRelay) return;
    flags.__tamperslothPricingRelay = true;

    window.addEventListener('message', (event) => {
        const data = event.data as {source?: string; type?: string; id?: string} | null;
        if (event.source !== window || data?.source !== 'tampersloth-page' || data.type !== 'billing-token') return;
        chrome.runtime.sendMessage({type: 'PRICING_BILLING_TOKEN'}, (reply) => {
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
