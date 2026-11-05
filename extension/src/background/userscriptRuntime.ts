import type {BackgroundScript, ImportedUserscript} from "../chat/lib/types";
import {grantKey, needsGmRelay, registrationMatches, runtimeUrlFilter} from "../scripts/userscript";

// Builds what an installed Tampermonkey-style userscript is registered with:
// a GM API shim in front of its @require code and source. Values live in the
// background; privileged calls (network, tabs, notifications, downloads,
// clipboard) are requests the background checks against the script's grants.

/** Each isolated userscript gets its own world, so scripts can't read each other's tokens. */
export const userscriptWorldId = (scriptId: string) => `tsw_${scriptId}`;

type InstalledUserscript = BackgroundScript & {userscript: ImportedUserscript};

/**
 * One registration, or two when a page-world script needs GM functions: the page
 * world can't message the extension, so a relay in the script's own world does.
 * Right-click scripts have none; they run through chrome.userScripts.execute.
 */
export function userscriptRegistrations(script: InstalledUserscript, token: string): chrome.userScripts.RegisteredUserScript[] {
    const us = script.userscript;
    const matches = registrationMatches(us);
    if (!matches.length || us.contextMenu) return [];
    const common = {
        matches,
        ...(us.excludeMatches.length ? {excludeMatches: us.excludeMatches} : {}),
        allFrames: us.allFrames,
    };
    const id = `tampersloth_${script.id}`;
    const injection = buildUserscriptInjection(script, token);
    return [
        ...(injection.relay ? [{
            ...common,
            id: `${id}_relay`,
            js: [{code: injection.relay}],
            runAt: "document_start" as const,
            world: "USER_SCRIPT" as const,
            worldId: userscriptWorldId(script.id),
        }] : []),
        {
            ...common,
            id,
            js: [{code: injection.main}],
            runAt: script.runAt,
            world: us.world,
            ...(us.world === "USER_SCRIPT" ? {worldId: userscriptWorldId(script.id)} : {}),
        },
    ];
}

/** The code to inject; the relay and main script share a fresh channel name. */
export function buildUserscriptInjection(script: InstalledUserscript, token: string): {relay?: string; main: string} {
    if (!needsGmRelay(script.userscript)) return {main: buildUserscriptCode(script, token)};
    const channel = crypto.randomUUID();
    return {relay: buildRelayCode(script, token, channel), main: buildUserscriptCode(script, token, channel)};
}

const VALUE_GRANTS = /\bGM(?:_getValues?|_listValues|_addValueChangeListener|\.getValues?|\.listValues)\b/;

function gmInfo(script: InstalledUserscript) {
    const us = script.userscript;
    const metaStr = script.code.match(/\/\/[ \t]*==UserScript==[\s\S]*?\/\/[ \t]*==\/UserScript==/)?.[0] ?? "";
    return {
        script: {
            name: script.name,
            namespace: us.namespace,
            version: us.version,
            description: script.description,
            author: us.author,
            homepage: us.homepage,
            matches: us.matches,
            includes: us.includes,
            excludes: us.excludes,
            grant: us.grants,
            connects: us.connects,
            "run-at": script.runAt.replace("_", "-"),
            resources: us.resources.map(({name, url}) => ({name, url})),
            noframes: !us.allFrames,
            uuid: script.id,
        },
        scriptMetaStr: metaStr,
        scriptHandler: "TamperSloth",
        version: chrome.runtime.getManifest().version,
        injectInto: us.world === "MAIN" ? "page" : "content",
    };
}

