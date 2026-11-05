import {temporaryImageToken} from "@/background/images/imageScriptApi";
import {imageForScript, listImages} from "@/storage/imageLibrary";
import {deleteScriptValue, getScriptValue, listScriptValues, setScriptValue} from "@/storage/scriptValues";
import {authenticateScript} from "./scriptRegistration";
import {handleGmRequest} from "./userscriptBridge";
import {pushToScript} from "./userscriptHost";

// Value writes for one script run in order; each rewrites the script's whole record.
const valueChains = new Map<string, Promise<unknown>>();
function queueValueWrite(scriptId: string, write: () => Promise<void>): Promise<void> {
    const next = (valueChains.get(scriptId) ?? Promise.resolve()).catch(() => {}).then(write);
    valueChains.set(scriptId, next);
    void next.catch(() => {}).finally(() => { if (valueChains.get(scriptId) === next) valueChains.delete(scriptId); });
    return next;
}

const answerImageRequest = async (message: any) => message.type === 'SCRIPT_GET_IMAGE'
    ? {image: await imageForScript(message.name)}
    : {images: await listImages()};

async function answerUserScript(message: any, sender: chrome.runtime.MessageSender): Promise<unknown> {
    const asksForImages = message.type === 'SCRIPT_GET_IMAGE' || message.type === 'SCRIPT_LIST_IMAGES';
    // One-off code the agent is running: it has no saved script to authenticate as, just the token it was given.
    if (asksForImages && typeof message.imageToken === 'string' && message.imageToken === await temporaryImageToken()) {
        return answerImageRequest(message);
    }
    const script = await authenticateScript(message);
    if (!script) return {denied: true, error: "TamperSloth doesn't recognise this script anymore. Reload the page."};
    switch (message.type) {
        // Installed userscripts go through GM_getImage and their own @grant instead.
        case 'SCRIPT_GET_IMAGE':
        case 'SCRIPT_LIST_IMAGES':
            return script.userscript ? {denied: true, error: "Installed userscripts read images with GM_getImage and @grant."} : answerImageRequest(message);
        case 'SCRIPT_GET_VALUE':
            await valueChains.get(script.id)?.catch(() => {});
            return {value: await getScriptValue(script.id, message.key)};
        case 'SCRIPT_SET_VALUE':
            await queueValueWrite(script.id, () => setScriptValue(script.id, message.key, message.value));
            // Its other tabs keep their copy of the values current, and listeners hear about it.
            pushToScript(script.id, {type: 'value', key: message.key, value: message.value}, message.instance);
            return {ok: true};
        case 'SCRIPT_DELETE_VALUE':
            await queueValueWrite(script.id, () => deleteScriptValue(script.id, message.key));
            pushToScript(script.id, {type: 'value', key: message.key, deleted: true}, message.instance);
            return {ok: true};
        case 'SCRIPT_LIST_VALUES':
            await valueChains.get(script.id)?.catch(() => {});
            return {values: await listScriptValues(script.id)};
        case 'SCRIPT_EXECUTION_REPORT':
            return {ok: true};
        default:
            return (await handleGmRequest(message, sender, script)) ?? {error: `Unknown request ${message.type}`};
    }
}

function handleUserScriptMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: (r: any) => void): boolean {
    if (typeof message?.type !== 'string' || !/^(SCRIPT|GM)_/.test(message.type)) return false;
    answerUserScript(message, sender).then(sendResponse, error => sendResponse({error: error?.message || String(error)}));
    return true;
}

export function installScriptMessages() {
    if (chrome.runtime.onUserScriptMessage) {
        chrome.runtime.onUserScriptMessage.addListener(handleUserScriptMessage);
    }
}
