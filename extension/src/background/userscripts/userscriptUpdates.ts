import type {BackgroundScript} from "@/userscripts/types";
import {loadScripts, saveScript} from "@/storage/scripts";
import {compareVersions, permissionsGrew, readMetaBlock} from "@/userscripts/userscript";
import {fetchUserscriptSource, installUserscript, openInstallPage, prepareUserscript} from "@/userscripts/installUserscript";
import {loadUserscriptPrefs} from "@/userscripts/prefs";

// New versions that ask for nothing new apply on their own, as in Tampermonkey.
// One asking for more (a new grant, site or @connect host) waits for the user's
// review, since installing it means agreeing to that.

export const CHECK_USERSCRIPT_UPDATE = "CHECK_USERSCRIPT_UPDATE";

type UpdateResult =
    | {status: "current"}
    | {status: "unavailable"}
    | {status: "updated"; version: string}
    | {status: "review"; version: string; url: string}
    | {status: "error"; error: string};

const ALARM = "ts-userscript-updates";
const NOTIFICATION_PREFIX = "ts-us-update|";

/** Where to read the latest version from (often a small .meta.js) and where to get the script itself. */
export function updateSources(us: {updateURL: string; downloadURL: string; sourceUrl: string}) {
    return {
        meta: us.updateURL || us.downloadURL || us.sourceUrl,
        download: us.downloadURL || (/\.user\.js(?:[?#]|$)/.test(us.updateURL) ? us.updateURL : "") || us.sourceUrl || us.updateURL,
    };
}

async function checkScript(script: BackgroundScript): Promise<UpdateResult> {
    const us = script.userscript;
    if (!us) return {status: "unavailable"};
    const {meta, download} = updateSources(us);
    if (!meta || !download || !us.version) return {status: "unavailable"};

    const latest = readMetaBlock(await fetchUserscriptSource(meta)).find(([key]) => key === "version")?.[1] ?? "";
    if (!latest || compareVersions(latest, us.version) <= 0) return {status: "current"};

    const draft = await prepareUserscript(await fetchUserscriptSource(download), download);
    if (compareVersions(draft.parsed.version, us.version) <= 0) return {status: "current"};
    // Always this script, even if the new version renamed itself.
    draft.existing = script;

    if (permissionsGrew(us, draft.parsed) || !download.startsWith("https:")) {
        const version = draft.parsed.version;
        const already = us.pendingUpdate?.version === version;
        await saveScript({...script, userscript: {...us, pendingUpdate: {version, url: download}}});
        if (!already) {
            await chrome.notifications.create(NOTIFICATION_PREFIX + script.id, {
                type: "basic",
                iconUrl: chrome.runtime.getURL("icon.png"),
                title: `${script.name} has an update to review`,
                message: `Version ${version} asks for new permissions. Click to see what changed.`,
            });
        }
        return {status: "review", version, url: download};
    }
    await installUserscript(draft);
    return {status: "updated", version: draft.parsed.version};
}

async function checkAll() {
    if (!(await loadUserscriptPrefs()).autoUpdate) return;
    for (const script of await loadScripts()) {
        if (!script.userscript) continue;
        // One script's dead link shouldn't stop the others.
        await checkScript(script).catch(error => console.warn(`[Tampersloth] Could not check ${script.name} for updates:`, error));
    }
}

export function installUserscriptUpdates() {
    // Created once: creating it again on every worker start would keep pushing the check back.
    void chrome.alarms.get?.(ALARM).then(alarm => {
        if (!alarm) void chrome.alarms.create(ALARM, {delayInMinutes: 5, periodInMinutes: 24 * 60});
    });
    chrome.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === ALARM) void checkAll();
    });

    chrome.notifications?.onClicked?.addListener(id => {
        if (!id.startsWith(NOTIFICATION_PREFIX)) return;
        void chrome.notifications.clear(id);
        void loadScripts().then(scripts => {
            const url = scripts.find(s => s.id === id.slice(NOTIFICATION_PREFIX.length))?.userscript?.pendingUpdate?.url;
            if (url) openInstallPage(url);
        });
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.type !== CHECK_USERSCRIPT_UPDATE) return false;
        if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(""))) return false;
        void loadScripts()
            .then(scripts => {
                const script = scripts.find(s => s.id === message.scriptId);
                return script ? checkScript(script) : ({status: "unavailable"} as UpdateResult);
            })
            .then(sendResponse, error => sendResponse({status: "error", error: error?.message || String(error)}));
        return true;
    });
}
