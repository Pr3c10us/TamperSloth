/** Userscript settings, read by the background as well as the settings page. */
export interface UserscriptPrefs {
    /** Open .user.js links in TamperSloth's install page instead of showing their source. */
    captureLinks: boolean;
    /** Check daily for new versions and apply those that ask for nothing new. */
    autoUpdate: boolean;
}

export const USERSCRIPT_PREFS_KEY = "ts_userscript_prefs";

const DEFAULTS: UserscriptPrefs = {captureLinks: true, autoUpdate: true};

export async function loadUserscriptPrefs(): Promise<UserscriptPrefs> {
    const stored = await chrome.storage.local.get(USERSCRIPT_PREFS_KEY);
    return {...DEFAULTS, ...(stored[USERSCRIPT_PREFS_KEY] as Partial<UserscriptPrefs> | undefined)};
}

export async function saveUserscriptPrefs(changes: Partial<UserscriptPrefs>): Promise<void> {
    await chrome.storage.local.set({[USERSCRIPT_PREFS_KEY]: {...(await loadUserscriptPrefs()), ...changes}});
}
