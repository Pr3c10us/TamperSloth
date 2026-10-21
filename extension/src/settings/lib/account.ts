import {useSyncExternalStore} from "react";

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

/** Where "Upgrade" sends a Free user for more Sloth credit. */
export const UPGRADE_URL = "https://tampersloth.com/pricing";

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
        /** The Sloth model a new sign-in starts on. */
        defaultModel: string;
    };
    usage: { spentUsd: number; creditUsd: number; periodStart: string; periodEnd: string };
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

function subscribe(fn: () => void) {
    void init();
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

export function useAccount(): AccountState {
    return useSyncExternalStore(subscribe, () => state);
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

/** A Google access token for the manifest's oauth2 client, from Chrome's own account sign-in. */
async function googleToken(): Promise<string> {
    if (!chrome?.identity?.getAuthToken) throw new Error("Google sign-in needs Chrome with the extension's identity permission.");
    try {
        const {token} = await chrome.identity.getAuthToken({interactive: true});
        if (!token) throw new Error("Sign-in was cancelled.");
        return token;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Edge, Brave and others ship chrome.identity but not Chrome's account sign-in.
        if (/not supported|turned off browser signin/i.test(message)) {
            throw new Error("Google sign-in needs Chrome signed in to a Google account.");
        }
        throw error;
    }
}

/** Trades a Google token for a TamperSloth session. */
async function exchange(googleAccessToken: string): Promise<Response> {
    return fetch(`${SLOTH_API_URL}/auth/extension/google`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({accessToken: googleAccessToken}),
    });
}

/** Signs in with the Google account Chrome is using and keeps the session the server returns. */
export async function signIn(): Promise<Account | null> {
    let googleAccessToken = await googleToken();
    let response = await exchange(googleAccessToken);
    if (response.status === 401) {
        // Chrome hands back a cached token that Google may since have revoked; drop it and ask once more.
        await chrome.identity.removeCachedAuthToken({token: googleAccessToken});
        googleAccessToken = await googleToken();
        response = await exchange(googleAccessToken);
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
