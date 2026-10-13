import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader, plain} from './load-ts.mjs';

const geometry = createLoader()('src/background/visualGeometry.ts');
test('grid cells and crop bounds keep CSS coordinates through progressive zoom', () => {
    assert.equal(geometry.columnLabel(0), 'A');
    assert.equal(geometry.columnLabel(26), 'AA');
    assert.deepEqual(plain(geometry.gridRegion('C4', 100, {width: 1280, height: 720})), {x: 200, y: 300, width: 100, height: 100});
    assert.deepEqual(plain(geometry.gridRegion('M8', 100, {width: 1280, height: 720})), {x: 1200, y: 700, width: 80, height: 20});
    assert.deepEqual(plain(geometry.boundedRegion({x: -10, y: 10, width: 50, height: 50}, {width: 100, height: 100})), {x: 0, y: 10, width: 40, height: 50});
    assert.throws(() => geometry.gridRegion('Z99', 100, {width: 1280, height: 720}), /outside/);
});
test('composite paths end exactly at the target and chords preserve modifier masks', () => {
    const path = geometry.gesturePath({x: 0, y: 0}, {x: 100, y: 50}, 10, true, () => 0.75);
    assert.deepEqual(plain(path.at(-1)), {x: 100, y: 50});
    assert.equal(path.length, 10);
    const chord = geometry.parseChord('Ctrl+Shift+K');
    assert.equal(chord.mask, 10);
    assert.equal(chord.keyCode, 75);
    assert.equal(chord.code, 'KeyK');
    assert.equal(geometry.parseChord('Cmd+Enter').mask, 4);
    assert.throws(() => geometry.parseChord('Wrong+K'), /Unknown modifier/);
});
test('visual contour detection emits a bounded candidate box without inventing a name', () => {
    const width = 200, height = 120, data = new Uint8ClampedArray(width * height * 4).fill(255);
    for (let y = 30; y < 60; y++) for (let x = 30; x < 110; x++) for (let c = 0; c < 3; c++) data[(y * width + x) * 4 + c] = 0;
    const boxes = geometry.detectContours(data, width, height, 5);
    assert.equal(boxes.length, 1);
    assert.ok(boxes[0].x <= 30 && boxes[0].x + boxes[0].width >= 110);
    assert.ok(boxes[0].y <= 30 && boxes[0].y + boxes[0].height >= 60);
    assert.equal(geometry.detectContours(new Uint8ClampedArray(width * height * 4), width, height).length, 0);
});

