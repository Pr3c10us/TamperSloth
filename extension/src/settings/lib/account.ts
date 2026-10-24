import {setCreditsPerUsd} from "../../chat/lib/pricing";
import {trustPricingTab} from "./pricingTabs";

/**
 * The TamperSloth account: a session from Google sign-in on our server, which
 * then serves the Sloth models without an API key. Tokens stay in
 * chrome.storage.local next to the provider keys.
 */

// Set at build time from VITE_TAMPERSLOTH_API_URL (see vite.config.ts); undefined under the node tests.
declare const __TAMPERSLOTH_API_URL__: string | undefined;
export const SLOTH_API_URL: string = typeof __TAMPERSLOTH_API_URL__ === "string"
    ? __TAMPERSLOTH_API_URL__.replace(/\/+$/, "")
    : "https://api.tampersloth.com";

// Set at build time from VITE_TAMPERSLOTH_SITE_URL; undefined under the node tests.
declare const __TAMPERSLOTH_SITE_URL__: string | undefined;
export const SITE_URL: string = typeof __TAMPERSLOTH_SITE_URL__ === "string"
    ? __TAMPERSLOTH_SITE_URL__.replace(/\/+$/, "")
    : "https://tampersloth.com";

/** Where "Upgrade" sends a user for more Sloth credit. */
export const UPGRADE_URL = `${SITE_URL}/pricing`;

const SESSION_KEY = "ts_account_session";
const ACCOUNT_KEY = "ts_account_cache";

export interface AccountSession {
    token: string;
    refreshToken: string;
}

export interface SlothModelInfo {
    id: string;
    name: string;
    tagline: string;
    poweredBy: string;
    /** The vendor behind poweredBy, for its logo. */
    provider: string;
    /** USD per million tokens. */
    pricing: { input: number; output: number; cacheRead: number; cacheWrite: number };
    contextWindow: number;
    available: boolean;
}

export interface Account {
    user: { id: string; email: string };
    plan: {
        id: string;
        name: string;
        monthlyCreditUsd: number;
        requestsPerMinute: number;
        /** Most tokens one agent run may use on Sloth models; 0 means no limit. Enforced by the server. */
        runTokenBudget?: number;
        /** The Sloth model a new sign-in starts on. */
        defaultModel: string;
        /** The paid plan's subscription status; past_due pauses its credit. Missing from older servers. */
        status?: string | null;
    };
    /** creditsPerUsd: how many credits one US dollar buys; missing from servers older than the setting. */
    usage: { spentUsd: number; creditUsd: number; creditsPerUsd?: number; periodStart: string; periodEnd: string };
    models: SlothModelInfo[];
}

export interface AccountState {
    /** False until storage has been read, so the UI doesn't flash "signed out". */
    loaded: boolean;
    signedIn: boolean;
    /** Last account details fetched; kept across reloads so the picker draws at once. */
    account: Account | null;
}

function hasChromeStorage(): boolean {
    return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

async function read<T>(key: string): Promise<T | null> {
    if (hasChromeStorage()) return ((await chrome.storage.local.get(key))[key] as T) ?? null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
}

async function write(key: string, value: unknown): Promise<void> {
    if (value === null) {
        if (hasChromeStorage()) await chrome.storage.local.remove(key);
        else localStorage.removeItem(key);
        return;
    }
    if (hasChromeStorage()) await chrome.storage.local.set({[key]: value});
    else localStorage.setItem(key, JSON.stringify(value));
}

// ── Shared state ────────────────────────────────────────────

let state: AccountState = {loaded: false, signedIn: false, account: null};
const listeners = new Set<() => void>();

function setState(next: Partial<AccountState>) {
    state = {...state, ...next};
    // Credit amounts everywhere convert at the account's rate, set before listeners redraw.
    if (next.account) setCreditsPerUsd(next.account.usage.creditsPerUsd);
    for (const fn of listeners) fn();
}

let initialized: Promise<void> | null = null;

function init(): Promise<void> {
    initialized ??= (async () => {
        const [session, account] = await Promise.all([read<AccountSession>(SESSION_KEY), read<Account>(ACCOUNT_KEY)]);
        setState({loaded: true, signedIn: !!session, account: session ? account : null});
        // Sign-in or sign-out in another panel or the settings page.
        if (hasChromeStorage()) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== "local") return;
                if (SESSION_KEY in changes) {
                    const signedIn = !!changes[SESSION_KEY].newValue;
                    setState({signedIn, account: signedIn ? state.account : null});
                }
                if (ACCOUNT_KEY in changes && state.signedIn) {
                    setState({account: (changes[ACCOUNT_KEY].newValue as Account) ?? null});
                }
            });
        }
    })();
    return initialized;
}

