import {savedScriptImageHelpers} from "@/background/images/imageScriptApi";

function buildStorageHelpers(scriptId: string, token: string): string {
    return `
        var __tampersloth_scriptId = ${JSON.stringify(scriptId)};
        var __tampersloth_token = ${JSON.stringify(token)};

        function __tampersloth_send(msg, retries) {
            msg.token = __tampersloth_token;
            retries = retries || 0;
            return chrome.runtime.sendMessage(msg).catch(function(err) {
                if (retries < 2 && /receiving end/i.test(err.message || '')) {
                    return new Promise(function(r) { setTimeout(r, 200); })
                        .then(function() { return __tampersloth_send(msg, retries + 1); });
                }
                throw err;
            });
        }

        function MH_setValue(key, value) {
            return __tampersloth_send({
                type: 'SCRIPT_SET_VALUE', scriptId: __tampersloth_scriptId, key: key, value: value
            }).then(function(r) { return r && r.ok; });
        }
        function MH_getValue(key) {
            return __tampersloth_send({
                type: 'SCRIPT_GET_VALUE', scriptId: __tampersloth_scriptId, key: key
            }).then(function(r) { return r ? r.value : null; });
        }
        function MH_deleteValue(key) {
            return __tampersloth_send({
                type: 'SCRIPT_DELETE_VALUE', scriptId: __tampersloth_scriptId, key: key
            }).then(function(r) { return r && r.ok; });
        }
        function MH_listValues() {
            return __tampersloth_send({
                type: 'SCRIPT_LIST_VALUES', scriptId: __tampersloth_scriptId
            }).then(function(r) { return r ? r.values : {}; });
        }
        ${savedScriptImageHelpers}
    `;
}

export function buildWrappedCode(
    code: string,
    fnName: string,
    scriptId?: string,
    token = '',
    temporaryHelpers = '',
): string {
    const storageHelpers = scriptId ? buildStorageHelpers(scriptId, token) : temporaryHelpers;
    const scriptIdJson = JSON.stringify(scriptId ?? '');
    const tokenJson = JSON.stringify(token);
    const reportExecution = scriptId ? `
        try { chrome.runtime.sendMessage({
            type: 'SCRIPT_EXECUTION_REPORT',
            scriptId: ${scriptIdJson},
            token: ${tokenJson},
            success: true,
            url: location.href
        }).catch(function() {}); } catch(e) {}
    ` : '';
    const reportError = scriptId ? `
        try { chrome.runtime.sendMessage({
            type: 'SCRIPT_EXECUTION_REPORT',
            scriptId: ${scriptIdJson},
            token: ${tokenJson},
            success: false,
            error: __err.message || String(__err),
            url: location.href
        }).catch(function() {}); } catch(e) {}
    ` : '';

    return `
(function() {
    // Per-script persistent storage helpers
    ${storageHelpers}

    // User code
    ${code}

    try {
        var __result = ${fnName}();
        ${reportExecution}
        return __result;
    } catch (__err) {
        ${reportError}
        throw __err;
    }
})();
    `.trim();
}
