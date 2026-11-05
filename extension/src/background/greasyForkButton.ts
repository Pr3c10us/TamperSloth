import {loadUserscriptPrefs} from '../scripts/prefs';

/** The button's request to this worker, sent from the Greasy Fork page it's injected into. */
export const GREASYFORK_INSTALL = 'GREASYFORK_INSTALL';
/** The install tab's note that it installed a script, so a Greasy Fork tab can move to its post-install page. */
export const USERSCRIPT_INSTALLED = 'USERSCRIPT_INSTALLED';

/** A script's own page (Info, Code, …) on Greasy Fork or its sister site; group 1 is the script's base URL. */
const SCRIPT_PAGE = /^(https:\/\/(?:greasyfork|sleazyfork)\.org\/(?:[\w-]+\/)?scripts\/\d+[^/?#]*)/;
/** Install tab id → the Greasy Fork tab it came from and where that tab goes once the script is installed. */
const returnKey = (installTabId: number) => `ts_install_return_${installTabId}`;
const SCRIPT_HOSTS = new Set(['greasyfork.org', 'update.greasyfork.org', 'sleazyfork.org', 'update.sleazyfork.org']);

/** The sloth mark from public/icon.svg, drawn in currentColor for the dark button. */
const LOGO = `<svg viewBox="0 0 256 256" aria-hidden="true" fill="currentColor"><path d="M102.272 36.2747C157.226 32.7677 230.938 63.0061 251.172 117.512C253.808 124.611 260.615 155.502 251.095 158.158C246.838 153.721 243.337 145.55 239.567 140.393C225.04 120.517 199.794 102.442 174.097 104.314C159.945 105.344 156.315 118.38 158.213 130.365C160.548 145.113 173.585 156.882 185.905 164.002C194.586 168.596 226.279 185.531 215.63 198.69C206.036 210.546 174.28 217.175 160.301 218.373C159.988 218.422 159.674 218.469 159.36 218.512C122.275 223.583 39.0175 204.756 21.2527 158.264C16.1024 144.784 63.28 138.886 74.6267 134.929C91.0784 129.192 116.212 108.702 94.6173 90.098C72.6134 76.6751 41.9661 82.7133 21.0183 95.5357C16.2301 98.4664 3.93877 109.111 0.532216 106.551C-2.44754 97.2421 7.78305 80.5443 13.8882 73.348C37.0565 46.038 68.1352 39.2934 102.272 36.2747ZM151.319 179.382C153.557 177.421 154.054 177.118 154.664 174.165L154.102 172.56C151.568 171.609 138.677 175.957 133.895 176.526C128.375 177.137 122.797 176.961 117.328 176.003C97.9826 172.559 93.0729 160.644 85.6874 158.587C84.3914 160.976 83.2505 162.027 84.1835 164.868C86.5729 172.143 95.3837 177.077 101.873 180.277C116.497 187.49 137.495 188.911 151.319 179.382ZM132.413 156.689C136.731 154.643 139.929 153.589 141.801 149.197C142.518 139.285 124.917 136.183 117.476 136.556C113.565 137.494 105.067 140.015 107.811 146.096C112.551 156.601 121.925 158.769 132.413 156.689Z"/><path d="M66.4562 102.124C76.6377 101.351 85.2872 114.542 66.8027 121.012C66.1212 120.758 65.4437 120.495 64.7692 120.222C61.3401 118.82 56.8892 116.32 55.5566 112.62C55.0262 111.175 55.1088 109.577 55.7864 108.195C57.7116 104.326 62.6252 103.231 66.4562 102.124Z"/><path d="M184.468 125.412C196.596 124.992 207.26 136.94 193.138 143.966C189.074 145.26 184.501 143.672 181.769 140.476C179.939 138.333 179.052 135.541 179.308 132.734C179.662 129.088 181.796 127.559 184.468 125.412Z"/></svg>`;

/** Only a .user.js on Greasy Fork's own hosts, so the button can't be turned into an install of anything else. */
export function isGreasyForkScriptUrl(url: unknown): url is string {
    if (typeof url !== 'string') return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' && SCRIPT_HOSTS.has(parsed.hostname) && parsed.pathname.endsWith('.user.js');
    } catch {
        return false;
    }
}

/**
 * Runs in the Greasy Fork tab (serialized by executeScript, so self-contained):
 * puts an "Install with TamperSloth" button beside the site's own install
 * button, in a closed shadow root so neither page's styles leak into the other.
 *
 * It presses the site's own button rather than copying what that does: the
 * site's code shows its warnings (antifeatures, old versions), counts the
 * install, heads for the .user.js and on to its post-install page. The guard
 * below turns only that last .user.js navigation into a TamperSloth install.
 * Returns whether it added the button, so a repeat injection adds nothing.
 */
function greasyForkButton(args: {logo: string; font: string; type: string; channel: string}): boolean {
    const HOST_ID = 'tampersloth-install';
    if (document.getElementById(HOST_ID)) return false;
    const link = document.querySelector<HTMLAnchorElement>('#install-area a.install-link[href$=".user.js"]');
    const area = link?.closest('#install-area');
    if (!link || !area) return false;

    if (typeof FontFace !== 'undefined') {
        const face = new FontFace('TamperSloth Geist', `url("${args.font}")`, {weight: '100 900'});
        void face.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
    }

    const host = document.createElement('span');
    host.id = HOST_ID;
    const root = host.attachShadow({mode: 'closed'});
    // 38px tall like the site's button; the panel's ink and paper, its radius, Geist.
    root.innerHTML = `
        <style>
            :host { all: initial; display: inline-block; vertical-align: top; margin-left: 10px; }
            a {
                box-sizing: border-box; display: inline-flex; align-items: center; gap: 9px;
                padding: 9px 15px 9px 12px; border-radius: 8px;
                background: #141513; color: #ffffff; text-decoration: none; cursor: pointer;
                font: 500 15px/20px 'TamperSloth Geist', ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.01em;
                box-shadow: 0 1px 2px rgba(20, 21, 19, .18);
                transition: background-color 160ms ease, transform 160ms ease;
            }
            a:hover { background: #2a2c27; }
            a:active { transform: translateY(1px); }
            a:focus-visible { outline: 2px solid #4e6a32; outline-offset: 2px; }
            svg { width: 20px; height: 20px; flex: none; }
        </style>
        <a role="button">${args.logo}<span>Install with TamperSloth</span></a>`;

    const button = root.querySelector('a')!;
    button.href = link.href;

    // The site's install counting expects a hover on its button first; this hover is the user's.
    const hover = () => link.dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
    button.addEventListener('mouseenter', hover);
    button.addEventListener('touchstart', hover, {passive: true});

    const pressSiteButton = () => {
        document.dispatchEvent(new CustomEvent(`ts-gf-arm-${args.channel}`));
        // The site holds installs back behind a help dialog until it detects a manager it
        // knows. This is the flag its dialog's own "continue" link sets, for this one click.
        const OVERRIDE = 'manualOverrideInstallJS';
        let previous: string | null = null;
        try {
            previous = localStorage.getItem(OVERRIDE);
            localStorage.setItem(OVERRIDE, '1');
        } catch { /* storage blocked; the site shows its dialog */ }
        link.click();
        try {
            if (previous === null) localStorage.removeItem(OVERRIDE);
            else localStorage.setItem(OVERRIDE, previous);
        } catch { /* as above */ }
    };

    // Pressed before the site's script has attached, its button is a plain link: the
    // install still happens but goes uncounted. Its hover handler marks the ping URL,
    // so that shows when it's ready; if it never is, the install shouldn't wait on it.
    const READY_WAIT_MS = 3000;
    const siteReady = () => !link.hasAttribute('data-ping-url') || /[&?]mo=/.test(link.getAttribute('data-ping-url') ?? '');
    let waiting = false;
    button.addEventListener('click', event => {
        event.preventDefault();
        if (waiting) return;
        waiting = true;
        const started = Date.now();
        const attempt = () => {
            hover();
            if (siteReady() || Date.now() - started >= READY_WAIT_MS) {
                waiting = false;
                pressSiteButton();
            } else {
                setTimeout(attempt, 100);
            }
        };
        attempt();
    });

    document.addEventListener(`ts-gf-install-${args.channel}`, event => {
        void chrome.runtime.sendMessage({type: args.type, url: (event as CustomEvent).detail}).catch(() => {});
    });

    // After the "?" help link that belongs to the site's button, when there is one.
    const help = link.nextElementSibling?.classList.contains('install-help-link') ? link.nextElementSibling : link;
    help.after(host);
    return true;
}

/**
 * Runs in the page's world, the only one sure to see navigations: cancels the
 * site's move to the .user.js after our button was pressed, or always when
 * .user.js links open in TamperSloth, and reports it. The site then carries on
 * to its post-install page, as it does when a manager takes the install.
 */
function greasyForkNavigationGuard(args: {channel: string; captureAll: boolean}) {
    const navigation = (window as any).navigation;
    if (!navigation) return;
    let armed = false;
    document.addEventListener(`ts-gf-arm-${args.channel}`, () => { armed = true; });
    // Armed, then the user dismissed the site's warning and pressed its own button instead.
    document.addEventListener('click', event => {
        if (event.isTrusted && (event.target as Element | null)?.closest?.('.install-link')) armed = false;
    }, true);
    navigation.addEventListener('navigate', (event: any) => {
        if ((!armed && !args.captureAll) || !event.cancelable) return;
        const url = String(event.destination?.url ?? '');
        if (!/\.user\.js(?:[?#]|$)/.test(url)) return;
        event.preventDefault();
        armed = false;
        document.dispatchEvent(new CustomEvent(`ts-gf-install-${args.channel}`, {detail: url}));
    });
}

/** Adds the button to Greasy Fork script pages and opens the install tab when it's clicked. */
export function installGreasyForkButton() {
    chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
        if (info.status !== 'complete' || !tab.url || !SCRIPT_PAGE.test(tab.url) || /\/post-install\b/.test(tab.url)) return;
        void (async () => {
            const channel = crypto.randomUUID();
            const [added] = await chrome.scripting.executeScript({
                target: {tabId},
                func: greasyForkButton,
                args: [{logo: LOGO, font: chrome.runtime.getURL('fonts/geist-latin-wght-normal.woff2'), type: GREASYFORK_INSTALL, channel}],
            });
            if (!added?.result) return;
            const {captureLinks} = await loadUserscriptPrefs();
            await chrome.scripting.executeScript({
                target: {tabId},
                world: 'MAIN',
                func: greasyForkNavigationGuard,
                args: [{channel, captureAll: captureLinks}],
            });
        })().catch(() => {});
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type === GREASYFORK_INSTALL) {
            // Only from our own button, in the top frame of a Greasy Fork script page.
            const page = (sender.url ?? '').match(SCRIPT_PAGE);
            const from = sender.tab;
            if (sender.id !== chrome.runtime.id || sender.frameId !== 0 || !from?.id || !page) return false;
            if (!isGreasyForkScriptUrl(message.url)) return false;
            void chrome.tabs.create({
                url: chrome.runtime.getURL(`index.html#/install?url=${encodeURIComponent(message.url)}`),
                index: from.index + 1,
                openerTabId: from.id,
                windowId: from.windowId,
            }).then(async tab => {
                if (tab.id === undefined) return;
                await chrome.storage.session.set({[returnKey(tab.id)]: {tabId: from.id, base: page[1], url: `${page[1]}/post-install`}});
            });
            return false;
        }
        if (message?.type === USERSCRIPT_INSTALLED) {
            // From the install tab: land on the script's post-install page and close the install tab.
            const installTab = sender.tab?.id;
            if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL('')) || installTab === undefined) return false;
            void (async () => {
                const key = returnKey(installTab);
                const target = (await chrome.storage.session.get(key))[key] as {tabId: number; base: string; url: string} | undefined;
                if (!target) return {returned: false};
                await chrome.storage.session.remove(key);
                // Only if that tab is still on the same script; otherwise the user has moved on.
                const origin = await chrome.tabs.get(target.tabId).catch(() => undefined);
                if (!origin?.url?.startsWith(target.base)) return {returned: false};
                // The site usually got there by itself while the review was open.
                await chrome.tabs.update(target.tabId, origin.url === target.url ? {active: true} : {url: target.url, active: true});
                await chrome.windows.update(origin.windowId, {focused: true}).catch(() => {});
                await chrome.tabs.remove(installTab).catch(() => {});
                return {returned: true};
            })().then(sendResponse, () => sendResponse({returned: false}));
            return true;
        }
        return false;
    });

    chrome.tabs.onRemoved.addListener(tabId => void chrome.storage.session.remove(returnKey(tabId)));
}
