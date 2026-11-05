import {loadScripts} from "@/storage/scripts";
import type {BackgroundScript, ImportedUserscript} from "@/userscripts/types";
import {refreshUserscriptMenus} from "./userscriptHost";
import {userscriptRegistrations, userscriptWorldId} from "./userscriptRuntime";
import {configureUserScriptsWorld, hasUserScripts} from "./scriptWorld";
import {buildWrappedCode} from "./wrapScriptCode";

let cachedScripts: BackgroundScript[] | null = null;

export async function getScripts(): Promise<BackgroundScript[]> {
    if (!cachedScripts) cachedScripts = await loadScripts();
    return cachedScripts;
}

export function invalidateCache() {
    cachedScripts = null;
}

// Registered code carries its script's token, and a message naming a script is
// trusted only with it, so one script can't read another's values or act as it.
const TOKENS_KEY = 'ts_script_tokens';
let tokenCache: Record<string, string> | null = null;
let tokenChain: Promise<unknown> = Promise.resolve();

export function scriptTokens(scripts: BackgroundScript[]): Promise<Record<string, string>> {
    const task = tokenChain.catch(() => {}).then(async () => {
        if (!tokenCache) tokenCache = ((await chrome.storage.local.get(TOKENS_KEY))[TOKENS_KEY] as Record<string, string>) ?? {};
        const current = tokenCache;
        const next = Object.fromEntries(scripts.map(s => [s.id, current[s.id] ?? crypto.randomUUID()]));
        const changed = Object.keys(next).length !== Object.keys(current).length || Object.keys(next).some(id => next[id] !== current[id]);
        if (changed) {
            tokenCache = next;
            await chrome.storage.local.set({[TOKENS_KEY]: next});
        }
        return tokenCache;
    });
    tokenChain = task;
    return task;
}

export async function authenticateScript(message: any): Promise<BackgroundScript | null> {
    if (typeof message.scriptId !== 'string' || typeof message.token !== 'string') return null;
    const scripts = await getScripts();
    const script = scripts.find(s => s.id === message.scriptId);
    if (!script) return null;
    return (await scriptTokens(scripts))[script.id] === message.token ? script : null;
}

let syncChain: Promise<void> = Promise.resolve();
export function syncRegisteredScripts() {
    syncChain = syncChain.catch(() => {}).then(syncRegisteredScriptsNow);
    return syncChain;
}
async function syncRegisteredScriptsNow() {
    if (!hasUserScripts()) {
        console.warn('[Tampersloth] Skipping script registration — userScripts API not available. Go to chrome://extensions > Tampersloth details > enable "Allow User Scripts", then reload.');
        return;
    }

    // Ensure world is configured (may not have been at startup)
    configureUserScriptsWorld();

    try {
        // Unregister all existing tampersloth userscripts
        const existing = await chrome.userScripts.getScripts();
        const tamperslothIds = existing
            .filter((s: any) => s.id.startsWith('tampersloth_'))
            .map((s: any) => s.id);
        if (tamperslothIds.length) {
            await chrome.userScripts.unregister({ids: tamperslothIds});
        }

        const scripts = await getScripts();
        const tokens = await scriptTokens(scripts);
        const registrations: chrome.userScripts.RegisteredUserScript[] = [];
        const worlds = new Set<string>();
        for (const script of scripts) {
            if (script.status !== 'active') continue;
            if (script.userscript) {
                registrations.push(...userscriptRegistrations(script as BackgroundScript & {userscript: ImportedUserscript}, tokens[script.id]));
                // Right-click scripts register nothing but still run in their own world.
                if (script.userscript.contextMenu) worlds.add(userscriptWorldId(script.id));
                continue;
            }
            if (!script.urlMatchPattern) continue;
            const fnMatch = script.code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
            const fnName = fnMatch?.[1] ?? 'main';
            registrations.push({
                id: `tampersloth_${script.id}`,
                matches: [script.urlMatchPattern] as string[],
                js: [{code: buildWrappedCode(script.code, fnName, script.id, tokens[script.id])}],
                runAt: (script.runAt ?? 'document_idle') as 'document_start' | 'document_end' | 'document_idle',
                world: 'USER_SCRIPT' as const,
            });
        }

        // Each isolated userscript has its own world; forget worlds whose script is gone or paused.
        for (const {worldId} of registrations) if (worldId) worlds.add(worldId);
        for (const worldId of worlds) {
            await chrome.userScripts.configureWorld({worldId, csp: "script-src 'self' 'unsafe-eval' 'unsafe-inline'", messaging: true});
        }
        for (const world of await chrome.userScripts.getWorldConfigurations()) {
            if (world.worldId?.startsWith('tsw_') && !worlds.has(world.worldId)) {
                await chrome.userScripts.resetWorldConfiguration(world.worldId);
            }
        }

        if (registrations.length === 0) return;
        try {
            await chrome.userScripts.register(registrations);
        } catch (e) {
            // One bad registration rejects the whole batch; keep the rest running.
            console.warn('[Tampersloth] Batch registration failed, registering one by one:', e);
            for (const registration of registrations) {
                await chrome.userScripts.register([registration])
                    .catch(error => console.error(`[Tampersloth] Could not register ${registration.id}:`, error));
            }
        }
        console.log(`[Tampersloth] Registered ${registrations.length} userscripts`);
    } catch (e) {
        console.error('[Tampersloth] Failed to sync registered scripts:', e);
    }
}

export function installScriptRegistration() {
    configureUserScriptsWorld();
    // Re-sync whenever scripts change in storage
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes['ts_background_scripts']) {
            invalidateCache();
            syncRegisteredScripts();
            refreshUserscriptMenus();
        }
    });

    // Initial sync on extension startup
    syncRegisteredScripts();
}