/** Runs in the script's own world at document_start: forwards the page-world script's requests, adding the token. */
function buildRelayCode(script: InstalledUserscript, token: string, channel: string): string {
    return `(function () {
    var __tsId = ${JSON.stringify(script.id)}, __tsToken = ${JSON.stringify(token)}, __tsChannel = ${JSON.stringify(channel)};
    function __tsEmit(name, data) { document.dispatchEvent(new CustomEvent('ts-' + name + '-' + __tsChannel, {detail: JSON.stringify(data)})); }
    function __tsDeliver(m) { __tsEmit('push', m); }
${PORT_RUNTIME}
    document.addEventListener('ts-ping-' + __tsChannel, function () { __tsEmit('ready', {}); });
    document.addEventListener('ts-port-' + __tsChannel, function (e) { __tsPortPost(JSON.parse(e.detail)); });
    document.addEventListener('ts-req-' + __tsChannel, function (e) {
        var d = JSON.parse(e.detail);
        if (!/^(SCRIPT|GM)_/.test(d.msg && d.msg.type)) return;
        d.msg.scriptId = __tsId;
        d.msg.token = __tsToken;
        chrome.runtime.sendMessage(d.msg).then(
            function (result) { __tsEmit('res', {id: d.id, result: result}); },
            function (err) { __tsEmit('res', {id: d.id, error: (err && err.message) || String(err)}); });
    });
    __tsEmit('ready', {});
})();`;
}

/** How the shim reaches the background from a page-world script: DOM events to its relay. The token stays with the relay. */
function relayTransport(channel: string): string {
    return `
    var __tsChannel = ${JSON.stringify(channel)}, __tsPending = {}, __tsRequests = 0;
    var __tsReady = new Promise(function (ok) {
        document.addEventListener('ts-ready-' + __tsChannel, ok, {once: true});
        document.dispatchEvent(new CustomEvent('ts-ping-' + __tsChannel));
    });
    document.addEventListener('ts-res-' + __tsChannel, function (e) {
        var d = JSON.parse(e.detail), p = __tsPending[d.id];
        if (!p) return;
        delete __tsPending[d.id];
        if (d.error) p.reject(new Error(d.error)); else p.resolve(d.result);
    });
    document.addEventListener('ts-push-' + __tsChannel, function (e) { __tsOnPush(JSON.parse(e.detail)); });
    function __tsRaw(msg) {
        return __tsReady.then(function () {
            return new Promise(function (resolve, reject) {
                var id = ++__tsRequests;
                __tsPending[id] = {resolve: resolve, reject: reject};
                document.dispatchEvent(new CustomEvent('ts-req-' + __tsChannel, {detail: JSON.stringify({id: id, msg: msg})}));
            });
        });
    }
    function __tsPortPost(msg) {
        __tsReady.then(function () { document.dispatchEvent(new CustomEvent('ts-port-' + __tsChannel, {detail: JSON.stringify(msg)})); });
    }`;
}

/** How the shim reaches the background from the script's own world: extension messaging directly. */
function directTransport(token: string): string {
    return `
    var __tsToken = ${JSON.stringify(token)};
    function __tsRaw(msg) { msg.token = __tsToken; return chrome.runtime.sendMessage(msg); }
    function __tsDeliver(m) { __tsOnPush(m); }
${PORT_RUNTIME}`;
}

