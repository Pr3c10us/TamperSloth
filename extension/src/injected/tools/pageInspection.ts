/** Runs in the page for getPageStructure. */
export function readPageStructure(sel: string | null, format: string, maxNodes: number) {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) {
        return {
            error: `No element found for selector: ${sel}`,
            hint: "Omit selector to capture from document.body, or call getPageText to find valid landmarks.",
        };
    }

    const concise = format === "concise";

    // Depth alone does not bound this — a page can hold
    // thousands of elements within six levels.
    let budget = maxNodes;
    let omitted = 0;
    const omittedSubtrees: Array<{ selector: string; nodes: number }> = [];

    const describe = (el: Element) => {
        const id = el.id ? "#" + el.id : "";
        const cls = el.classList.length
            ? "." + Array.from(el.classList).slice(0, 2).join(".")
            : "";
        return el.tagName.toLowerCase() + id + cls;
    };

    const countNodes = (el: Element): number => {
        let n = 1;
        for (const c of Array.from(el.children)) n += countNodes(c);
        return n;
    };

    function simplify(el: Element, depth = 0): any {
        if (depth > 6) {
            const size = countNodes(el);
            omitted += size;
            omittedSubtrees.push({selector: describe(el), nodes: size});
            return "...";
        }
        if (budget <= 0) return null;
        budget--;

        const info: any = {tag: el.tagName.toLowerCase()};

        if (concise) {
            if (el.id) info.id = el.id;
            if (el.classList.length) info.class = Array.from(el.classList).join(" ").slice(0, 160);
            for (const attr of ["href", "role", "aria-label", "data-testid", "name", "type", "placeholder"]) {
                if (el.hasAttribute(attr)) info[attr] = el.getAttribute(attr)!.slice(0, 180);
            }
            const label = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent?.trim()).filter(Boolean).join(" ");
            if (label) info.text = label.slice(0, 100);
        } else {
            const dominated = [
                "id", "class", "name", "type", "role", "aria-label",
                "href", "src", "placeholder", "data-testid", "value", "action",
            ];
            const attrs: Record<string, string> = {};
            for (const attr of dominated) {
                if (el.hasAttribute(attr)) {
                    let val = el.getAttribute(attr)!;
                    if (val.length > 100) val = val.slice(0, 100) + "...";
                    attrs[attr] = val;
                }
            }
            if (Object.keys(attrs).length) info.attrs = attrs;

            const directText = Array.from(el.childNodes)
                .filter((n) => n.nodeType === Node.TEXT_NODE)
                .map((n) => n.textContent?.trim())
                .filter(Boolean)
                .join(" ");
            if (directText) info.text = directText.slice(0, 200);

            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) info.hidden = true;
        }

        const children: any[] = [];
        for (const c of Array.from(el.children)) {
            if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(c.tagName)) continue;
            if (budget <= 0) {
                // Record what was skipped so the agent can
                // re-query that subtree instead of guessing.
                const size = countNodes(c);
                omitted += size;
                omittedSubtrees.push({selector: describe(c), nodes: size});
                continue;
            }
            const child = simplify(c, depth + 1);
            if (child) children.push(child);
        }
        if (children.length) info.children = children;

        return info;
    }

    const tree = simplify(root);

    return {
        url: location.href,
        title: document.title,
        tree,
        ...(omitted > 0 && {
            truncated: true,
            omittedNodes: omitted,
            largestOmitted: omittedSubtrees
                .sort((a, b) => b.nodes - a.nodes)
                .slice(0, 5),
            hint:
                `DOM node (${maxNodes}) or depth limit reached — ${omitted} nodes omitted. ` +
                "Re-run with `selector` scoped to one of largestOmitted rather than " +
                "capturing the whole page again.",
        }),
    };
}

/** Runs in the page for getElementDetails. */
export function readElementDetails(sel: string, format: string) {
    const els = document.querySelectorAll(sel);
    if (els.length === 0) {
        const suggestions: string[] = [];
        const classMatch = sel.match(/\.([a-zA-Z0-9_-]+)/);
        if (classMatch) {
            const similar = document.querySelectorAll('[class*="' + classMatch[1] + '"]');
            if (similar.length > 0) suggestions.push("Similar classes: " + Array.from(similar).slice(0, 5).map(e => e.tagName.toLowerCase() + (e.id ? "#" + e.id : "") + "." + Array.from(e.classList).join(".")).join(", "));
        }
        const tagMatch = sel.match(/^([a-z]+)/i);
        if (tagMatch) {
            const count = document.querySelectorAll(tagMatch[1]).length;
            if (count > 0) suggestions.push(count + " <" + tagMatch[1] + "> elements exist on the page");
        }
        return {
            error: `No elements found for selector: ${sel}`, ...(suggestions.length > 0 && {suggestions}),
            hint: "Call getPageStructure to inspect the DOM and find valid selectors."
        };
    }
    const concise = format === "concise";
    return Array.from(els)
        .slice(0, 10)
        .map((el) => {
            const rect = el.getBoundingClientRect();
            const style = getComputedStyle(el);
            if (concise) {
                return {
                    tag: el.tagName.toLowerCase(),
                    id: el.id || undefined,
                    text: el.textContent?.trim().slice(0, 100),
                    visible: style.display !== "none"
                        && style.visibility !== "hidden"
                        && rect.width > 0 && rect.height > 0,
                };
            }
            return {
                tag: el.tagName.toLowerCase(),
                id: el.id || undefined,
                classes: Array.from(el.classList),
                text: el.textContent?.trim().slice(0, 300),
                html: el.outerHTML.slice(0, 500),
                visibility: {
                    visible: style.display !== "none"
                        && style.visibility !== "hidden"
                        && rect.width > 0 && rect.height > 0,
                    belowFold: rect.top > window.innerHeight,
                    displayType: style.display,
                },
                position: {
                    top: Math.round(rect.top),
                    left: Math.round(rect.left),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                },
                style: {
                    color: style.color,
                    fontSize: style.fontSize,
                    fontFamily: style.fontFamily,
                    backgroundColor: style.backgroundColor,
                    borderRadius: style.borderRadius,
                    padding: style.padding,
                    boxShadow: style.boxShadow,
                },
            };
        });
}

/** Runs in the page for getPageText. */
export function readPageText(sel: string | null, max: number, format: string, start: number) {
    const concise = format === "concise";
    let root: Element | null;
    if (sel) {
        root = document.querySelector(sel);
    } else if (concise) {
        root = document.querySelector("main")
            ?? document.querySelector("article")
            ?? document.body;
    } else {
        root = document.body;
    }
    if (!root)
        return {error: `No element found for selector: ${sel}`};

    const text = (root as HTMLElement).innerText?.trim() ?? "";
    const truncated = text.length > start + max;

    let availableSections: string[] | undefined;
    if (truncated) {
        const sections: string[] = [];
        for (const tag of ["nav", "main", "article", "aside", "footer", "header"]) {
            const el = document.querySelector(tag);
            if (el) {
                const len = (el as HTMLElement).innerText?.trim().length ?? 0;
                if (len > 0) sections.push(tag + " (~" + len + " chars)");
            }
        }
        if (sections.length > 0) availableSections = sections;
    }

    return {
        url: location.href,
        title: document.title,
        selector: sel ?? (concise ? root.tagName.toLowerCase() : "body"),
        length: text.length,
        offset: start,
        truncated,
        text: text.slice(start, start + max),
        ...(truncated && {nextOffset: start + max}),
        ...(truncated && availableSections && {
            availableSections,
            hint: "Use nextOffset for more text, or scope with selector. Offsets apply to the current page text.",
        }),
    };
}
