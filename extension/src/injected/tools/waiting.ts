/** Runs in the page for waitForElement. */
export function waitForElementInPage(sel: string, ms: number) {
    return new Promise<any>((resolve) => {
        const describe = (el: Element) => {
            const rect = el.getBoundingClientRect();
            return {
                found: true,
                tag: el.tagName.toLowerCase(),
                id: el.id || undefined,
                classes: Array.from(el.classList),
                text: el.textContent?.trim().slice(0, 300),
                visible: rect.width > 0 && rect.height > 0,
                belowFold: rect.top > window.innerHeight,
                position: {
                    top: Math.round(rect.top),
                    left: Math.round(rect.left),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                },
                attributes: Object.fromEntries(
                    Array.from(el.attributes)
                        .filter((a) => !["class", "id"].includes(a.name))
                        .slice(0, 20)
                        .map((a) => [a.name, a.value.slice(0, 100)])
                ),
            };
        };

        const existing = document.querySelector(sel);
        if (existing) {
            resolve(describe(existing));
            return;
        }

        const observer = new MutationObserver(() => {
            const el = document.querySelector(sel);
            if (el) {
                observer.disconnect();
                resolve(describe(el));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
        });

        setTimeout(() => {
            observer.disconnect();
            resolve({
                found: false,
                timedOutMs: ms,
                selector: sel,
                hint: "Element did not appear within timeout. Call getPageStructure to verify the selector is correct."
            });
        }, ms);
    });
}

/** Runs in every frame while wait watches for a reply: a short hash of the text, so a change can be seen without holding it. */
export function pageTextFingerprint(sel: string | null) {
    const root = sel ? document.querySelector(sel) : document.body;
    const text = (root as HTMLElement | null)?.innerText ?? '';
    let hash = 5381;
    for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    return `${text.length}:${hash}`;
}

/** Runs in the page before wait asks the user to fill something in: marks the field the tip points at. */
export function markFieldToFill(sel: string, mark: string) {
    const fields = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), textarea, select';
    const visible = (el: Element) => {
        const box = el.getBoundingClientRect(), style = getComputedStyle(el);
        return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const pick = (root: ParentNode) => {
        const all = [...root.querySelectorAll(fields)].filter(visible) as HTMLInputElement[];
        return all.find(el => !el.value) ?? all[0];
    };
    let root: Element | null = null;
    try { root = document.querySelector(sel); } catch { /* an invalid selector falls back to the page */ }
    const target = root && root.matches(fields) && visible(root) ? root
        : (root && pick(root)) ?? pick(document) ?? (root && visible(root) ? root : null);
    document.querySelectorAll('[data-tampersloth-tip]').forEach(el => el.removeAttribute('data-tampersloth-tip'));
    if (!target) return false;
    target.setAttribute('data-tampersloth-tip', mark);
    target.scrollIntoView({block: 'nearest', inline: 'nearest'});
    return true;
}