export function buildUserscriptCode(script: InstalledUserscript, token: string, channel?: string): string {
    const us = script.userscript;
    const filter = runtimeUrlFilter(us);
    const urlCheck = filter.include || filter.exclude.length ? `
    var __tsUrl = location.href;
    var __tsTest = function (p) { return new RegExp(p[0], p[1]).test(__tsUrl); };
    if (${filter.include ? `!${JSON.stringify(filter.include)}.some(__tsTest) || ` : ""}${JSON.stringify(filter.exclude)}.some(__tsTest)) return;` : "";

    const body = `${us.requires.map((r) => `${r.code}\n;`).join("\n")}\n${script.code}\n`;
    const info = JSON.stringify(gmInfo(script));

    if (us.world === "MAIN" && !channel) {
        // The page's own world and no GM grants: only GM_info, as with @grant none.
        return `(function () {${urlCheck}
    var GM_info = ${info};
    var GM = {info: GM_info};
    var unsafeWindow = window;
    (function () {
${body}
    }).call(window);
})();`;
    }

    const preload = us.grants.some((g) => ["getvalue", "getvalues", "listvalues", "addvaluechangelistener"].includes(grantKey(g)))
        || VALUE_GRANTS.test(body);
    const resources = JSON.stringify(Object.fromEntries(us.resources.map((r) => [r.name, {mimeType: r.mimeType, data: r.data}])));

    return `(function () {${urlCheck}
    var GM_info = ${info};
    var __tsId = ${JSON.stringify(script.id)};
    var __tsInstance = Math.random().toString(36).slice(2);
    var __tsResources = ${resources};
    var __tsValues = {}, __tsListeners = {}, __tsSeq = 0;
    var __tsName = GM_info.script.name;
${channel ? relayTransport(channel) : directTransport(token)}
${GM_SHIM}
    function __tsRun() {
        try {
            (function () {
${body}
            }).call(window);
            __tsSend({type: 'SCRIPT_EXECUTION_REPORT', success: true, url: location.href}).catch(function () {});
        } catch (__err) {
            console.error('[' + __tsName + ']', __err);
            __tsSend({type: 'SCRIPT_EXECUTION_REPORT', success: false, error: (__err && __err.message) || String(__err), url: location.href}).catch(function () {});
        }
    }
    ${preload
        // Never hold the script back for long if the values don't come; it starts with what it has.
        ? `__tsPortPost({type: 'open', instance: __tsInstance});
    Promise.race([
        __tsSend({type: 'SCRIPT_LIST_VALUES'}).then(function (r) { __tsValues = (r && r.values) || {}; }, __tsWarn),
        new Promise(function (ok) { setTimeout(ok, 4000); }),
    ]).then(__tsRun);`
        : "__tsRun();"}
})();`;
}

// The long-lived channel the background pushes on: other tabs' value changes,
// menu clicks, closed tabs, audio state. Reconnects when the worker restarts,
// re-sending what the background needs to remember. Shared by shim and relay.
const PORT_RUNTIME = String.raw`
    var __tsPort = null, __tsPortInstance = null, __tsPortStopped = false, __tsMenuMsg = null, __tsWatchAudio = false;
    function __tsPortConnect() {
        if (__tsPortStopped) return;
        var p;
        try { p = chrome.runtime.connect({name: 'ts-userscript'}); } catch (e) { return; }
        __tsPort = p;
        p.onMessage.addListener(function (m) {
            if (m && m.type === 'bye') { __tsPortStopped = true; return; }
            __tsDeliver(m);
        });
        p.onDisconnect.addListener(function () {
            if (__tsPort === p) __tsPort = null;
            setTimeout(__tsPortConnect, 2000);
        });
        p.postMessage({type: 'hello', scriptId: __tsId, token: __tsToken, instance: __tsPortInstance});
        if (__tsMenuMsg) p.postMessage(__tsMenuMsg);
        if (__tsWatchAudio) p.postMessage({type: 'audio-watch'});
    }
    function __tsPortPost(msg) {
        if (msg.type === 'open') {
            if (__tsPortInstance) return;
            __tsPortInstance = msg.instance;
            __tsPortConnect();
            return;
        }
        if (msg.type === 'menu') __tsMenuMsg = msg;
        if (msg.type === 'audio-watch') __tsWatchAudio = true;
        if (__tsPort) { try { __tsPort.postMessage(msg); } catch (e) {} }
    }
`;

