import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

// Just enough DOM for the picker and draw overlays to start, with the top layer
// modelled: popovers open and close, leaving the document closes them, dialogs go modal.
function fixture() {
    const shown = [];
    class Element {
        constructor(tag = 'div') {
            this.tagName = tag.toUpperCase(); this.localName = tag;
            this.style = {}; this.dataset = {}; this.attrs = {}; this.children = []; this.parentNode = null;
            this.listeners = {}; this.popoverOpen = false; this.modal = false;
        }
        get isConnected() { let el = this; while (el.parentNode) el = el.parentNode; return el === document.documentElement; }
        get popover() { return 'popover' in this.attrs ? (this.attrs.popover === 'manual' ? 'manual' : 'auto') : null; }
        get firstElementChild() { return this.children[0] ?? (this.placeholder ??= new Element('span')); }
        append(...items) {
            for (const item of items) {
                if (typeof item !== 'object') continue;
                // Leaving the document hides an open popover, as in the browser.
                if (item.parentNode) { item.parentNode.children = item.parentNode.children.filter(x => x !== item); item.popoverOpen = false; }
                item.parentNode = this; this.children.push(item);
            }
        }
        replaceChildren(...items) { this.children = []; this.append(...items); }
        remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this); this.parentNode = null; this.popoverOpen = false; }
        contains(other) { for (let el = other; el; el = el.parentNode) if (el === this) return true; return false; }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        getAttribute(k) { return this.attrs[k] ?? null; }
        hasAttribute(k) { return k in this.attrs; }
        removeAttribute(k) { delete this.attrs[k]; }
        matches(selector) { return selector === ':popover-open' ? this.popoverOpen : selector === ':modal' ? this.modal : false; }
        showPopover() { if (!this.isConnected) throw new Error('InvalidStateError'); this.popoverOpen = true; if (this === host()) shown.push(`show:${this.parentNode.id || this.parentNode.localName}`); }
        hidePopover() { this.popoverOpen = false; if (this === host()) shown.push('hide'); }
        attachShadow() { return this.shadow = new Element('#shadow'); }
        addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
        getBoundingClientRect() { return {x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0}; }
        setPointerCapture() {}
        closest() { return null; }
    }
    const walk = (el, out = []) => { for (const child of el.children) { out.push(child); walk(child, out); } return out; };
    const documentListeners = new Map(), windowListeners = new Map();
    const on = map => ({
        addEventListener(type, fn) { if (!map.has(type)) map.set(type, new Set()); map.get(type).add(fn); },
        removeEventListener(type, fn) { map.get(type)?.delete(fn); },
    });
    const document = {
        ...on(documentListeners),
        documentElement: new Element('html'),
        createElement: tag => new Element(tag),
        createElementNS: (_, tag) => new Element(tag),
        querySelectorAll: selector => selector === 'dialog:modal, [popover]:popover-open'
            ? walk(document.documentElement).filter(el => (el.localName === 'dialog' && el.modal) || ('popover' in el.attrs && el.popoverOpen))
            : [],
    };
    const body = new Element('body');
    document.documentElement.append(body);
    const window = on(windowListeners);
    const observers = [];
    const load = createLoader({globals: {document, window, innerWidth: 800, innerHeight: 600, scrollX: 0, scrollY: 0,
        requestAnimationFrame: fn => { fn(); return 0; },
        ResizeObserver: class { observe() {} disconnect() {} },
        MutationObserver: class { constructor(fn) { this.fn = fn; observers.push(this); } observe(target, options) { this.options = options; } disconnect() { this.disconnected = true; } },
    }});
    let current = null;
    const host = () => current;
    const listening = () => (windowListeners.get('toggle')?.size ?? 0) + (documentListeners.get('fullscreenchange')?.size ?? 0);
    // Delivers what the browser would: open attribute records and childList records.
    const mutate = (records) => { for (const observer of observers) if (!observer.disconnected && observer.options?.attributeFilter?.includes('open')) observer.fn(records); };
    const toggle = (target, newState) => { for (const fn of [...(windowListeners.get('toggle') ?? [])]) fn({type: 'toggle', target, newState}); };
    const fullscreen = () => { for (const fn of [...(documentListeners.get('fullscreenchange') ?? [])]) fn({type: 'fullscreenchange', target: document}); };
    const showModal = (dialog) => { dialog.setAttribute('open', ''); dialog.modal = true; mutate([{type: 'attributes', target: dialog, attributeName: 'open'}]); };
    const close = (dialog) => { dialog.removeAttribute('open'); dialog.modal = false; mutate([{type: 'attributes', target: dialog, attributeName: 'open'}]); };
    const find = id => walk(document.documentElement).find(el => el.id === id);
    return {Element, document, body, load, shown, observers, listening, mutate, toggle, fullscreen, showModal, close,
        // Whether a press on the overlay stops at its shadow root instead of reaching the page.
        swallowed: (host, type) => { const event = {type, stopped: false, stopPropagation() { this.stopped = true; }}; for (const fn of host.shadow.listeners[type] ?? []) fn(event); return event.stopped; },
        track: id => { current = find(id); return current; }};
}