function pageFixture() {
    const elements = [], listeners = new Map();
    let observer;
    class Element {
        constructor(tag, id, text, box, attrs = {}) { this.tagName = tag.toUpperCase(); this.id = id; this.textContent = text; this.box = box; this.attrs = attrs; this.children = []; this.labels = []; this.isConnected = true; this.parentElement = null; this.scrolls = 0; }
        getAttribute(key) { return key === 'id' ? this.id : this.attrs[key] ?? null; }
        hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
        getBoundingClientRect() { return {...this.box, left: this.box.x, top: this.box.y, right: this.box.x + this.box.width, bottom: this.box.y + this.box.height}; }
        getRootNode() { return document; }
        scrollIntoView() { this.scrolls++; }
        matches(selector) {
            if (selector === ':disabled,[aria-disabled="true"]') return this.attrs.disabled === true;
            if (selector.startsWith('#')) return this.id === selector.slice(1);
            return selector.split(',').some(part => part.trim().toLowerCase() === this.tagName.toLowerCase());
        }
    }
    class ShadowRoot {}
    const send = new Element('button', 'send', 'Send', {x: 20, y: 40, width: 100, height: 30});
    const hidden = new Element('button', 'hidden', 'Hidden', {x: 0, y: 0, width: 0, height: 0});
    elements.push(send, hidden);
    const document = {activeElement: send, children: elements,
        querySelectorAll: selector => selector === '*' ? elements : [],
        getElementById: id => elements.find(el => el.id === id),
        elementFromPoint: (x, y) => [...elements].reverse().find(el => x >= el.box.x && x < el.box.x + el.box.width && y >= el.box.y && y < el.box.y + el.box.height) ?? null,
        addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: type => listeners.delete(type),
    };
    const location = {href: 'https://example.com'};
    const load = createLoader({globals: {document, Element, ShadowRoot, location, scrollX: 0, scrollY: 0, innerWidth: 400, innerHeight: 300, devicePixelRatio: 2,
        CSS: {escape: s => s}, getComputedStyle: () => ({visibility: 'visible', display: 'block', opacity: '1', cursor: 'auto'}),
        MutationObserver: class { constructor(callback) { this.callback = callback; observer = this; } observe() {} disconnect() {} },
    }});
    return {read: load('src/background/pagePerception.ts').pagePerception, elements, send, Element, ShadowRoot, location, document, listeners, getObserver: () => observer};
}
test('element resolution uses semantics and rejects ambiguity, occlusion and stale marks', () => {
    const f = pageFixture();
    const resolved = f.read({action: 'resolve', target: {role: 'button', name: 'Send'}});
    assert.deepEqual(plain(resolved.point), {x: 70, y: 55});
    assert.equal(f.send.scrolls, 0, 'Already-visible targets stay in place');
    const shot = f.read({action: 'marks', snapshotId: 'shot', maxMarks: 50});
    assert.equal(shot.marks.length, 1);
    assert.equal(shot.marks[0].hitTest, true);
    assert.equal(f.read({action: 'resolve', target: {mark: 1, snapshotId: 'shot'}}).target.name, 'Send');
    const duplicate = new f.Element('button', 'send2', 'Send', {x: 150, y: 40, width: 100, height: 30}); f.elements.push(duplicate);
    assert.throws(() => f.read({action: 'resolve', target: {text: 'Send'}}), /ambiguous/);
    const modal = new f.Element('div', 'modal', 'Modal', {x: 20, y: 40, width: 100, height: 30}); f.elements.push(modal);
    assert.throws(() => f.read({action: 'resolve', target: {selector: '#send'}}), /occluded/);
    assert.equal(f.read({action: 'marks', snapshotId: 'shot2', maxMarks: 50}).marks.length, 1, 'Occluded button is filtered out');
    f.location.href = 'https://other.example';
    assert.throws(() => f.read({action: 'resolve', target: {mark: 1, snapshotId: 'shot'}}), /expired/);
});
test('feedback records actual event hit, trusted flag, focus and bounded mutations', () => {
    const f = pageFixture();
    f.read({action: 'observeStart', id: 'event'});
    f.listeners.get('mousedown')({type: 'mousedown', isTrusted: true, target: f.send, clientX: 70, clientY: 55});
    f.getObserver().callback([{type: 'childList', target: f.send, attributeName: null, addedNodes: [1], removedNodes: []}]);
    f.document.activeElement = new f.Element('input', 'field', '', {x: 0, y: 0, width: 20, height: 20});
    const feedback = f.read({action: 'observeEnd', id: 'event'});
    assert.equal(feedback.events[0].target.name, 'Send');
    assert.equal(feedback.events[0].hit.name, 'Send');
    assert.equal(feedback.events[0].trusted, true);
    assert.equal(feedback.focusMoved, true);
    assert.equal(feedback.mutationCount, 1);
    assert.equal(f.listeners.size, 0);
});

test('closed-root targets validate outer occlusion and capture their own event hits', () => {
    const f = pageFixture(), root = new f.ShadowRoot(), events = new Map();
    const host = new f.Element('section', 'host', '', {x: 0, y: 0, width: 200, height: 200});
    root.host = host; root.activeElement = f.send; root.elementFromPoint = () => f.send;
    root.addEventListener = (type, fn) => events.set(type, fn); root.removeEventListener = type => events.delete(type);
    f.send.getRootNode = () => root;
    f.document.elementFromPoint = () => host;
    f.document.activeElement = host;
    f.read({action: 'observeStart', id: 'closed'});
    assert.equal(f.read({action: 'resolve', target: {selector: '*'}}, f.send).target.name, 'Send');
    events.get('mousedown')({type: 'mousedown', isTrusted: true, target: f.send, clientX: 70, clientY: 55});
    const feedback = f.read({action: 'observeEnd', id: 'closed'});
    assert.equal(feedback.events[0].hit.name, 'Send');
    assert.equal(feedback.after.focus.name, 'Send');
    assert.equal(events.size, 0);
    const modal = new f.Element('div', 'modal', 'Modal', {x: 0, y: 0, width: 300, height: 300});
    f.document.elementFromPoint = () => modal;
    assert.throws(() => f.read({action: 'resolve', target: {selector: '*'}}, f.send), /occluded/);
});
