/**
 * Drawing overlay, injected into the page with chrome.scripting.
 * Serialized into Chrome's isolated world: keep every dependency inside this function.
 *
 * The user marks up the tab with a pen, highlighted areas, shapes, lines,
 * arrows and notes, drawn with the same clean strokes as Sloth's guidance, in a color they
 * choose (blue by default; lime stays Sloth's, so the model can tell whose
 * marks it is looking at). Shapes can be selected, moved and resized afterwards,
 * and every change can be undone and redone. Marks are anchored to the document,
 * so scrolling keeps them on what they point at. The toolbar follows the panel's
 * light or dark theme.
 *
 * "Add to chat" hides the toolbar and selection and asks the extension to capture
 * the visible tab with the marks on it; the capture goes straight to the panel,
 * and the overlay removes itself.
 *
 * Actions: start (show the overlay; does nothing if it is already up), dispose.
 */
export function drawOverlay(args: {action: 'start' | 'dispose'; assets?: {sans: string}; theme?: 'light' | 'dark'}): unknown {
    const win = window as any;
    const INK = '#0f0f0e';
    const PANEL = '#1d1f1b';
    const PAPER = '#f6f4ef';
    const WHITE = '#ffffff';
    const ns = 'http://www.w3.org/2000/svg';
    const send = (message: any) => {
        try { return (globalThis as any).chrome.runtime.sendMessage(message); } catch { return Promise.resolve(); }
    };

    // Bump when the overlay changes. Its state outlives an extension reload on the page,
    // so an overlay from an older build is removed rather than kept.
    const VERSION = 3;
    if (args.action === 'dispose' || (win.__tamperSlothDraw && win.__tamperSlothDraw.version !== VERSION)) win.__tamperSlothDraw?.dispose();
    if (args.action === 'dispose') return {ok: true};
    if (win.__tamperSlothDraw) return {ok: true};

    if (args.assets && typeof FontFace !== 'undefined') {
        const face = new FontFace('TamperSloth Geist', `url("${args.assets.sans}")`, {weight: '100 900'});
        void face.load().then(loaded => document.fonts.add(loaded)).catch(() => {});
    }

    // The toolbar matches the panel: white accents in dark mode, black in light mode.
    const T = args.theme === 'light'
        ? {bar: WHITE, fg: INK, line: `${INK}1f`, soft: `${INK}0f`, muted: `${INK}b3`, faint: `${INK}66`, accent: INK, onAccent: WHITE, hintBg: `${WHITE}eb`, hintFg: `${INK}d9`}
        : {bar: PANEL, fg: PAPER, line: `${PAPER}26`, soft: `${PAPER}14`, muted: `${PAPER}b3`, faint: `${PAPER}66`, accent: PAPER, onAccent: INK, hintBg: `${INK}bf`, hintFg: `${PAPER}d9`};
    // No lime: that is Sloth's color on the page.
    const COLORS = [
        {value: '#2f7cf6', name: 'Blue'}, {value: '#e5484d', name: 'Red'}, {value: '#f76b15', name: 'Orange'},
        {value: '#ffc53d', name: 'Yellow'}, {value: '#8e4ec6', name: 'Purple'}, {value: '#e93d82', name: 'Pink'},
        {value: '#1e1e1e', name: 'Black'}, {value: '#ffffff', name: 'White'},
    ];
    const isDark = (hex: string) => {
        const n = parseInt(hex.slice(1), 16);
        return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 90;
    };

    const icon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
    const TOOLS = [
        {id: 'hand', key: 'h', label: 'Use the page', paths: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>'},
        {id: 'select', key: 'v', label: 'Select, move and resize', paths: '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>'},
        {id: 'pen', key: 'p', label: 'Pen', paths: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>'},
        {id: 'highlight', key: 'm', label: 'Highlight area', paths: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'},
        {id: 'rect', key: 'r', label: 'Rectangle', paths: '<rect width="18" height="18" x="3" y="3" rx="2"/>'},
        {id: 'ellipse', key: 'o', label: 'Ellipse', paths: '<circle cx="12" cy="12" r="9"/>'},
        {id: 'arrow', key: 'a', label: 'Arrow', paths: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>'},
        {id: 'line', key: 'l', label: 'Line', paths: '<path d="M5 19 19 5"/>'},
        {id: 'text', key: 't', label: 'Text', paths: '<path d="M12 4v16"/><path d="M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2"/><path d="M9 20h6"/>'},
        {id: 'eraser', key: 'e', label: 'Eraser', paths: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/>'},
    ];
    const ERASER_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18'%3E%3Ccircle cx='9' cy='9' r='7' fill='%23f6f4ef' fill-opacity='.6' stroke='%230f0f0e' stroke-width='1.5'/%3E%3C/svg%3E") 9 9, auto`;
    const FONT = `'TamperSloth Geist','Geist Variable',system-ui,sans-serif`;
    const HANDLE_CURSORS: Record<string, string> = {nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', start: 'move', end: 'move'};

    const host = document.createElement('div');
    host.id = 'tampersloth-draw';
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const root = host.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = `
        :host{pointer-events:none} *{box-sizing:border-box}
        .stage{position:fixed;inset:0;pointer-events:none}
        .capture{position:fixed;inset:0;pointer-events:auto;cursor:crosshair;touch-action:none}
        .stage[data-tool="hand"] .capture{display:none}
        .stage[data-tool="select"] .capture{cursor:default}
        .stage[data-tool="text"] .capture{cursor:text}
        .stage[data-tool="eraser"] .capture{cursor:${ERASER_CURSOR}}
        svg.ink{position:fixed;inset:0;width:100vw;height:100vh;overflow:visible;pointer-events:none}
        .shape{filter:drop-shadow(0 0 1px ${INK}66)}
        .hit{stroke:transparent;fill:none;stroke-width:18;pointer-events:none}
        .stage[data-tool="eraser"] .hit,.stage[data-tool="select"] .hit{pointer-events:stroke}
        .stage[data-tool="eraser"] .highlight .hit,.stage[data-tool="select"] .highlight .hit{pointer-events:all}
        .stage[data-tool="eraser"] text,.stage[data-tool="select"] text{pointer-events:bounding-box}
        .stage[data-tool="eraser"] .shape *{cursor:${ERASER_CURSOR}}
        .stage[data-tool="select"] .shape *{cursor:move}
        .stage[data-tool="hand"] .selection,.stage[data-tool="eraser"] .selection{display:none}
        .sel-move{fill:transparent;pointer-events:none}
        .stage[data-tool="select"] .sel-move{pointer-events:all;cursor:move}
        .sel-handle{pointer-events:all}
        .note{position:fixed;pointer-events:auto;margin:0;padding:1px 4px;min-width:3ch;border:1.5px dashed currentColor;border-radius:4px;outline:none;
              background:${INK}66;font:600 18px/1.25 ${FONT};-webkit-font-smoothing:antialiased}
        .bar{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);display:flex;align-items:center;gap:2px;padding:5px;max-width:calc(100vw - 16px);overflow-x:auto;
             background:${T.bar};color:${T.fg};border:1px solid ${T.line};border-radius:12px;pointer-events:auto;
             box-shadow:0 1px 2px ${INK}33,0 8px 24px ${INK}4d;font:500 12px/1 ${FONT};-webkit-font-smoothing:antialiased;scrollbar-width:none}
        .bar[hidden]{display:none}
        .tool{position:relative;flex:none;display:grid;place-items:center;width:34px;height:34px;padding:0;border:0;border-radius:8px;background:transparent;color:${T.muted};cursor:pointer;appearance:none}
        .tool:hover{background:${T.soft};color:${T.fg}}
        .tool[aria-pressed="true"]{background:${T.accent};color:${T.onAccent}}
        .tool:disabled{opacity:.35;cursor:default;background:transparent}
        .tool svg{width:17px;height:17px}
        .tool kbd{position:absolute;right:3px;bottom:2px;font:500 8px/1 ${FONT};color:${T.faint};text-transform:uppercase}
        .tool[aria-pressed="true"] kbd{color:${T.onAccent}99}
        .swatch{display:block;width:16px;height:16px;border-radius:50%;box-shadow:0 0 0 1.5px ${T.line},inset 0 0 0 1px ${INK}26}
        .sep{flex:none;width:1px;height:20px;margin:0 4px;background:${T.line}}
        .text-button{flex:none;height:34px;padding:0 12px;border:0;border-radius:8px;font:inherit;cursor:pointer;appearance:none;white-space:nowrap}
        .cancel{background:transparent;color:${T.muted}} .cancel:hover{background:${T.soft};color:${T.fg}}
        .done{background:${T.accent};color:${T.onAccent};font-weight:600} .done:hover{opacity:.88}
        .done:disabled{opacity:.6;cursor:progress}
        .palette{position:fixed;bottom:64px;display:flex;gap:6px;padding:7px;transform:translateX(-50%);background:${T.bar};border:1px solid ${T.line};border-radius:10px;
                 pointer-events:auto;box-shadow:0 1px 2px ${INK}33,0 8px 24px ${INK}4d}
        .palette[hidden]{display:none}
        .color{width:22px;height:22px;padding:0;border:0;border-radius:50%;cursor:pointer;appearance:none;box-shadow:inset 0 0 0 1px ${T.faint}}
        .color[aria-checked="true"]{box-shadow:inset 0 0 0 1px ${T.faint},0 0 0 2px ${T.bar},0 0 0 3.5px ${T.fg}}
        .hint{position:fixed;left:50%;bottom:66px;transform:translateX(-50%);padding:5px 9px;border-radius:6px;background:${T.hintBg};color:${T.hintFg};white-space:nowrap;
              border:1px solid ${T.line};font:400 11px/1.3 ${FONT};-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);pointer-events:none}
        .hint b{font-weight:600;color:${T.fg}}
        .hint[hidden]{display:none}
    `;
    const stage = document.createElement('div');
    stage.className = 'stage';
    const capture = document.createElement('div');
    capture.className = 'capture';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ink');
    svg.setAttribute('aria-hidden', 'true');
    const world = document.createElementNS(ns, 'g');
    const selectionLayer = document.createElementNS(ns, 'g');
    selectionLayer.setAttribute('class', 'selection');
    world.append(selectionLayer);
    svg.append(world);
    stage.append(capture, svg);

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Draw on the page for Sloth');
    const toolButtons = new Map<string, HTMLButtonElement>();
    const button = (className: string, label: string, html: string, onClick: () => void) => {
        const el = document.createElement('button');
        el.type = 'button'; el.className = className; el.title = label;
        el.setAttribute('aria-label', label); el.innerHTML = html;
        // Keep focus (and an open note) where it is until the click lands.
        el.addEventListener('pointerdown', event => event.preventDefault());
        el.addEventListener('click', onClick);
        return el;
    };
    const sep = () => Object.assign(document.createElement('div'), {className: 'sep'});
    for (const tool of TOOLS) {
        const el = button('tool', `${tool.label} (${tool.key.toUpperCase()})`, icon(tool.paths) + `<kbd>${tool.key}</kbd>`, () => setTool(tool.id));
        toolButtons.set(tool.id, el);
        if (tool.id === 'pen') bar.append(sep());
        bar.append(el);
    }
    const colorButton = button('tool', 'Color', '<span class="swatch"></span>', () => togglePalette());
    colorButton.setAttribute('aria-haspopup', 'true');
    const undoButton = button('tool', 'Undo (Ctrl+Z)', icon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>'), () => undo());
    const redoButton = button('tool', 'Redo (Ctrl+Shift+Z)', icon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>'), () => redo());
    const clearButton = button('tool', 'Clear all', icon('<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>'), () => clearAll());
    const cancelButton = button('text-button cancel', 'Cancel (Esc)', 'Cancel', () => dispose());
    const doneButton = button('text-button done', 'Add to chat (Enter)', 'Add to chat', () => void finish());
    bar.append(sep(), colorButton, sep(), undoButton, redoButton, clearButton, sep(), cancelButton, doneButton);

    const palette = document.createElement('div');
    palette.className = 'palette';
    palette.hidden = true;
    palette.setAttribute('role', 'radiogroup');
    palette.setAttribute('aria-label', 'Shape color');
    const colorButtons = COLORS.map(({value, name}) => {
        const el = button('color', name, '', () => { setColor(value); togglePalette(false); });
        el.setAttribute('role', 'radio');
        el.style.background = value;
        el.dataset.color = value;
        palette.append(el);
        return el;
    });

    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.setAttribute('role', 'status');
    root.append(style, stage, hint, palette, bar);
    document.documentElement.append(host);

    type Point = {x: number; y: number};
    type Saved = {tool: string; points: Point[]; color: string; text?: string};
    type Shape = Saved & {node: SVGGElement};
    type Box = {x: number; y: number; w: number; h: number};
    type Drag = {kind: 'move' | 'resize'; shape: Shape; handle: string; origin: Point; points: Point[]; box: Box; before: Saved[]; moved: boolean};
    let shapes: Shape[] = [];
    const undoStack: Saved[][] = [];
    const redoStack: Saved[][] = [];
    let tool = 'pen';
    let color = COLORS[0].value;
    let drawing: Shape | null = null;
    let drag: Drag | null = null;
    let selected: Shape | null = null;
    let note: {input: HTMLInputElement; at: Point} | null = null;
    let erasing = false;
    let busy = false;
    let discardArmed = 0;

    const DEFAULT_HINT = 'Draw to point things out, then <b>Add to chat</b> · Esc to cancel';
    let hintHtml: string | null = DEFAULT_HINT;
    const showHint = (html: string | null) => {
        hintHtml = html;
        hint.hidden = html === null || !palette.hidden;
        if (html !== null) hint.innerHTML = html;
    };
    showHint(DEFAULT_HINT);

    const toPage = (event: PointerEvent | MouseEvent): Point => ({x: event.clientX + scrollX, y: event.clientY + scrollY});
    const place = () => world.setAttribute('transform', `translate(${-scrollX},${-scrollY})`);
    const onScroll = () => requestAnimationFrame(place);
    window.addEventListener('scroll', onScroll, {passive: true});
    place();

    const refresh = () => {
        undoButton.disabled = !undoStack.length;
        redoButton.disabled = !redoStack.length;
        clearButton.disabled = !shapes.length;
        for (const [id, el] of toolButtons) el.setAttribute('aria-pressed', String(id === tool));
        (colorButton.firstElementChild as HTMLElement).style.background = color;
        for (const el of colorButtons) el.setAttribute('aria-checked', String(el.dataset.color === color));
        stage.dataset.tool = tool;
    };

    /** Smooths a freehand stroke through the midpoints of its samples. */
    const strokePath = (points: Point[]) => {
        const [first] = points;
        if (points.length < 3) return `M${first.x},${first.y}` + (points.length === 1 ? ' l0.01,0' : ` L${points[1].x},${points[1].y}`);
        let d = `M${first.x},${first.y}`;
        for (let i = 1; i < points.length - 1; i++) {
            const mx = (points[i].x + points[i + 1].x) / 2, my = (points[i].y + points[i + 1].y) / 2;
            d += ` Q${points[i].x},${points[i].y} ${mx},${my}`;
        }
        const last = points[points.length - 1];
        return d + ` L${last.x},${last.y}`;
    };

    const bounds = (shape: Saved) => {
        const a = shape.points[0], b = shape.points[shape.points.length - 1];
        return {a, b, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)};
    };
    /** The box a shape's selection frame and handles sit on. */
    const boxOf = (shape: Shape): Box => {
        if (shape.tool === 'text') {
            const box = (shape.node.firstElementChild as SVGGraphicsElement).getBBox();
            return {x: box.x, y: box.y, w: box.width, h: box.height};
        }
        if (shape.tool === 'pen') {
            const xs = shape.points.map(p => p.x), ys = shape.points.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys);
            return {x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y};
        }
        const {x, y, w, h} = bounds(shape);
        return {x, y, w, h};
    };
    const geometry = (shape: Saved) => {
        const {a, b, x, y, w, h} = bounds(shape);
        switch (shape.tool) {
            case 'rect':
            case 'highlight': {
                // Same corner radius as Sloth's guidance boxes.
                const r = Math.min(10, w / 3, h / 3);
                return `M${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x + r} Q${x},${y + h} ${x},${y + h - r} V${y + r} Q${x},${y} ${x + r},${y} Z`;
            }
            case 'ellipse': {
                const rx = w / 2, ry = h / 2, cy = y + ry;
                return `M${x},${cy} a${rx},${ry} 0 1,0 ${w},0 a${rx},${ry} 0 1,0 ${-w},0 Z`;
            }
            case 'line':
                return `M${a.x},${a.y} L${b.x},${b.y}`;
            case 'arrow': {
                const angle = Math.atan2(b.y - a.y, b.x - a.x), head = Math.min(16, Math.hypot(b.x - a.x, b.y - a.y) / 3);
                const left = {x: b.x - head * Math.cos(angle - .5), y: b.y - head * Math.sin(angle - .5)};
                const right = {x: b.x - head * Math.cos(angle + .5), y: b.y - head * Math.sin(angle + .5)};
                return `M${a.x},${a.y} L${b.x},${b.y} M${left.x},${left.y} L${b.x},${b.y} L${right.x},${right.y}`;
            }
            default:
                return strokePath(shape.points);
        }
    };
    const build = (shape: Shape) => {
        const group = shape.node;
        group.setAttribute('class', `shape ${shape.tool}`);
        if (shape.tool === 'text') {
            const text = document.createElementNS(ns, 'text');
            text.setAttribute('dominant-baseline', 'hanging');
            text.setAttribute('fill', shape.color); text.setAttribute('stroke', isDark(shape.color) ? PAPER : INK); text.setAttribute('stroke-width', '3');
            text.setAttribute('stroke-linejoin', 'round'); text.setAttribute('paint-order', 'stroke');
            text.setAttribute('style', `font:600 18px/1.25 ${FONT}`);
            text.textContent = shape.text ?? '';
            group.replaceChildren(text);
            return;
        }
        const ink = document.createElementNS(ns, 'path');
        ink.setAttribute('class', 'outline');
        ink.setAttribute('fill', 'none'); ink.setAttribute('stroke', shape.color);
        ink.setAttribute('stroke-linecap', 'round'); ink.setAttribute('stroke-linejoin', 'round');
        ink.setAttribute('stroke-width', shape.tool === 'pen' ? '2.5' : '2');
        const hit = document.createElementNS(ns, 'path');
        hit.setAttribute('class', 'hit');
        if (shape.tool !== 'highlight') {
            group.replaceChildren(ink, hit);
            return;
        }
        // A highlighted area is a translucent wash of its color inside the outline.
        const wash = document.createElementNS(ns, 'path');
        wash.setAttribute('class', 'outline');
        wash.setAttribute('fill', shape.color); wash.setAttribute('fill-opacity', '.18'); wash.setAttribute('stroke', 'none');
        ink.setAttribute('stroke-width', '1.5');
        group.replaceChildren(wash, ink, hit);
    };
    const update = (shape: Shape) => {
        if (shape.tool === 'text') {
            const text = shape.node.firstElementChild!;
            text.setAttribute('x', String(shape.points[0].x));
            text.setAttribute('y', String(shape.points[0].y));
            return;
        }
        const d = geometry(shape);
        for (const path of shape.node.querySelectorAll('.outline, .hit')) path.setAttribute('d', d);
    };
    const make = (saved: Saved): Shape => {
        const shape: Shape = {...saved, points: saved.points.map(p => ({...p})), node: document.createElementNS(ns, 'g')};
        build(shape);
        update(shape);
        return shape;
    };
    const begin = (toolId: string, at: Point, text?: string): Shape => {
        const shape = make({tool: toolId, points: [at], color, text});
        world.insertBefore(shape.node, selectionLayer);
        return shape;
    };
    /** A shape too small to mean anything is a slip of the mouse, not a mark. */
    const meaningful = (shape: Shape) => {
        if (shape.tool === 'pen' || shape.tool === 'text') return true;
        const a = shape.points[0], b = shape.points[shape.points.length - 1];
        return shape.tool === 'arrow' || shape.tool === 'line' ? Math.hypot(b.x - a.x, b.y - a.y) >= 8 : Math.abs(b.x - a.x) >= 4 && Math.abs(b.y - a.y) >= 4;
    };

    // History keeps plain copies, so moving or resizing a shape in place can be undone too.
    const save = (): Saved[] => shapes.map(({tool, points, color, text}) => ({tool, points: points.map(p => ({...p})), color, text}));
    const remember = (before: Saved[] = save()) => {
        undoStack.push(before);
        if (undoStack.length > 100) undoStack.shift();
        redoStack.length = 0;
    };
    const redraw = () => {
        world.replaceChildren(...shapes.map(shape => shape.node), selectionLayer);
        renderSelection();
        refresh();
    };
    const restore = (saved: Saved[]) => {
        selected = null;
        shapes = saved.map(make);
        redraw();
    };
    const added = () => {
        discardArmed = 0;
        showHint(null);
        refresh();
    };

    function renderSelection() {
        selectionLayer.replaceChildren();
        if (!selected || !shapes.includes(selected)) { selected = null; return; }
        const rect = (attrs: Record<string, string | number>) => {
            const el = document.createElementNS(ns, 'rect');
            for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
            selectionLayer.append(el);
            return el;
        };
        const handle = (name: string, x: number, y: number) => {
            const el = rect({x: x - 4.5, y: y - 4.5, width: 9, height: 9, rx: 2, fill: PAPER, stroke: INK, 'stroke-width': 1.25, class: 'sel-handle'});
            el.dataset.handle = name;
            el.style.cursor = HANDLE_CURSORS[name];
        };
        if (selected.tool === 'arrow' || selected.tool === 'line') {
            const a = selected.points[0], b = selected.points[selected.points.length - 1];
            handle('start', a.x, a.y);
            handle('end', b.x, b.y);
            return;
        }
        const box = boxOf(selected), pad = 6;
        const x = box.x - pad, y = box.y - pad, w = box.w + pad * 2, h = box.h + pad * 2;
        // A light underlay under a dark dashed frame reads on any page.
        rect({x, y, width: w, height: h, fill: 'none', stroke: PAPER, 'stroke-width': 3, opacity: .85});
        rect({x, y, width: w, height: h, fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '4 3'});
        rect({x, y, width: w, height: h, class: 'sel-move'}).dataset.handle = 'move';
        if (selected.tool === 'text') return;
        for (const [name, hx, hy] of [['nw', x, y], ['n', x + w / 2, y], ['ne', x + w, y], ['e', x + w, y + h / 2],
            ['se', x + w, y + h], ['s', x + w / 2, y + h], ['sw', x, y + h], ['w', x, y + h / 2]] as const) handle(name, hx, hy);
    }
    const select = (shape: Shape | null) => {
        selected = shape;
        renderSelection();
    };

    const commitNote = () => {
        if (!note) return;
        const {input, at} = note;
        note = null;
        input.remove();
        const text = input.value.trim();
        if (!text) return;
        remember();
        shapes.push(begin('text', at, text));
        added();
    };
    const openNote = (event: PointerEvent) => {
        const input = document.createElement('input');
        input.className = 'note';
        input.placeholder = 'Note';
        input.style.left = `${event.clientX}px`;
        input.style.top = `${event.clientY - 2}px`;
        input.style.color = color;
        input.size = 4;
        input.addEventListener('input', () => { input.size = Math.max(4, input.value.length + 1); });
        input.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Enter') { event.preventDefault(); commitNote(); }
            if (event.key === 'Escape') { event.preventDefault(); input.value = ''; commitNote(); }
        });
        // Page shortcuts must not react to typing in the note.
        for (const type of ['keyup', 'keypress']) input.addEventListener(type, event => event.stopPropagation());
        input.addEventListener('blur', () => commitNote());
        stage.append(input);
        note = {input, at: {x: event.clientX + scrollX, y: event.clientY + scrollY}};
        requestAnimationFrame(() => input.focus());
    };

    const shapeAt = (target: EventTarget | null) => {
        const node = (target as Element | null)?.closest?.('.shape');
        return shapes.find(shape => shape.node === node) ?? null;
    };
    const eraseAt = (target: EventTarget | null) => {
        const shape = shapeAt(target);
        if (!shape) return;
        remember();
        shapes = shapes.filter(other => other !== shape);
        redraw();
    };
    const startDrag = (kind: Drag['kind'], shape: Shape, handle: string, event: PointerEvent) => {
        capture.setPointerCapture(event.pointerId);
        drag = {kind, shape, handle, origin: toPage(event), points: shape.points.map(p => ({...p})), box: boxOf(shape), before: save(), moved: false};
    };
    /** Applies a move or resize drag, from where the shape was when the drag began. */
    const applyDrag = (point: Point) => {
        if (!drag) return;
        const {shape, handle, origin, points, box} = drag;
        const dx = point.x - origin.x, dy = point.y - origin.y;
        if (dx || dy) drag.moved = true;
        if (drag.kind === 'move') {
            shape.points = points.map(p => ({x: p.x + dx, y: p.y + dy}));
        } else if (handle === 'start' || handle === 'end') {
            shape.points = points.map((p, i) => (handle === 'start' ? i === 0 : i === points.length - 1) ? {x: p.x + dx, y: p.y + dy} : p);
        } else {
            const left = box.x + (handle.includes('w') ? dx : 0), right = box.x + box.w + (handle.includes('e') ? dx : 0);
            const top = box.y + (handle.includes('n') ? dy : 0), bottom = box.y + box.h + (handle.includes('s') ? dy : 0);
            if (shape.tool === 'pen') {
                // Strokes scale with their box; a flat one only moves along its flat side.
                const sx = box.w ? (right - left) / box.w : 1, sy = box.h ? (bottom - top) / box.h : 1;
                shape.points = points.map(p => ({x: left + (p.x - box.x) * sx, y: top + (p.y - box.y) * sy}));
            } else {
                shape.points = [{x: left, y: top}, {x: right, y: bottom}];
            }
        }
        update(shape);
        renderSelection();
    };

    stage.addEventListener('pointerdown', (event: PointerEvent) => {
        if (busy || event.button !== 0 || tool === 'hand' || event.target === note?.input) return;
        event.preventDefault(); event.stopPropagation();
        togglePalette(false);
        if (note) { commitNote(); return; }
        const handle = (event.target as Element | null)?.closest?.('[data-handle]') as SVGElement | null;
        if (handle && selected) {
            const name = handle.dataset.handle!;
            startDrag(name === 'move' ? 'move' : 'resize', selected, name, event);
            return;
        }
        if (tool === 'select') {
            const shape = shapeAt(event.target);
            select(shape);
            if (shape) startDrag('move', shape, 'move', event);
            return;
        }
        select(null);
        if (tool === 'text') { openNote(event); return; }
        if (tool === 'eraser') { erasing = true; eraseAt(event.target); return; }
        capture.setPointerCapture(event.pointerId);
        drawing = begin(tool, toPage(event));
    });
    stage.addEventListener('pointermove', (event: PointerEvent) => {
        if (drag) { applyDrag(toPage(event)); return; }
        if (tool === 'eraser' && erasing) { eraseAt(event.target); return; }
        if (!drawing) return;
        const point = toPage(event);
        if (drawing.tool === 'pen') {
            const last = drawing.points[drawing.points.length - 1];
            if (Math.hypot(point.x - last.x, point.y - last.y) < 1.5) return;
            drawing.points.push(point);
        } else {
            drawing.points[1] = point;
        }
        update(drawing);
    });
    const endStroke = () => {
        erasing = false;
        if (drag) {
            if (drag.moved) { remember(drag.before); added(); }
            drag = null;
            return;
        }
        if (!drawing) return;
        const shape = drawing;
        drawing = null;
        if (!meaningful(shape)) { shape.node.remove(); return; }
        remember();
        shapes.push(shape);
        added();
        // A fresh shape keeps its handles, so it can be adjusted straight away.
        if (shape.tool !== 'pen') select(shape);
    };
    stage.addEventListener('pointerup', endStroke);
    stage.addEventListener('pointercancel', endStroke);
    for (const type of ['click', 'dblclick', 'contextmenu', 'mousedown', 'mouseup']) stage.addEventListener(type, event => {
        if (tool !== 'hand') { event.preventDefault(); event.stopPropagation(); }
    });

    function setTool(id: string) {
        commitNote();
        togglePalette(false);
        tool = id;
        if (id !== 'select') select(null);
        refresh();
    }
    function setColor(value: string) {
        color = value;
        if (note) note.input.style.color = value;
        // Like most drawing tools, picking a color also recolors the selected shape.
        if (selected && selected.color !== value) {
            remember();
            selected.color = value;
            build(selected);
            update(selected);
        }
        refresh();
    }
    function togglePalette(open = palette.hidden) {
        if (open === !palette.hidden) return;
        if (open) {
            const box = colorButton.getBoundingClientRect();
            palette.style.left = `${Math.min(Math.max(box.left + box.width / 2, 130), innerWidth - 130)}px`;
        }
        palette.hidden = !open;
        colorButton.setAttribute('aria-expanded', String(open));
        showHint(hintHtml);
    }
    function undo() {
        commitNote();
        const previous = undoStack.pop();
        if (!previous) return;
        redoStack.push(save());
        restore(previous);
    }
    function redo() {
        commitNote();
        const next = redoStack.pop();
        if (!next) return;
        undoStack.push(save());
        restore(next);
    }
    function clearAll() {
        commitNote();
        if (!shapes.length) return;
        remember();
        restore([]);
    }
    function deleteSelected() {
        if (!selected) return;
        remember();
        shapes = shapes.filter(shape => shape !== selected);
        selected = null;
        redraw();
    }

    const editable = (target: EventTarget | undefined) => {
        const el = target as HTMLElement | undefined;
        return !!el && (el.isContentEditable || /^(input|textarea|select)$/i.test(el.tagName ?? ''));
    };
    const onKey = (event: KeyboardEvent) => {
        // Typing into a note or (with the hand tool) into the page is left alone. The note
        // sits in a closed root, so from here its keys appear to come from the host.
        if (busy || event.isComposing || note || editable(event.composedPath()[0])) return;
        const handled = () => { event.preventDefault(); event.stopPropagation(); };
        const mod = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        if (event.key === 'Escape') {
            handled();
            if (!palette.hidden) { togglePalette(false); return; }
            if (selected) { select(null); return; }
            // Drawings take effort; a single stray Escape does not throw them away.
            if (!shapes.length || Date.now() - discardArmed < 2500) { dispose(); return; }
            discardArmed = Date.now();
            showHint('Press <b>Esc</b> again to discard your drawing');
            setTimeout(() => { if (discardArmed && Date.now() - discardArmed >= 2500) showHint(null); }, 2600);
            return;
        }
        if (mod && !event.altKey && ((key === 'z' && event.shiftKey) || key === 'y')) { handled(); redo(); return; }
        if (mod && !event.altKey && key === 'z') { handled(); undo(); return; }
        if (mod || event.altKey) return;
        if ((event.key === 'Delete' || event.key === 'Backspace') && selected) { handled(); deleteSelected(); return; }
        if (event.key === 'Enter' && tool !== 'hand') { handled(); void finish(); return; }
        const match = TOOLS.find(t => t.key === key);
        if (match) { handled(); setTool(match.id); }
    };
    document.addEventListener('keydown', onKey, true);

    async function finish() {
        if (busy) return;
        commitNote();
        busy = true;
        doneButton.disabled = true;
        // Only the page and the marks belong in the capture.
        togglePalette(false);
        select(null);
        bar.hidden = true;
        showHint(null);
        try {
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));
            const response = await send({type: 'DRAW_CAPTURE', marks: shapes.length});
            if (!response?.ok) throw new Error(response?.error || 'capture failed');
            dispose();
        } catch {
            busy = false;
            doneButton.disabled = false;
            bar.hidden = false;
            showHint("Couldn't capture this tab · try again");
        }
    }
    function dispose() {
        document.removeEventListener('keydown', onKey, true);
        window.removeEventListener('scroll', onScroll);
        host.remove();
        delete win.__tamperSlothDraw;
        void send({type: 'DRAW_ENDED'})?.catch?.(() => {});
    }

    win.__tamperSlothDraw = {dispose, version: VERSION};
    refresh();
    return {ok: true};
}

/** Runs the overlay in a tab; false when the tab cannot be scripted (e.g. a chrome:// page). */
export async function runDrawOverlay(tabId: number, action: 'start' | 'dispose', theme?: 'light' | 'dark'): Promise<boolean> {
    if (typeof chrome === 'undefined' || !chrome?.scripting) return false;
    const assets = {sans: chrome.runtime.getURL('fonts/geist-latin-wght-normal.woff2')};
    try {
        const [result] = await chrome.scripting.executeScript({target: {tabId}, func: drawOverlay, args: [{action, assets, theme}]});
        return (result?.result as {ok?: boolean} | undefined)?.ok === true;
    } catch {
        return false;
    }
}
