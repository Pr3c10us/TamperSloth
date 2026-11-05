/**
 * Pricing-page tabs that may get a billing token without a click on the page:
 * ones the extension opened itself, and ones already handed a token after a
 * click, so they can renew it while checkout is open. Kept in session storage,
 * which content scripts can't read or write.
 */
const PREFIX = "ts_pricing_tab_";
const TRUST_MS = 60 * 60_000;

export async function trustPricingTab(tabId: number): Promise<void> {
    await chrome.storage.session.set({[PREFIX + tabId]: Date.now() + TRUST_MS});
}

export async function isTrustedPricingTab(tabId: number): Promise<boolean> {
    const key = PREFIX + tabId;
    const until = (await chrome.storage.session.get(key))[key];
    return typeof until === "number" && until > Date.now();
}