/** Account changes, for useAccount; kept free of React so the background worker can import this file. */
export function subscribeAccount(fn: () => void) {
    void init();
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function accountSnapshot(): AccountState {
    return state;
}

export async function isSignedIn(): Promise<boolean> {
    await init();
    return state.signedIn;
}

/** The account while signed in: the cached copy, or a fresh fetch when there is none yet. */
export async function getAccount(): Promise<Account | null> {
    await init();
    if (!state.signedIn) return null;
    return state.account ?? refreshAccount();
}

// ── Tokens ──────────────────────────────────────────────────

/** Seconds since epoch when a JWT expires, or 0 when it can't be read. */
function expiresAt(token: string): number {
    try {
        const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return typeof payload.exp === "number" ? payload.exp : 0;
    } catch {
        return 0;
    }
}

/** Thrown when the session is gone and the user has to sign in again. */
export class SignedOutError extends Error {
    constructor() {
        super("Your TamperSloth session has expired. Sign in again in Settings.");
        this.name = "SignedOutError";
    }
}

let refreshing: Promise<string> | null = null;

async function refresh(session: AccountSession, transport: typeof fetch = fetch): Promise<string> {
    refreshing ??= (async () => {
        try {
            const response = await transport(`${SLOTH_API_URL}/auth/extension/token`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({refreshToken: session.refreshToken}),
            });
            if (response.status === 401 || response.status === 403 || response.status === 404) {
                await signOut();
                throw new SignedOutError();
            }
            if (!response.ok) throw new Error(`Couldn't renew the TamperSloth session (${response.status}).`);
            const {data} = await response.json() as { data: AccountSession };
            await write(SESSION_KEY, data);
            return data.token;
        } finally {
            refreshing = null;
        }
    })();
    return refreshing;
}

/** A current access token, renewed when it is within a day of expiring. */
export async function getAccessToken(options: { forceRefresh?: boolean; transport?: typeof fetch } = {}): Promise<string> {
    const session = await read<AccountSession>(SESSION_KEY);
    if (!session) throw new SignedOutError();
    const soon = Date.now() / 1000 + 24 * 3600;
    if (options.forceRefresh || expiresAt(session.token) < soon) return refresh(session, options.transport);
    return session.token;
}

/** fetch against the TamperSloth API with the session's token, renewing it once on a 401/403. */
export async function accountFetch(path: string, init: RequestInit = {}, transport: typeof fetch = fetch): Promise<Response> {
    const send = (token: string) => transport(`${SLOTH_API_URL}${path}`, {
        ...init,
        headers: {...init.headers as Record<string, string>, Authorization: `Bearer ${token}`},
    });
    const response = await send(await getAccessToken({transport}));
    if (response.status !== 401 && response.status !== 403) return response;
    // A 403 can also be a plan restriction; only retry when it is about the token.
    const body = await response.clone().json().catch(() => null) as { message?: string; code?: string } | null;
    if (body?.code || !/token|session/i.test(body?.message ?? "")) return response;
    return send(await getAccessToken({forceRefresh: true, transport}));
}

// ── Sign in / out ───────────────────────────────────────────

// Set at build time from VITE_GOOGLE_WEB_CLIENT_ID; undefined under the node tests.
declare const __TAMPERSLOTH_GOOGLE_WEB_CLIENT_ID__: string | undefined;
const GOOGLE_WEB_CLIENT_ID: string = typeof __TAMPERSLOTH_GOOGLE_WEB_CLIENT_ID__ === "string" ? __TAMPERSLOTH_GOOGLE_WEB_CLIENT_ID__ : "";

interface GoogleToken {
    token: string;
    /** "chrome" tokens come from Chrome's account sign-in and sit in its token cache. */
    source: "chrome" | "web";
}

/**
 * A Google access token: from Chrome's own account sign-in when the browser has
 * one, otherwise from Google's sign-in page in a popup (Edge, Brave and others
 * ship chrome.identity but not getAuthToken, or have browser sign-in turned off).
 */
async function googleToken(): Promise<GoogleToken> {
    if (!chrome?.identity) throw new Error("Google sign-in needs the extension's identity permission.");
    if (chrome.identity.getAuthToken) {
        try {
            const {token} = await chrome.identity.getAuthToken({interactive: true});
            if (!token) throw new Error("Sign-in was cancelled.");
            return {token, source: "chrome"};
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!/not supported|turned off browser signin|not signed in/i.test(message)) throw error;
        }
    }
    return {token: await webGoogleToken(), source: "web"};
}

