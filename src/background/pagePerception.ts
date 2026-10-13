/** Serialized into a dedicated CDP isolated world. Keep this function self-contained. */
export function pagePerception(args: any, anchored?: Element) {
    const scope = globalThis as any;
    const state = scope.__tamperSlothPerception ??= {snapshots: new Map(), observations: new Map()};
    state.roots ??= new Set();
    const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
    const role = (el: Element) => el.getAttribute('role') ?? ({BUTTON: 'button', A: el.hasAttribute('href') ? 'link' : '', INPUT: (el as HTMLInputElement).type === 'checkbox' ? 'checkbox' : 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', CANVAS: 'canvas'} as any)[el.tagName] ?? '';
    const name = (el: Element) => norm((el.getAttribute('aria-labelledby') ?? '').split(/\s+/).map(id => document.getElementById(id)?.textContent ?? '').join(' ')) || el.getAttribute('aria-label') ||
        Array.from((el as HTMLInputElement).labels ?? []).map(l => l.textContent).join(' ') || el.getAttribute('alt') || el.getAttribute('title') || norm(el.textContent ?? '').slice(0, 300);
    const selector = (el: Element) => {
        if (el.id) return '#' + CSS.escape(el.id);
        const parts: string[] = [];
        for (let node: Element | null = el; node && parts.length < 6; node = node.parentElement) {
            const tag = node.tagName.toLowerCase();
            const siblings = Array.from(node.parentElement?.children ?? []).filter(child => child.tagName === node!.tagName);
            parts.unshift(tag + (siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(node) + 1})` : ''));
        }
        return parts.join(' > ');
    };
    const describe = (el: Element | null) => el ? {tag: el.tagName.toLowerCase(), role: role(el), name: name(el), selector: selector(el)} : null;
    const focus = () => {
        let active = document.activeElement;
        for (let i = 0; active && i < 20; i++) {
            const root: ShadowRoot | undefined = active.shadowRoot ?? [...state.roots].find((r: ShadowRoot) => r.host === active);
            if (!root?.activeElement) break;
            active = root.activeElement;
        }
        return describe(active);
    };
    const metrics = () => ({url: location.href, scroll: {x: scrollX, y: scrollY}, viewport: {width: innerWidth, height: innerHeight},
        devicePixelRatio, visualViewport: window.visualViewport ? {width: visualViewport!.width, height: visualViewport!.height, offsetLeft: visualViewport!.offsetLeft, offsetTop: visualViewport!.offsetTop, scale: visualViewport!.scale} : null});
    const all: Element[] = [];
    const walk = (root: Document | ShadowRoot) => {
        for (const el of Array.from(root.querySelectorAll('*'))) {
            if (all.length >= 15000) return;
            all.push(el);
            if (el.shadowRoot) walk(el.shadowRoot);
        }
    };
    const hitAt = (x: number, y: number) => {
        let hit = document.elementFromPoint(x, y);
        while (hit?.shadowRoot) {
            const child = hit.shadowRoot.elementFromPoint(x, y);
            if (!child || child === hit) break;
            hit = child;
        }
        return hit;
    };
    const hitFor = (el: Element, x: number, y: number) => {
        const root = el.getRootNode();
        for (let current = root; current instanceof ShadowRoot; current = current.host.getRootNode()) {
            const outer = current.host.getRootNode();
            const hit = outer instanceof ShadowRoot ? outer.elementFromPoint(x, y) : document.elementFromPoint(x, y);
            if (!inside(current.host, hit)) return hit;
        }
        return root instanceof ShadowRoot ? root.elementFromPoint(x, y) : hitAt(x, y);
    };
    const inside = (el: Element, hit: Element | null): boolean => {
        for (let node = hit; node; node = node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null) if (node === el) return true;
        return false;
    };
    const geometry = (el: Element) => {
        const b = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const x = Math.max(0, b.left), y = Math.max(0, b.top), right = Math.min(innerWidth, b.right), bottom = Math.min(innerHeight, b.bottom);
        const center = {x: (x + right) / 2, y: (y + bottom) / 2};
        return {bbox: {x: b.x, y: b.y, width: b.width, height: b.height}, center,
            visible: b.width > 0 && b.height > 0 && right > x && bottom > y && style.visibility === 'visible' && style.display !== 'none' && Number(style.opacity) > 0,
            hit: hitFor(el, center.x, center.y)};
    };
    const checkElement = (el: Element, scroll = false) => {
        if (!el.isConnected) throw new Error('Target is detached. Inspect the page again.');
        const before = el.getBoundingClientRect();
        if (scroll && (before.left < 0 || before.top < 0 || before.right > innerWidth || before.bottom > innerHeight)) el.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        const g = geometry(el);
        if (!g.visible) throw new Error('Target is not visible in the viewport');
        if (!inside(el, g.hit)) throw new Error('Target is occluded by ' + (name(g.hit!) || g.hit?.tagName || 'another element'));
        if (el.matches(':disabled,[aria-disabled="true"]')) throw new Error('Target is disabled');
        return g;
    };
    if (args.action === 'metrics') return metrics();
    if (args.action === 'marks') {
        walk(document);
        const marks: any[] = [], refs = new Map();
        for (const el of all) {
            if (marks.length >= args.maxMarks) break;
            if (!el.matches('button,a[href],input:not([type=hidden]),textarea,select,summary,[role=button],[role=link],[role=checkbox],[role=menuitem],[role=tab],[tabindex]:not([tabindex="-1"]),[contenteditable=true],canvas,iframe') && !(el as HTMLElement).onclick && !el.hasAttribute('onclick') && getComputedStyle(el).cursor !== 'pointer') continue;
            try {
                const g = checkElement(el);
                const id = marks.length + 1;
                const mark = {id, ...describe(el), bbox: g.bbox, center: g.center, source: 'dom', hitTest: true, shadow: el.getRootNode() instanceof ShadowRoot};
                marks.push(mark); refs.set(id, {el, name: name(el)});
            } catch { /* Hidden, disabled and occluded targets do not get marks. */ }
        }
        state.snapshots.set(args.snapshotId, {refs, metrics: metrics(), timestamp: Date.now()});
        while (state.snapshots.size > 3) state.snapshots.delete(state.snapshots.keys().next().value);
        return {marks, metrics: metrics(), candidateLimitReached: marks.length >= args.maxMarks};
    }
    if (args.action === 'addMark') {
        const shot = state.snapshots.get(args.snapshotId);
        if (!shot || !anchored || anchored === document.body || anchored === document.documentElement || shot.refs.size >= args.maxMarks) return null;
        if ([...shot.refs.values()].some((ref: any) => ref.el === anchored)) return null;
        try {
            const g = checkElement(anchored), id = shot.refs.size + 1;
            shot.refs.set(id, {el: anchored, name: name(anchored)});
            return {id, ...describe(anchored), bbox: g.bbox, center: g.center, source: 'dom', hitTest: true, clickListener: true};
        } catch { return null; }
    }
    if (args.action === 'resolve') {
        const t = args.target;
        if (t.x !== undefined) {
            if (t.x < 0 || t.y < 0 || t.x >= innerWidth || t.y >= innerHeight) throw new Error('Coordinate is outside the viewport');
            return {point: {x: t.x, y: t.y}, target: describe(hitAt(t.x, t.y)), hit: describe(hitAt(t.x, t.y)), metrics: metrics()};
        }
        let elements: Element[] = [];
        if (anchored) elements = [anchored];
        else if (t.mark) {
            const shot = state.snapshots.get(t.snapshotId);
            if (!shot || Date.now() - shot.timestamp > 120000 || shot.metrics.url !== location.href) throw new Error('Mark snapshot expired. Take a new marked screenshot.');
            const ref = shot.refs.get(t.mark);
            if (!ref || !ref.el.isConnected || name(ref.el) !== ref.name) throw new Error('Mark changed or disappeared. Take a new marked screenshot.');
            elements = [ref.el];
        } else {
            walk(document);
            if (t.selector) elements = all.filter(el => el.matches(t.selector));
            else {
                const match = (value: string, wanted: string) => t.exact === false ? norm(value).toLowerCase().includes(norm(wanted).toLowerCase()) : norm(value) === norm(wanted);
                if (t.role) elements = all.filter(el => role(el) === t.role && match(name(el), t.name));
                else elements = all.filter(el => match(el.textContent ?? '', t.text) && !Array.from(el.children).some(child => match(child.textContent ?? '', t.text)));
            }
            elements = elements.filter(el => { const b = el.getBoundingClientRect(), s = getComputedStyle(el); return b.width > 0 && b.height > 0 && s.display !== 'none' && s.visibility === 'visible'; });
        }
        if (!elements.length) throw new Error('Target not found');
        if (t.index === undefined && elements.length > 1) throw new Error(`Target is ambiguous (${elements.length} matches). Narrow the target or supply index.`);
        const el = elements[t.index ?? 0];
        if (!el) throw new Error('Target index is out of range');
        const g = checkElement(el, true);
        const root = el.getRootNode();
        if (root instanceof ShadowRoot) {
        state.roots.add(root);
        for (const known of state.roots) if (!known.host.isConnected) state.roots.delete(known);
        while (state.roots.size > 100) state.roots.delete(state.roots.values().next().value);
        for (const entry of state.observations.values()) {
            if (!entry.roots.has(root)) {
                entry.roots.add(root); entry.observer.observe(root, {subtree: true, childList: true, attributes: true, characterData: true});
                for (const type of ['mousedown', 'click', 'keydown', 'touchstart', 'focusin']) root.addEventListener(type, entry.listener, true);
            }
        }
        }
        let point = g.center;
        if (args.edge) {
            const range = document.createRange(); range.selectNodeContents(el);
            const rects = Array.from(range.getClientRects());
            const rect = args.edge === 'start' ? rects[0] : rects.at(-1);
            if (rect) point = {x: args.edge === 'start' ? rect.left + 1 : rect.right - 1, y: (rect.top + rect.bottom) / 2};
        }
        return {point, bbox: g.bbox, target: describe(el), hit: describe(g.hit), metrics: metrics()};
    }
    if (args.action === 'observeStart') {
        const entry: any = {before: {url: location.href, focus: focus(), dialogs: Array.from(document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]')).map(describe)}, mutations: [], mutationCount: 0, events: [], roots: new Set([document])};
        entry.observer = new MutationObserver(records => {
            entry.mutationCount += records.length;
            for (const r of records) if (entry.mutations.length < 20) entry.mutations.push({type: r.type, tag: (r.target as Element).tagName?.toLowerCase(), attribute: r.attributeName, added: r.addedNodes.length, removed: r.removedNodes.length});
        });
        entry.observer.observe(document, {subtree: true, childList: true, attributes: true, characterData: true});
        entry.listener = (event: any) => {
            if (entry.events.length < 10) entry.events.push({type: event.type, trusted: event.isTrusted, target: describe(event.target instanceof Element ? event.target : null),
                ...(Number.isFinite(event.clientX) ? {point: {x: event.clientX, y: event.clientY}, hit: describe(event.target instanceof Element ? hitFor(event.target, event.clientX, event.clientY) : hitAt(event.clientX, event.clientY))} : {})});
        };
        for (const type of ['mousedown', 'click', 'keydown', 'touchstart', 'focusin']) document.addEventListener(type, entry.listener, true);
        entry.cleanup = () => { entry.observer.disconnect(); for (const root of entry.roots) for (const type of ['mousedown', 'click', 'keydown', 'touchstart', 'focusin']) root.removeEventListener(type, entry.listener, true); clearTimeout(entry.timer); };
        entry.timer = setTimeout(() => { entry.cleanup(); state.observations.delete(args.id); }, 45000);
        state.observations.set(args.id, entry);
        return entry.before;
    }
    if (args.action === 'observeEnd') {
        const entry = state.observations.get(args.id);
        if (!entry) return {observationLost: true};
        entry.cleanup(); state.observations.delete(args.id);
        const afterFocus = focus();
        const dialogs = Array.from(document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]')).map(describe);
        return {before: entry.before, after: {url: location.href, focus: afterFocus, dialogs}, focusMoved: JSON.stringify(afterFocus) !== JSON.stringify(entry.before.focus),
            urlChanged: entry.before.url !== location.href, newDialogs: dialogs.filter(d => !entry.before.dialogs.some((b: any) => b?.selector === d?.selector)),
            mutationCount: entry.mutationCount, mutations: entry.mutations, events: entry.events};
    }
    throw new Error('Unknown perception action');
}
