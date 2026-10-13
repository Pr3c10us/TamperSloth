export interface Point {x: number; y: number}
export interface Box extends Point {width: number; height: number}
export function columnLabel(index: number): string {
    let name = '';
    for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
    return name;
}
export function gridRegion(label: string, size: number, viewport: {width: number; height: number}): Box {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(label);
    if (!match) throw new Error('Invalid grid cell');
    const column = [...match[1]].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
    const x = column * size, y = (Number(match[2]) - 1) * size;
    if (x >= viewport.width || y >= viewport.height) throw new Error('Grid cell is outside the viewport');
    return {x, y, width: Math.min(size, viewport.width - x), height: Math.min(size, viewport.height - y)};
}
export function boundedRegion(box: Box, viewport: {width: number; height: number}): Box {
    if (!Number.isFinite(box.x + box.y + box.width + box.height) || box.width <= 0 || box.height <= 0) throw new Error('Invalid screenshot region');
    const x = Math.max(0, box.x), y = Math.max(0, box.y), right = Math.min(viewport.width, box.x + box.width), bottom = Math.min(viewport.height, box.y + box.height);
    if (right <= x || bottom <= y) throw new Error('Screenshot region is outside the viewport');
    return {x, y, width: right - x, height: bottom - y};
}
export function gesturePath(from: Point, to: Point, steps: number, humanize: boolean, random = Math.random): Point[] {
    const dx = to.x - from.x, dy = to.y - from.y, length = Math.hypot(dx, dy) || 1;
    const bend = humanize ? Math.min(30, length * 0.1) : 0;
    const c1 = {x: from.x + dx / 3 - dy / length * bend, y: from.y + dy / 3 + dx / length * bend};
    const c2 = {x: from.x + dx * 2 / 3 - dy / length * bend, y: from.y + dy * 2 / 3 + dx / length * bend};
    return Array.from({length: steps}, (_, i) => {
        const t = (i + 1) / steps, u = 1 - t;
        const jitter = humanize && i < steps - 1 ? (random() - 0.5) * 2 : 0;
        return {x: u ** 3 * from.x + 3 * u ** 2 * t * c1.x + 3 * u * t ** 2 * c2.x + t ** 3 * to.x + jitter,
            y: u ** 3 * from.y + 3 * u ** 2 * t * c1.y + 3 * u * t ** 2 * c2.y + t ** 3 * to.y + jitter};
    });
}
export function parseChord(chord: string) {
    const parts = chord.split('+').map(s => s.trim());
    if (parts.some(p => !p)) throw new Error('Invalid keyboard chord');
    const key = parts.pop()!;
    const modifiers = parts.map(part => {
        const modifier = ({ctrl: {key: 'Control', code: 'ControlLeft', keyCode: 17, mask: 2}, control: {key: 'Control', code: 'ControlLeft', keyCode: 17, mask: 2},
            shift: {key: 'Shift', code: 'ShiftLeft', keyCode: 16, mask: 8}, alt: {key: 'Alt', code: 'AltLeft', keyCode: 18, mask: 1},
            meta: {key: 'Meta', code: 'MetaLeft', keyCode: 91, mask: 4}, cmd: {key: 'Meta', code: 'MetaLeft', keyCode: 91, mask: 4}} as any)[part.toLowerCase()];
        if (!modifier) throw new Error(`Unknown modifier: ${part}`);
        return modifier;
    });
    const named = ({enter: ['Enter', 'Enter', 13], tab: ['Tab', 'Tab', 9], escape: ['Escape', 'Escape', 27], esc: ['Escape', 'Escape', 27],
        backspace: ['Backspace', 'Backspace', 8], delete: ['Delete', 'Delete', 46], space: [' ', 'Space', 32],
        arrowleft: ['ArrowLeft', 'ArrowLeft', 37], arrowup: ['ArrowUp', 'ArrowUp', 38], arrowright: ['ArrowRight', 'ArrowRight', 39], arrowdown: ['ArrowDown', 'ArrowDown', 40],
        home: ['Home', 'Home', 36], end: ['End', 'End', 35], pageup: ['PageUp', 'PageUp', 33], pagedown: ['PageDown', 'PageDown', 34]} as any)[key.toLowerCase()];
    const fn = /^F([1-9]|1[0-2])$/i.exec(key);
    if (!named && !fn && key.length !== 1) throw new Error(`Unsupported key: ${key}`);
    return {modifiers, mask: modifiers.reduce((mask, m) => mask | m.mask, 0), key: named?.[0] ?? (fn ? key.toUpperCase() : key),
        code: named?.[1] ?? (fn ? key.toUpperCase() : /[a-z]/i.test(key) ? 'Key' + key.toUpperCase() : /[0-9]/.test(key) ? 'Digit' + key : ''),
        keyCode: named?.[2] ?? (fn ? 111 + Number(fn[1]) : key.toUpperCase().charCodeAt(0))};
}

/** Lightweight contour candidates, not semantic recognition. Linear in the bounded image size. */
export function detectContours(data: Uint8ClampedArray, width: number, height: number, maxMarks = 50): Box[] {
    const mask = new Uint8Array(width * height), queue = new Int32Array(width * height);
    const luma = (p: number) => (data[p * 4] * 0.299 + data[p * 4 + 1] * 0.587 + data[p * 4 + 2] * 0.114);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        if (Math.abs(luma(i + 1) - luma(i - 1)) + Math.abs(luma(i + width) - luma(i - width)) > 90) mask[i] = 1;
    }
    const boxes: Box[] = [];
    for (let start = 0; start < mask.length; start++) {
        if (mask[start] !== 1) continue;
        let head = 0, tail = 1, minX = width, minY = height, maxX = 0, maxY = 0;
        queue[0] = start; mask[start] = 2;
        while (head < tail) {
            const i = queue[head++], x = i % width, y = Math.floor(i / width);
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx, ny = y + dy, ni = ny * width + nx;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height && mask[ni] === 1) { mask[ni] = 2; queue[tail++] = ni; }
            }
        }
        const w = maxX - minX + 1, h = maxY - minY + 1;
        if (w >= 20 && h >= 12 && w <= width * 0.8 && h <= height * 0.5 && w / h >= 0.7 && w / h <= 15 && tail > (w + h)) boxes.push({x: minX, y: minY, width: w, height: h});
    }
    return boxes.sort((a, b) => a.y - b.y || a.x - b.x).slice(0, maxMarks);
}