test('picker joins the top layer and moves into a modal so picks inside it still land', () => {
    const f = fixture();
    const {pickerOverlay} = f.load('src/background/pickerOverlay.ts');
    pickerOverlay({action: 'start', group: 'chat'});
    const host = f.track('tampersloth-picker');
    assert.equal(host.attrs.popover, 'manual');
    // Shown on creation, before the hook saw it: it opened at the document root.
    assert.equal(host.parentNode, f.document.documentElement);
    assert.equal(host.popoverOpen, true);

    // A modal makes the rest of the page inert, so the host goes inside it and shows again.
    const dialog = new f.Element('dialog'); dialog.id = 'modal'; f.body.append(dialog);
    f.showModal(dialog);
    assert.equal(host.parentNode, dialog);
    assert.equal(host.popoverOpen, true);
    assert.deepEqual(f.shown, ['show:modal']);
    // Presses never bubble into the dialog's own handlers.
    for (const type of ['pointerdown', 'mousedown', 'click']) assert.equal(f.swallowed(host, type), true);
    // The dialog's own toggle event re-shows it on top again.
    f.toggle(dialog, 'open');
    assert.deepEqual(f.shown, ['show:modal', 'hide', 'show:modal']);

    // A popover menu inside the modal: clicks outside it would light-dismiss it.
    const menu = new f.Element('div'); menu.id = 'menu'; menu.setAttribute('popover', 'auto'); dialog.append(menu);
    menu.popoverOpen = true; f.toggle(menu, 'open');
    assert.equal(host.parentNode, menu);
    // A popover outside the modal is inert anyway, so it is not followed.
    const stray = new f.Element('div'); stray.setAttribute('popover', ''); f.body.append(stray);
    stray.popoverOpen = true; f.toggle(stray, 'open');
    assert.equal(host.parentNode, menu);
    // Neither are <details> toggles, nor the host's own.
    const count = f.shown.length;
    const details = new f.Element('details'); f.body.append(details);
    f.toggle(details, 'open'); f.toggle(host, 'open'); f.toggle(host, 'closed');
    assert.equal(f.shown.length, count);

    // Closing the menu returns the host to the dialog.
    menu.popoverOpen = false; f.toggle(menu, 'closed');
    assert.equal(host.parentNode, dialog);
    assert.equal(host.popoverOpen, true);
    // A close that leaves the host where it is does not reorder it.
    const settled = f.shown.length;
    stray.popoverOpen = false; f.toggle(stray, 'closed');
    assert.equal(f.shown.length, settled);
    // Closing the dialog returns it to the page; with no modal, an open popover would be followed.
    f.close(dialog);
    assert.equal(host.parentNode, f.document.documentElement);
    assert.equal(host.popoverOpen, true);
    stray.popoverOpen = true; f.toggle(stray, 'open');
    assert.equal(host.parentNode, stray);
    stray.popoverOpen = false; f.toggle(stray, 'closed');
    assert.equal(host.parentNode, f.document.documentElement);

    // If the page removes the dialog with the host inside, the host comes back out.
    f.showModal(dialog);
    assert.equal(host.parentNode, dialog);
    dialog.remove(); dialog.modal = false;
    f.mutate([{type: 'childList', target: f.body}]);
    assert.equal(host.parentNode, f.document.documentElement);
    assert.equal(host.popoverOpen, true);

    pickerOverlay({action: 'dispose'});
    assert.equal(host.isConnected, false);
    assert.equal(f.listening(), 0);
    assert.ok(f.observers.find(o => o.options?.attributeFilter).disconnected);
});

test('picker follows the most recently opened modal when several are open', () => {
    const f = fixture();
    const first = new f.Element('dialog'); first.id = 'first';
    const second = new f.Element('dialog'); second.id = 'second';
    f.body.append(second, first);
    const {pickerOverlay} = f.load('src/background/pickerOverlay.ts');
    // Already open before the overlay started: the later one in the document wins.
    first.setAttribute('open', ''); first.modal = true;
    pickerOverlay({action: 'start', group: 'chat'});
    const host = f.track('tampersloth-picker');
    assert.equal(host.parentNode, first);
    // Opened afterwards, the second modal is on top even though it comes first in the document.
    f.showModal(second);
    assert.equal(host.parentNode, second);
    f.close(second);
    assert.equal(host.parentNode, first);
    pickerOverlay({action: 'dispose'});
});

test('drawing overlay joins the top layer, moves into a modal and cleans up on dispose', () => {
    const f = fixture();
    const dialog = new f.Element('dialog'); dialog.id = 'modal'; f.body.append(dialog);
    dialog.setAttribute('open', ''); dialog.modal = true;
    const {drawOverlay} = f.load('src/background/drawOverlay.ts');
    assert.equal(drawOverlay({action: 'start'}).ok, true);
    const host = f.track('tampersloth-draw');
    assert.equal(host.attrs.popover, 'manual');
    // A modal already open when drawing starts gets the toolbar and canvas inside it.
    assert.equal(host.parentNode, dialog);
    assert.equal(host.popoverOpen, true);
    for (const type of ['pointerdown', 'pointerup', 'click']) assert.equal(f.swallowed(host, type), true);
    // Fullscreen paints in the top layer too, so the overlay rejoins above it.
    const before = f.shown.length;
    f.fullscreen();
    assert.deepEqual(f.shown.slice(before), ['hide', 'show:modal']);
    f.close(dialog);
    assert.equal(host.parentNode, f.document.documentElement);
    assert.equal(host.popoverOpen, true);

    drawOverlay({action: 'dispose'});
    assert.equal(host.isConnected, false);
    assert.equal(f.listening(), 0);
    assert.ok(f.observers.find(o => o.options?.attributeFilter).disconnected);
    // Once gone, the page's top layer changes no longer touch it.
    const after = f.shown.length;
    f.showModal(dialog); f.toggle(dialog, 'open');
    assert.equal(f.shown.length, after);
});
