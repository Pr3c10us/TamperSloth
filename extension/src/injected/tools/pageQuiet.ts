/**
 * Runs in the page: resolves with its URL once the DOM has gone `quietMs` without changing, or
 * after `capMs`. Injection waits for the document to be parsed, so this is "parsed and settled".
 * With `needChange`, quiet only counts after something changed (suggestions arriving after typing).
 */
export function pageQuiet(quietMs: number, capMs: number, needChange = false) {
    return new Promise<string>(resolve => {
        const start = performance.now();
        let last = start, changed = false;
        const observer = new MutationObserver(() => { last = performance.now(); changed = true; });
        observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
        const check = () => {
            const now = performance.now();
            if (((changed || !needChange) && now - last >= quietMs) || now - start >= capMs) { observer.disconnect(); resolve(location.href); }
            else setTimeout(check, 25);
        };
        setTimeout(check, quietMs);
    });
}
