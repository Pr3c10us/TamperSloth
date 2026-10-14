/**
 * Element picker overlay, injected into the page with chrome.scripting.
 * Serialized into Chrome's isolated world: keep every dependency inside this function.
 *
 * Marks are drawn in a closed shadow root in the same style as page guidance:
 * rounded lime outlines with a translucent fill. The page's own elements are
 * never restyled, so the HTML sent to the model is exactly what the page has.
 * A pick also crops a screenshot of the element (overlay hidden) for the panel's
 * chip; the model only ever receives the HTML.
 *
 * Marks are grouped by chat, since each chat keeps its own unsent picks; only
 * the shown group is drawn.
 *
 * Actions: start {group} (pick one element into a group), stop (end picking),
 * remove {group, index}, clear {group} (drop a group's marks), show {group}
 * (draw only that group), dispose (remove the overlay entirely).
 */
export function pickerOverlay(args: {action: 'start' | 'stop' | 'remove' | 'clear' | 'show' | 'dispose'; index?: number; group?: string}): unknown {
    const win = window as any;
    const LIME = '#a8bd85';
    const INK = '#0f0f0e';
    const PAPER = '#f6f4ef';
    const group = args.group ?? '';
    // Bump when the overlay's drawing changes. The overlay's state, functions included,
    // outlives an extension reload on the page, so an older one is replaced, not reused.
    const VERSION = 2;
    let state = win.__tamperSlothPicker;
    if (state && (!state.groups || state.version !== VERSION)) {
        state.dispose?.();
        state = undefined;
    }

    // Pages marked by older versions restyled elements in place; undo that too.
    const clearLegacy = () => document.querySelectorAll<HTMLElement>('[data-tampersloth-picked]').forEach(el => {
        el.style.outline = el.dataset.tamperslothPrevOutline || '';
        el.style.outlineOffset = el.dataset.tamperslothPrevOutlineOffset || '';
        el.style.background = el.dataset.tamperslothPrevBackground || '';
        for (const key of ['tamperslothPicked', 'tamperslothPrevOutline', 'tamperslothPrevOutlineOffset', 'tamperslothPrevBackground']) delete el.dataset[key];
    });

    if (!state) {
        if (args.action !== 'start') {
            clearLegacy();
            return {ok: true};
        }
        const ns = 'http://www.w3.org/2000/svg';
        const host = document.createElement('div');
        host.id = 'tampersloth-picker';
        host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
        const root = host.attachShadow({mode: 'closed'});
        const style = document.createElement('style');
        style.textContent = `
            :host{pointer-events:none} *{box-sizing:border-box}
            svg{position:fixed;inset:0;width:100vw;height:100vh;overflow:visible;pointer-events:none}
            .mark{filter:drop-shadow(0 0 1px ${INK}66)}
            .capture{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;background:transparent}
            .tag{position:fixed;pointer-events:none;white-space:nowrap;font:400 11px/1.4 'TamperSloth Geist','Geist Variable',system-ui,sans-serif;-webkit-font-smoothing:antialiased;
                 border-radius:6px;padding:3px 8px;background:${INK};color:${PAPER};outline:1px solid ${PAPER}33;box-shadow:0 2px 8px ${INK}14}
            .tag b{font-weight:500;color:${LIME}}
            .badge{position:fixed;pointer-events:none;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:${LIME};color:${INK};
                   font:600 10px/18px 'TamperSloth Geist','Geist Variable',system-ui,sans-serif;text-align:center;box-shadow:0 0 0 1.5px ${INK}66}
            .hint{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);padding:5px 9px;border-radius:6px;background:${INK}bf;color:${PAPER}d9;
                  font:400 11px/1.3 'TamperSloth Geist','Geist Variable',system-ui,sans-serif;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);pointer-events:none}
        `;
        const svg = document.createElementNS(ns, 'svg');
        root.append(style, svg);
        document.documentElement.append(host);

        state = win.__tamperSlothPicker = {version: VERSION, host, root, svg, ns, groups: {} as Record<string, any[]>, shown: group, hover: null as any, picking: false};
        state.marks = (name: string) => state.groups[name] ??= [];
        state.count = () => Object.values(state.groups).reduce((n: number, marks: any) => n + marks.length, 0);

        /** A rounded box just outside the element, in the same clean style as page guidance. */
        state.sketch = (mark: any, w: number, h: number) => {
            const x = -5, y = -5, rw = w + 10, rh = h + 10, r = Math.min(10, rw / 3, rh / 3);
            const outline = `M${x + r},${y} H${x + rw - r} Q${x + rw},${y} ${x + rw},${y + r} V${y + rh - r} Q${x + rw},${y + rh} ${x + rw - r},${y + rh} H${x + r} Q${x},${y + rh} ${x},${y + rh - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
            mark.shape.setAttribute('d', outline);
            mark.wash?.setAttribute('d', outline);
        };
        state.makeMark = (filled: boolean) => {
            const group = document.createElementNS(ns, 'g');
            group.setAttribute('class', 'mark');
            const shape = document.createElementNS(ns, 'path');
            shape.setAttribute('stroke', LIME); shape.setAttribute('stroke-width', '2'); shape.setAttribute('fill', 'none');
            shape.setAttribute('stroke-linecap', 'round'); shape.setAttribute('stroke-linejoin', 'round');
            const mark: any = {group, shape, size: ''};
            if (filled) {
                // A picked element gets a translucent wash of lime inside its outline.
                mark.wash = document.createElementNS(ns, 'path');
                mark.wash.setAttribute('fill', LIME); mark.wash.setAttribute('fill-opacity', '.16'); mark.wash.setAttribute('stroke', 'none');
                group.append(mark.wash);
            } else {
                // The hover preview is a lighter pass before the click commits.
                shape.setAttribute('opacity', '.75');
            }
            group.append(shape);
            svg.append(group);
            return mark;
        };
        state.place = (mark: any, el: Element) => {
            const box = el.getBoundingClientRect();
            const visible = el.isConnected && box.width > 0 && box.height > 0;
            mark.group.style.display = visible ? '' : 'none';
            if (mark.badge) mark.badge.style.display = visible ? '' : 'none';
            if (!visible) return box;
            mark.group.setAttribute('transform', `translate(${box.x},${box.y})`);
            const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
            // Only re-sketch on resize; scrolling just moves the same drawing.
            if (mark.size !== size) { mark.size = size; state.sketch(mark, box.width, box.height); }
            if (mark.badge) {
                mark.badge.style.left = `${Math.max(4, box.x - 12)}px`;
                mark.badge.style.top = `${Math.max(4, box.y - 12)}px`;
            }
            return box;
        };
        state.render = () => {
            for (const [name, marks] of Object.entries(state.groups) as [string, any[]][]) {
                marks.forEach((mark: any, i: number) => {
                    if (name !== state.shown) {
                        mark.group.style.display = 'none';
                        if (mark.badge) mark.badge.style.display = 'none';
                        return;
                    }
                    if (mark.badge) mark.badge.textContent = String(i + 1);
                    state.place(mark, mark.el);
                });
            }
            if (state.hover?.el) {
                const box = state.place(state.hover, state.hover.el);
                const tag = state.hover.tag;
                tag.style.display = state.hover.group.style.display;
                const above = box.y - 30 > 4;
                tag.style.left = `${Math.min(Math.max(4, box.x - 5), innerWidth - tag.offsetWidth - 4)}px`;
                tag.style.top = `${above ? box.y - 30 : Math.min(innerHeight - 26, box.bottom + 8)}px`;
            }
        };
        let scheduled = false;
        state.schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => { scheduled = false; state.render(); });
        };
        window.addEventListener('scroll', state.schedule, true);
        window.addEventListener('resize', state.schedule);
        state.observer = new ResizeObserver(state.schedule);
        state.observer.observe(document.documentElement);

        state.describe = (el: Element) => {
            const tag = el.tagName.toLowerCase();
            if (el.id) return {tag, detail: `#${el.id}`};
            const className = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
            return {tag, detail: className ? `.${className}` : ''};
        };
        state.stopPicking = () => {
            state.picking = false;
            state.capture?.remove(); state.capture = null;
            state.hint?.remove(); state.hint = null;
            if (state.hover) { state.hover.group.remove(); state.hover.tag.remove(); state.hover = null; }
            document.removeEventListener('keydown', state.onKey, true);
        };
        state.removeMark = (mark: any) => {
            mark.group.remove(); mark.badge?.remove();
        };
        state.dispose = () => {
            state.stopPicking();
            window.removeEventListener('scroll', state.schedule, true);
            window.removeEventListener('resize', state.schedule);
            state.observer.disconnect();
            host.remove();
            delete win.__tamperSlothPicker;
        };
    }

    switch (args.action) {
        case 'start': {
            if (state.picking) return {ok: true};
            state.picking = true;
            state.shown = group;
            state.render();
            const capture = document.createElement('div');
            capture.className = 'capture';
            const hint = document.createElement('div');
            hint.className = 'hint';
            hint.textContent = 'Click an element to pick it · Esc to cancel';
            state.root.append(capture, hint);
            state.capture = capture; state.hint = hint;

            const hover = state.makeMark(false);
            const tag = document.createElement('div');
            tag.className = 'tag'; tag.style.display = 'none';
            state.root.append(tag);
            state.hover = {...hover, tag, el: null};

            capture.addEventListener('mousemove', (event: MouseEvent) => {
                capture.style.pointerEvents = 'none';
                const el = document.elementFromPoint(event.clientX, event.clientY);
                capture.style.pointerEvents = 'auto';
                if (!el || el === state.host || el === state.hover.el) return;
                state.hover.el = el;
                const {tag: name, detail} = state.describe(el);
                tag.innerHTML = '';
                const strong = document.createElement('b');
                strong.textContent = name;
                tag.append(strong, detail);
                state.render();
            });
            capture.addEventListener('click', async (event: MouseEvent) => {
                event.preventDefault(); event.stopPropagation();
                if (state.capturing) return;
                // Resolve at the click point: the last hover can lag behind a fast click.
                capture.style.pointerEvents = 'none';
                const el = document.elementFromPoint(event.clientX, event.clientY) ?? state.hover?.el as Element | null;
                capture.style.pointerEvents = 'auto';
                if (!el || el === state.host) return;
                // Captured before anything is drawn, so it is the page's own markup.
                const outerHTML = el.outerHTML;
                // Preview for the panel only: hide every mark, let the page repaint,
                // then crop the visible tab to the element's box.
                state.capturing = true;
                state.host.style.visibility = 'hidden';
                let screenshot: string | null = null;
                try {
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
                    const box = el.getBoundingClientRect();
                    const response = await chrome.runtime.sendMessage({type: 'PICKER_CAPTURE',
                        rect: {x: box.x, y: box.y, width: box.width, height: box.height},
                        viewport: {width: innerWidth, height: innerHeight}});
                    screenshot = response?.dataUrl ?? null;
                } catch { /* The chip falls back to the element's tag. */ }
                finally {
                    state.host.style.visibility = '';
                    state.capturing = false;
                }
                if (!state.picking) return;
                const mark = state.makeMark(true);
                mark.el = el;
                mark.badge = document.createElement('div');
                mark.badge.className = 'badge';
                state.root.append(mark.badge);
                state.marks(group).push(mark);
                state.stopPicking();
                state.render();
                chrome.runtime.sendMessage({type: 'ELEMENT_PICKED', outerHTML, screenshot});
            }, true);
            state.onKey = (event: KeyboardEvent) => {
                if (event.key !== 'Escape') return;
                event.preventDefault(); event.stopPropagation();
                state.stopPicking();
                if (!state.count()) state.dispose();
                chrome.runtime.sendMessage({type: 'PICKER_CANCELLED'});
            };
            document.addEventListener('keydown', state.onKey, true);
            return {ok: true};
        }
        case 'stop':
            state.stopPicking();
            if (!state.count()) state.dispose();
            return {ok: true};
        case 'remove': {
            const [mark] = state.marks(group).splice(args.index ?? -1, 1);
            if (mark) state.removeMark(mark);
            if (!state.count() && !state.picking) state.dispose();
            else state.render();
            return {ok: true};
        }
        case 'clear':
            for (const mark of state.marks(group)) state.removeMark(mark);
            delete state.groups[group];
            clearLegacy();
            if (!state.count() && !state.picking) state.dispose();
            return {ok: true};
        case 'show':
            state.shown = group;
            state.render();
            return {ok: true};
        case 'dispose':
            state.dispose();
            clearLegacy();
            return {ok: true};
    }
}

/** Runs the overlay in a tab, ignoring tabs the extension cannot script. */
export async function runPickerOverlay(tabId: number, args: Parameters<typeof pickerOverlay>[0]) {
    if (typeof chrome === 'undefined' || !chrome?.scripting) return;
    await chrome.scripting.executeScript({target: {tabId}, func: pickerOverlay, args: [args]}).catch(() => {});
}