/** Google's OAuth implicit flow in a launchWebAuthFlow popup, for browsers without Chrome's account sign-in. */
async function webGoogleToken(): Promise<string> {
    if (!GOOGLE_WEB_CLIENT_ID || !chrome.identity.launchWebAuthFlow) {
        throw new Error("Google sign-in in this browser isn't set up yet. Use Chrome, or try again after an update.");
    }
    const state = crypto.randomUUID();
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
        client_id: GOOGLE_WEB_CLIENT_ID,
        response_type: "token",
        redirect_uri: chrome.identity.getRedirectURL(),
        scope: "openid email profile",
        state,
        // No cached grant to revoke on sign-out here, so always offer the account chooser.
        prompt: "select_account",
    }).toString();

    let redirect: string | undefined;
    try {
        redirect = await chrome.identity.launchWebAuthFlow({url: url.toString(), interactive: true});
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/did not approve|cancel|closed/i.test(message)) throw new Error("Sign-in was cancelled.");
        throw error;
    }
    if (!redirect) throw new Error("Sign-in was cancelled.");
    const params = new URLSearchParams(new URL(redirect).hash.slice(1));
    if (params.get("error")) {
        throw new Error(params.get("error") === "access_denied" ? "Sign-in was cancelled." : `Google sign-in failed (${params.get("error")}).`);
    }
    const token = params.get("access_token");
    if (!token || params.get("state") !== state) throw new Error("Google sign-in failed. Try again.");
    return token;
}

/** Trades a Google token for a TamperSloth session. */
async function exchange(googleAccessToken: string): Promise<Response> {
    return fetch(`${SLOTH_API_URL}/auth/extension/google`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({accessToken: googleAccessToken}),
    });
}

/** Signs in with a Google account and keeps the session the server returns. */
export async function signIn(): Promise<Account | null> {
    let google = await googleToken();
    let response = await exchange(google.token);
    if (response.status === 401 && google.source === "chrome") {
        // Chrome hands back a cached token that Google may since have revoked; drop it and ask once more.
        await chrome.identity.removeCachedAuthToken({token: google.token});
        google = await googleToken();
        response = await exchange(google.token);
    }
    if (!response.ok) {
        const body = await response.json().catch(() => null) as { message?: string } | null;
        throw new Error(body?.message ?? `Sign-in failed (${response.status}). Try again.`);
    }
    const {data} = await response.json() as { data: AccountSession };
    await write(SESSION_KEY, {token: data.token, refreshToken: data.refreshToken} satisfies AccountSession);
    setState({signedIn: true});
    return refreshAccount();
}

export async function signOut(): Promise<void> {
    await Promise.all([write(SESSION_KEY, null), write(ACCOUNT_KEY, null)]);
    setState({signedIn: false, account: null});
    // Chrome remembers which Google account it granted this extension; clearing
    // its token cache alone just hands back a token for that same account. Revoking
    // the grant with Google makes the next sign-in ask (and offer the chooser) again.
    try {
        const {token} = await chrome.identity.getAuthToken({interactive: false});
        if (token) {
            await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {method: "POST"})
                .catch(() => undefined);
        }
    } catch { /* Not in Chrome, or no grant to revoke. */ }
    try {
        await chrome?.identity?.clearAllCachedAuthTokens?.();
    } catch { /* Not in Chrome, or nothing cached. */ }
}

// ── Plans ───────────────────────────────────────────────────

/**
 * Opens the pricing page. The website has no sign-in of its own: once it loads,
 * it asks this extension for a billing token, and a tab opened here gets one
 * without a click on the page (see pricingBridge). No token is ever in the URL.
 */
export async function openPricing(): Promise<void> {
    if (!chrome?.tabs?.create) {
        window.open(UPGRADE_URL, "_blank", "noopener");
        return;
    }
    // window.open after an await can lose the click and be blocked; a tab needs no user gesture.
    const tab = await chrome.tabs.create({url: UPGRADE_URL});
    if (tab.id !== undefined) await trustPricingTab(tab.id);
}

/**
 * A 30-minute token that only reaches the billing routes, for the pricing page;
 * null when signed out or the server can't be reached.
 */
export async function requestBillingToken(): Promise<string | null> {
    try {
        if (!(await isSignedIn())) return null;
        const response = await accountFetch("/api/v1/billing/token", {method: "POST"});
        if (!response.ok) return null;
        const {data} = await response.json() as { data: { token: string } };
        return data.token;
    } catch (error) {
        if (!(error instanceof SignedOutError)) console.warn("[Tampersloth] billing token request failed", error);
        return null;
    }
}

let accountRequest: Promise<Account | null> | null = null;

/** Fetches plan, usage and the model catalog; keeps the last copy when offline. */
export function refreshAccount(): Promise<Account | null> {
    accountRequest ??= (async () => {
        try {
            await init();
            if (!state.signedIn) return null;
            const response = await accountFetch("/api/v1/account");
            if (!response.ok) return state.account;
            const {data} = await response.json() as { data: Account };
            await write(ACCOUNT_KEY, data);
            setState({account: data});
            return data;
        } catch (error) {
            if (!(error instanceof SignedOutError)) console.warn("[Tampersloth] account refresh failed", error);
            return state.account;
        } finally {
            accountRequest = null;
        }
    })();
    return accountRequest;
}