// Kept as plain ES2017 so it reads the same as what runs in the page.
const GM_SHIM = String.raw`
    function __tsSend(msg, retries) {
        msg.scriptId = __tsId;
        msg.instance = __tsInstance;
        retries = retries || 0;
        return __tsRaw(msg).then(function (r) {
            if (r && r.denied) throw new Error(r.error);
            return r;
        }, function (err) {
            if (retries < 2 && /receiving end/i.test(err.message || '')) {
                return new Promise(function (ok) { setTimeout(ok, 200); }).then(function () { return __tsSend(msg, retries + 1); });
            }
            throw err;
        });
    }
    function __tsWarn(err) { console.warn('[' + __tsName + ']', (err && err.message) || err); }
    function __tsCall(fn, arg) { if (typeof fn === 'function') { try { fn(arg); } catch (e) { console.error('[' + __tsName + ']', e); } } }
    function __tsCopy(v) { return v === undefined ? v : structuredClone(v); }
    function __tsBytes(b64) {
        var bin = atob(b64), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function __tsBase64(bytes) {
        var s = '';
        for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(s);
    }
    var unsafeWindow = window;

    // Values are loaded before the script starts, so reads are synchronous as in Tampermonkey.
    function __tsNotify(key, oldValue, newValue, remote) {
        for (var id in __tsListeners) {
            var l = __tsListeners[id];
            if (l.key === key) { try { l.fn(key, oldValue, newValue, !!remote); } catch (e) { console.error('[' + __tsName + ']', e); } }
        }
    }
    var __tsMenu = {}, __tsOpenedTabs = {}, __tsAudioListeners = [];
    function __tsOpenChannel() { __tsPortPost({type: 'open', instance: __tsInstance}); }
    function __tsOnPush(m) {
        if (m.type === 'value') {
            var old = __tsValues[m.key];
            if (m.deleted) delete __tsValues[m.key]; else __tsValues[m.key] = m.value;
            __tsNotify(m.key, old, m.deleted ? undefined : __tsCopy(m.value), true);
        } else if (m.type === 'menu') {
            var command = __tsMenu[m.id];
            if (command) __tsCall(command.fn);
        } else if (m.type === 'tab-closed') {
            var handle = __tsOpenedTabs[m.tabId];
            if (handle) { delete __tsOpenedTabs[m.tabId]; handle.closed = true; __tsCall(handle.onclose); }
        } else if (m.type === 'audio') {
            __tsAudioListeners.slice().forEach(function (fn) { __tsCall(fn, m.state); });
        }
    }
    function __tsSetValue(key, value) {
        if (value === undefined) return __tsDeleteValue(key);
        key = String(key);
        var old = __tsValues[key];
        __tsValues[key] = __tsCopy(value);
        __tsNotify(key, old, value);
        return __tsSend({type: 'SCRIPT_SET_VALUE', key: key, value: __tsValues[key]}).then(function () {}, __tsWarn);
    }
    function __tsDeleteValue(key) {
        key = String(key);
        var old = __tsValues[key];
        delete __tsValues[key];
        __tsNotify(key, old, undefined);
        return __tsSend({type: 'SCRIPT_DELETE_VALUE', key: key}).then(function () {}, __tsWarn);
    }
    function GM_getValue(key, defaultValue) {
        return Object.prototype.hasOwnProperty.call(__tsValues, key) ? __tsCopy(__tsValues[key]) : defaultValue;
    }
    function GM_setValue(key, value) { __tsSetValue(key, value); }
    function GM_deleteValue(key) { __tsDeleteValue(key); }
    function GM_listValues() { return Object.keys(__tsValues); }
    function GM_getValues(keys) {
        var out = {};
        if (Array.isArray(keys)) keys.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(__tsValues, k)) out[k] = GM_getValue(k); });
        else for (var k in keys) out[k] = GM_getValue(k, keys[k]);
        return out;
    }
    function GM_setValues(values) { for (var k in values) __tsSetValue(k, values[k]); }
    function GM_deleteValues(keys) { keys.forEach(function (k) { __tsDeleteValue(k); }); }
    function GM_addValueChangeListener(key, fn) { __tsOpenChannel(); var id = ++__tsSeq; __tsListeners[id] = {key: String(key), fn: fn}; return id; }
    function GM_removeValueChangeListener(id) { delete __tsListeners[id]; }

    function GM_addStyle(css) {
        var style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }
    function GM_addElement(parent, tag, attrs) {
        if (typeof parent === 'string') { attrs = tag; tag = parent; parent = null; }
        var el = document.createElement(tag);
        for (var k in attrs || {}) {
            if (k === 'textContent') el.textContent = attrs[k];
            else el.setAttribute(k, attrs[k]);
        }
        var fallback = /^(script|style|link|meta)$/i.test(tag) ? document.head : document.body;
        (parent || fallback || document.documentElement).appendChild(el);
        return el;
    }
    function GM_log() { console.log.apply(console, ['[' + __tsName + ']'].concat([].slice.call(arguments))); }
    function GM_getResourceText(name) {
        var r = __tsResources[name];
        return r ? new TextDecoder().decode(__tsBytes(r.data)) : null;
    }
    function GM_getResourceURL(name) {
        var r = __tsResources[name];
        return r ? 'data:' + r.mimeType + ';base64,' + r.data : null;
    }
    function __tsMenuSync() {
        __tsOpenChannel();
        __tsPortPost({type: 'menu', commands: Object.keys(__tsMenu).map(function (id) { return {id: id, caption: __tsMenu[id].caption}; })});
    }
    function GM_registerMenuCommand(caption, fn, options) {
        var id = String((options && typeof options === 'object' && options.id) || 'm' + (++__tsSeq));
        __tsMenu[id] = {caption: String(caption), fn: fn};
        __tsMenuSync();
        return id;
    }
    function GM_unregisterMenuCommand(id) { delete __tsMenu[id]; __tsMenuSync(); }

    function __tsAnswer(request) {
        return __tsSend(request).then(function (r) { if (r && r.error) throw new Error(r.error); return r; });
    }
    function __tsTabRequest(action, tab) { return __tsAnswer({type: 'GM_TAB', action: action, tab: tab}); }
    function GM_getTab(cb) { __tsTabRequest('get').then(function (r) { __tsCall(cb, r.tab); }).catch(__tsWarn); }
    function GM_saveTab(tab, cb) { __tsTabRequest('save', tab).then(function () { __tsCall(cb); }).catch(__tsWarn); }
    function GM_getTabs(cb) { __tsTabRequest('list').then(function (r) { __tsCall(cb, r.tabs); }).catch(__tsWarn); }

    function __tsCookie(action, details, cb) {
        var done = __tsAnswer({type: 'GM_COOKIE', action: action, details: details || {}}).then(function (r) { return r.result; });
        if (typeof cb === 'function') done.then(function (result) { cb(result, undefined); }, function (err) { cb(undefined, err.message); });
        return done;
    }
    function GM_cookie(action, details, cb) { __tsCookie(action, details, cb).catch(__tsWarn); }
    GM_cookie.list = function (d, cb) { __tsCookie('list', d, cb).catch(__tsWarn); };
    GM_cookie.set = function (d, cb) { __tsCookie('set', d, cb).catch(__tsWarn); };
    GM_cookie.delete = function (d, cb) { __tsCookie('delete', d, cb).catch(__tsWarn); };

    var GM_audio = {
        setMute: function (details, cb) {
            __tsAnswer({type: 'GM_AUDIO', action: 'setMute', isMuted: !!(details && details.isMuted)})
                .then(function () { __tsCall(cb); }, function (err) { __tsCall(cb, err.message); });
        },
        getState: function (cb) {
            __tsAnswer({type: 'GM_AUDIO', action: 'getState'}).then(function (r) { __tsCall(cb, r.state); }).catch(__tsWarn);
        },
        addStateChangeListener: function (fn, cb) {
            __tsAudioListeners.push(fn);
            __tsOpenChannel();
            __tsPortPost({type: 'audio-watch'});
            __tsCall(cb);
        },
        removeStateChangeListener: function (fn, cb) {
            __tsAudioListeners = __tsAudioListeners.filter(function (l) { return l !== fn; });
            __tsCall(cb);
        },
    };

    function GM_openInTab(url, options) {
        var background = options === true || (options && typeof options === 'object' && (options.active === false || options.loadInBackground === true));
        __tsOpenChannel();
        var handle = {closed: false, onclose: null, close: function () {
            opened.then(function (r) { if (r && r.tabId !== undefined) return __tsSend({type: 'GM_CLOSE_TAB', tabId: r.tabId}); }).catch(function () {});
        }};
        var opened = __tsSend({
            type: 'GM_OPEN_TAB', url: new URL(url, location.href).href, active: !background,
            insert: !(options && typeof options === 'object' && options.insert === false),
        }).then(function (r) {
            if (r && r.error) throw new Error(r.error);
            if (r && r.tabId !== undefined) __tsOpenedTabs[r.tabId] = handle;
            return r;
        });
        opened.catch(__tsWarn);
        return handle;
    }
    function GM_setClipboard(data, info, cb) {
        return __tsSend({type: 'GM_SET_CLIPBOARD', text: String(data)}).then(function (r) {
            if (r && r.error) throw new Error(r.error);
            __tsCall(typeof info === 'function' ? info : cb);
        }).catch(__tsWarn);
    }
    function GM_notification(details, title, image, onclick) {
        if (typeof details !== 'object' || details === null) details = {text: String(details), title: title, image: image, onclick: onclick};
        return __tsSend({
            type: 'GM_NOTIFICATION', text: String(details.text || ''), title: String(details.title || __tsName),
            image: typeof details.image === 'string' ? details.image : '', timeout: Number(details.timeout) || 0,
        }).then(function (r) {
            if (r && r.error) throw new Error(r.error);
            if (r && r.clicked) __tsCall(details.onclick);
            __tsCall(details.ondone, r && r.clicked);
        }).catch(__tsWarn);
    }
    function GM_download(details, name) {
        if (typeof details === 'string') details = {url: details, name: name};
        var done = __tsSend({type: 'GM_DOWNLOAD', url: new URL(details.url, location.href).href, name: String(details.name || ''), saveAs: !!details.saveAs})
            .then(function (r) {
                if (r && r.error) { __tsCall(details.onerror, {error: r.error}); throw new Error(r.error); }
                __tsCall(details.onload, {});
            });
        done.catch(__tsWarn);
        return {abort: function () {}, done: done};
    }

    function GM_xmlhttpRequest(d) {
        var requestId = __tsId + ':' + (++__tsSeq) + ':' + Math.random().toString(36).slice(2);
        var url = new URL(d.url, location.href).href;
        var finished = false;
        var data = d.data, body = null, bodyType = 'none';
        if (data == null) {}
        else if (typeof data === 'string') { body = data; bodyType = 'text'; }
        else if (data instanceof URLSearchParams) { body = data.toString(); bodyType = 'urlencoded'; }
        else if (typeof FormData !== 'undefined' && data instanceof FormData) {
            body = []; data.forEach(function (v, k) { body.push([k, typeof v === 'string' ? v : String(v)]); }); bodyType = 'form';
        }
        else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
            body = __tsBase64(new Uint8Array(data.buffer || data, data.byteOffset || 0, data.byteLength)); bodyType = 'base64';
        }
        else { body = String(data); bodyType = 'text'; }

        var base = {readyState: 4, status: 0, statusText: '', responseHeaders: '', responseText: '', response: null, finalUrl: url, context: d.context};
        function fail(handler, extra) {
            if (finished) return; finished = true;
            var ev = Object.assign({}, base, extra);
            __tsCall(d[handler], ev);
            __tsCall(d.onloadend, ev);
        }
        __tsCall(d.onloadstart, Object.assign({}, base, {readyState: 1}));
        __tsSend({
            type: 'GM_XHR', requestId: requestId, method: String(d.method || 'GET').toUpperCase(), url: url,
            headers: d.headers || {}, body: body, bodyType: bodyType, timeout: Number(d.timeout) || 0,
            anonymous: !!d.anonymous, binary: d.responseType === 'arraybuffer' || d.responseType === 'blob',
        }).then(function (r) {
            if (finished) return;
            if (!r || r.error) {
                if (r && r.timeout) return fail('ontimeout', {error: 'timeout'});
                if (r && r.aborted) return;
                return fail('onerror', {error: (r && r.error) || 'Request failed'});
            }
            finished = true;
            var bytes = r.base64 !== undefined ? __tsBytes(r.base64) : null;
            var text = bytes ? '' : (r.text || '');
            var type = d.overrideMimeType || r.contentType || '';
            var response = text;
            if (d.responseType === 'json') { try { response = JSON.parse(text); } catch (e) { response = undefined; } }
            else if (d.responseType === 'arraybuffer') response = bytes.buffer;
            else if (d.responseType === 'blob') response = new Blob([bytes], {type: type});
            else if (d.responseType === 'document') response = new DOMParser().parseFromString(text, /xml/.test(type) ? 'text/xml' : 'text/html');
            var res = Object.assign({}, base, {
                status: r.status, statusText: r.statusText, responseHeaders: r.headers, responseText: text,
                response: response, finalUrl: r.finalUrl || url,
            });
            if (/xml|html/.test(type) && text && d.responseType !== 'document') {
                Object.defineProperty(res, 'responseXML', {get: function () { return new DOMParser().parseFromString(text, /xml/.test(type) ? 'text/xml' : 'text/html'); }});
            }
            __tsCall(d.onreadystatechange, res);
            __tsCall(d.onload, res);
            __tsCall(d.onloadend, res);
        }, function (err) { fail('onerror', {error: err.message || String(err)}); });
        return {abort: function () {
            if (finished) return;
            __tsSend({type: 'GM_XHR_ABORT', requestId: requestId}).catch(function () {});
            fail('onabort', {error: 'aborted'});
        }};
    }

    var GM = {
        info: GM_info,
        getValue: function (k, d) { return Promise.resolve(GM_getValue(k, d)); },
        setValue: function (k, v) { return __tsSetValue(k, v); },
        deleteValue: function (k) { return __tsDeleteValue(k); },
        listValues: function () { return Promise.resolve(GM_listValues()); },
        getValues: function (k) { return Promise.resolve(GM_getValues(k)); },
        setValues: function (v) { return Promise.all(Object.keys(v).map(function (k) { return __tsSetValue(k, v[k]); })).then(function () {}); },
        deleteValues: function (k) { return Promise.all(k.map(__tsDeleteValue)).then(function () {}); },
        addValueChangeListener: function (k, f) { return Promise.resolve(GM_addValueChangeListener(k, f)); },
        removeValueChangeListener: function (id) { GM_removeValueChangeListener(id); return Promise.resolve(); },
        addStyle: function (css) { return Promise.resolve(GM_addStyle(css)); },
        addElement: function (a, b, c) { return Promise.resolve(GM_addElement(a, b, c)); },
        getResourceUrl: function (n) { return Promise.resolve(GM_getResourceURL(n)); },
        getResourceURL: function (n) { return Promise.resolve(GM_getResourceURL(n)); },
        getResourceText: function (n) { return Promise.resolve(GM_getResourceText(n)); },
        openInTab: function (u, o) { return Promise.resolve(GM_openInTab(u, o)); },
        setClipboard: function (d, i) { return GM_setClipboard(d, i); },
        notification: function (d, t, i, c) { return GM_notification(d, t, i, c); },
        download: function (d, n) { return GM_download(d, n).done; },
        registerMenuCommand: function (c, f, o) { return Promise.resolve(GM_registerMenuCommand(c, f, o)); },
        unregisterMenuCommand: function (id) { GM_unregisterMenuCommand(id); return Promise.resolve(); },
        getTab: function () { return __tsTabRequest('get').then(function (r) { return r.tab; }); },
        saveTab: function (t) { return __tsTabRequest('save', t).then(function () {}); },
        getTabs: function () { return __tsTabRequest('list').then(function (r) { return r.tabs; }); },
        cookie: {
            list: function (d) { return __tsCookie('list', d); },
            set: function (d) { return __tsCookie('set', d); },
            delete: function (d) { return __tsCookie('delete', d); },
        },
        audio: {
            setMute: function (d) { return __tsAnswer({type: 'GM_AUDIO', action: 'setMute', isMuted: !!(d && d.isMuted)}).then(function () {}); },
            getState: function () { return __tsAnswer({type: 'GM_AUDIO', action: 'getState'}).then(function (r) { return r.state; }); },
        },
        log: GM_log,
        xmlHttpRequest: function (d) {
            var req;
            var p = new Promise(function (resolve, reject) {
                req = GM_xmlhttpRequest(Object.assign({}, d, {
                    onload: function (r) { __tsCall(d.onload, r); resolve(r); },
                    onerror: function (r) { __tsCall(d.onerror, r); reject(r); },
                    ontimeout: function (r) { __tsCall(d.ontimeout, r); reject(r); },
                    onabort: function (r) { __tsCall(d.onabort, r); reject(r); },
                }));
            });
            p.abort = function () { req.abort(); };
            return p;
        },
    };
`;
