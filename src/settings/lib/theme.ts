import {useSyncExternalStore} from "react";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

const KEY = "ts_theme";
export const DEFAULT_THEME: ThemePreference = "dark";
// Page backgrounds per theme, kept in sync with --background in index.css.
const THEME_COLORS: Record<ResolvedTheme, string> = {dark: "#141513", light: "#f3f4f2"};

let preference: ThemePreference = DEFAULT_THEME;
const listeners = new Set<() => void>();
const systemQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;

function hasChromeStorage(): boolean {
    return typeof chrome !== "undefined" && !!chrome?.storage?.local;
}

function normalize(value: unknown): ThemePreference {
    return value === "light" || value === "system" || value === "dark" ? value : DEFAULT_THEME;
}

function resolve(pref: ThemePreference): ResolvedTheme {
    if (pref !== "system") return pref;
    return systemQuery && !systemQuery.matches ? "light" : "dark";
}

/** localStorage mirrors chrome.storage so the first paint has the right theme without waiting on an async read. */
function readCache(): ThemePreference {
    try { return normalize(localStorage.getItem(KEY)); } catch { return DEFAULT_THEME; }
}

function writeCache(pref: ThemePreference) {
    try { localStorage.setItem(KEY, pref); } catch { /* storage unavailable */ }
}

function apply(pref: ThemePreference) {
    preference = pref;
    const theme = resolve(pref);
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
    listeners.forEach(listener => listener());
}

export async function loadThemePreference(): Promise<ThemePreference> {
    try {
        if (hasChromeStorage()) return normalize((await chrome.storage.local.get(KEY))[KEY]);
    } catch { /* fall through to the cache */ }
    return readCache();
}

export async function saveThemePreference(pref: ThemePreference): Promise<void> {
    const value = normalize(pref);
    writeCache(value);
    apply(value);
    if (hasChromeStorage()) await chrome.storage.local.set({[KEY]: value});
}

/** Applies the saved theme and keeps it current across pages and OS theme changes. Call once before render. */
export function initTheme() {
    apply(readCache());
    void loadThemePreference().then(value => { writeCache(value); if (value !== preference) apply(value); });
    systemQuery?.addEventListener("change", () => { if (preference === "system") apply(preference); });
    if (hasChromeStorage()) {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== "local" || !(KEY in changes)) return;
            const value = normalize(changes[KEY].newValue);
            writeCache(value);
            apply(value);
        });
    }
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

export function useThemePreference(): ThemePreference {
    return useSyncExternalStore(subscribe, () => preference);
}

export function useResolvedTheme(): ResolvedTheme {
    return useSyncExternalStore(subscribe, () => resolve(preference));
}
