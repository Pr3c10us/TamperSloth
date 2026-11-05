export function hasUserScripts(): boolean {
    try {
        return typeof chrome.userScripts !== 'undefined'
            && typeof chrome.userScripts.execute === 'function';
    } catch {
        return false;
    }
}

// Actually exercises the API. A stale reference can survive the user toggling
// "Allow user scripts" off mid-session, so a presence check alone reports a
// false positive — getScripts() rejects once the permission is revoked.
export async function probeUserScripts(): Promise<boolean> {
    if (!hasUserScripts()) return false;
    try {
        await chrome.userScripts.getScripts();
        return true;
    } catch {
        return false;
    }
}

export function configureUserScriptsWorld() {
    if (!hasUserScripts()) return;
    try {
        chrome.userScripts.configureWorld({
            csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
            messaging: true,
        });
    } catch (e) {
        console.warn('[Tampersloth] Failed to configure userScripts world:', e);
    }
}
