/**
 * Runs in the page after a selector misses. Models guess site markup ("summary",
 * "img.avatar"); sending them back to getPageStructure loops when the capture stops
 * above the target. Returns real controls they can select directly instead.
 */
export function explainNoMatch(sel: string) {
    const split = (text: string, isSep: (ch: string) => boolean) => {
        const out: string[] = [];
        let cur = "", quote = "", nest = 0;
        for (const ch of text) {
            if (quote) { if (ch === quote) quote = ""; }
            else if (ch === '"' || ch === "'") quote = ch;
            else if (ch === "[" || ch === "(") nest++;
            else if (ch === "]" || ch === ")") nest--;
            else if (nest === 0 && isSep(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ""; continue; }
            cur += ch;
        }
        if (cur.trim()) out.push(cur.trim());
        return out;
    };
    const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const quoteAttr = (v: string) => '"' + v.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    const selectorFor = (el: Element) => {
        const tag = el.tagName.toLowerCase();
        if (el.id) return "#" + CSS.escape(el.id);
        for (const attr of ["data-testid", "aria-label", "alt", "title", "name"]) {
            const v = el.getAttribute(attr);
            if (v && v.length <= 80) return tag + "[" + attr + "=" + quoteAttr(v) + "]";
        }
        const href = el.getAttribute("href");
        if (href && href.length <= 80) return tag + "[href=" + quoteAttr(href) + "]";
        return tag + (el.classList[0] ? "." + CSS.escape(el.classList[0]) : "");
    };
    const describe = (el: Element) => {
        const selector = selectorFor(el);
        const label = (el.getAttribute("aria-label") || el.getAttribute("alt") || el.textContent || "")
            .trim().replace(/\s+/g, " ").slice(0, 60);
        return {selector, matches: document.querySelectorAll(selector).length, ...(label && {label})};
    };
    const INTERACTIVE = 'a[href],button,summary,[role="button"],[role="menuitem"],[role="link"],input,select,textarea,img[alt],[aria-label]';

    // Deepest existing ancestor of any alternative, e.g. "header.GlobalNav".
    let scope: Element | null = null, scopeSelector = "";
    for (const part of split(sel, ch => ch === ",")) {
        const tokens = split(part, ch => /\s/.test(ch));
        for (let k = tokens.length - 1; k > 0 && !scope; k--) {
            const prefix = tokens.slice(0, k).join(" ").replace(/\s*[>+~]$/, "");
            try { scope = document.querySelector(prefix); } catch { /* not a valid prefix */ }
            if (scope) scopeSelector = prefix;
        }
        if (scope) break;
    }

    // Quoted attribute values ("profile", "Account") matched against real labels.
    const words = Array.from(sel.matchAll(/["']([^"']{3,})["']/g), m => m[1].toLowerCase());
    const labelMatches = words.length ? Array.from(document.querySelectorAll(INTERACTIVE)).filter(el => {
        if (!visible(el)) return false;
        const hay = ["aria-label", "alt", "title", "data-testid"].map(a => el.getAttribute(a) ?? "").join(" ").toLowerCase();
        return words.some(w => hay.includes(w));
    }).slice(0, 6).map(describe) : [];
    const controlsInScope = scope ? Array.from(scope.querySelectorAll(INTERACTIVE)).filter(visible).slice(0, 12).map(describe) : [];

    if (!labelMatches.length && !controlsInScope.length) return {};
    return {
        ...(labelMatches.length && {labelMatches}),
        ...(controlsInScope.length && {scope: scopeSelector, controlsInScope}),
        hint: "Do not guess markup. Use a selector from labelMatches or controlsInScope (matches = how many elements it hits).",
    };
}
