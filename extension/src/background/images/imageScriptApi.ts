// What scripts call to use the image library, as code injected in front of them.

/** Kept as plain ES2017 so it reads the same as what runs in the page. */
export const IMAGE_HANDLE_JS = String.raw`
    function __tsImageHandle(i) {
        var blob = null, url = null;
        var handle = {
            name: i.name, mimeType: i.mimeType, size: i.size, width: i.width, height: i.height, description: i.description,
            dataUrl: 'data:' + i.mimeType + ';base64,' + i.base64,
            get blob() {
                if (blob) return blob;
                var bin = atob(i.base64), out = new Uint8Array(bin.length);
                for (var n = 0; n < bin.length; n++) out[n] = bin.charCodeAt(n);
                return blob = new Blob([out], {type: i.mimeType});
            },
            objectUrl: function () { return url || (url = URL.createObjectURL(handle.blob)); },
            bitmap: function () { return createImageBitmap(handle.blob); },
            file: function (filename) { return new File([handle.blob], filename || i.name, {type: i.mimeType}); },
        };
        return handle;
    }
    function __tsImageReply(r) {
        if (r && r.error) throw new Error(r.error);
        return r || {};
    }
`;

/** MH_getImage and MH_listImages, with `send` delivering a message to the background. */
function helpers(send: string, identity: string): string {
    return `${IMAGE_HANDLE_JS}
    function MH_getImage(name) {
        return ${send}({type: 'SCRIPT_GET_IMAGE', ${identity}name: String(name)}).then(function (r) {
            r = __tsImageReply(r);
            return r.image ? __tsImageHandle(r.image) : null;
        });
    }
    function MH_listImages() {
        return ${send}({type: 'SCRIPT_LIST_IMAGES', ${identity}}).then(function (r) { return __tsImageReply(r).images || []; });
    }
`;
}

/** For a saved script, which sends as itself through its storage helpers. */
export const savedScriptImageHelpers = helpers('__tampersloth_send', 'scriptId: __tampersloth_scriptId, ');

/** For code the agent is running once, which has no saved script to authenticate as. */
export const temporaryImageHelpers = (token: string) => helpers(
    `(function (m) { m.imageToken = ${JSON.stringify(token)}; return chrome.runtime.sendMessage(m); })`, '');

/** Whether code uses the helpers; other one-off code doesn't carry them or the token. */
export const usesImageHelpers = (code: string) => /\bMH_(?:getImage|listImages)\b/.test(code);

/** Answers to one-off code are limited to code that was handed this, which saved userscripts never are. */
export async function temporaryImageToken(): Promise<string> {
    const key = 'ts_temporary_image_token';
    const stored = (await chrome.storage.session.get(key))[key];
    if (typeof stored === 'string') return stored;
    const token = crypto.randomUUID();
    await chrome.storage.session.set({[key]: token});
    return token;
}
