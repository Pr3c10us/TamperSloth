import {loadUserscriptPrefs, USERSCRIPT_PREFS_KEY} from "@/userscripts/prefs";

// Opening a .user.js link goes to the install page, as with other userscript
// managers. A top-level navigation only: extension pages fetching scripts, and
// pages embedding them, aren't affected.

const RULE_ID = 1;

function captureRule(): chrome.declarativeNetRequest.Rule {
    return {
        id: RULE_ID,
        priority: 1,
        action: {
            type: "redirect" as chrome.declarativeNetRequest.RuleActionType,
            // The URL goes last and raw, since a redirect rule can't encode it; the install page reads it that way.
            redirect: {regexSubstitution: `${chrome.runtime.getURL("index.html")}#/install?src=\\1`},
        },
        condition: {
            regexFilter: "^(https?://[^#]*\\.user\\.js(?:\\?[^#]*)?)(?:#.*)?$",
            resourceTypes: ["main_frame" as chrome.declarativeNetRequest.ResourceType],
        },
    };
}

async function syncLinkCapture() {
    const {captureLinks} = await loadUserscriptPrefs();
    await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: captureLinks ? [captureRule()] : [],
    });
}

export function installUserscriptLinks() {
    if (!chrome.declarativeNetRequest) return;
    const sync = () => void syncLinkCapture().catch(error => console.warn("[Tampersloth] Could not update .user.js link handling:", error));
    sync();
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === "local" && USERSCRIPT_PREFS_KEY in changes) sync();
    });
}
