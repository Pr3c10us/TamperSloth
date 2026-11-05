import type {CDPManager} from './cdp';
import {pagePerception} from '@/injected/pagePerception';
import {pageChanges, runPageGuidance} from '@/injected/pageGuidance';
import {pageScreenshotState, withFreshScreenshot} from './screenshotCapture';
import {boundedRegion, gridRegion, columnLabel, detectContours, gesturePath, parseChord, type Box, type Point} from './visualGeometry';

type Scope = {tabId: number; sessionId?: string; frameId?: string; contextId?: number};
type World = Scope & {contextId: number; frameId: string};
type Snapshot = {id: string; timestamp: number; scope: World; metrics: any; marks: any[]; gridSize: number; region: Box};
/** Time a marked screenshot may spend finding marks beyond the DOM scan. */
const MARK_DISCOVERY_MS = 1500;
const MARK_BATCH = 50;
/** An action counts as settled once the page has changed and then gone this long without changing. */
const SETTLE_QUIET_MS = 150;
export class VisualBrowser {
    private snapshots = new Map<string, Snapshot>();
    private cdp: CDPManager;
    constructor(cdp: CDPManager) { this.cdp = cdp; }
    private async command(a: Scope, method: string, params: any = {}) {
        const result = await this.cdp.command(a.tabId, method, params, a.sessionId);
        return result;
    }
    private async release(tabId: number, method: string, params: any) {
        // Release held input when a gesture finishes or fails.
        await this.cdp.release(tabId, method, params);
    }
    private async world(a: Scope): Promise<World> {
        let frameId = a.frameId;
        if (!frameId && a.contextId) {
            const frames = await this.cdp.frames(a.tabId);
            frameId = frames.contexts.find((c: any) => c.id === a.contextId && c.sessionId === a.sessionId)?.auxData?.frameId;
            if (!frameId) throw new Error('Execution context is stale or does not belong to the selected session');
        }
        if (!frameId) frameId = (await this.command(a, 'Page.getFrameTree')).frameTree.frame.id;
        const context = await this.command(a, 'Page.createIsolatedWorld', {frameId, worldName: 'TamperSloth perception'});
        return {...a, frameId: frameId!, contextId: context.executionContextId};
    }
    private async page(a: World, args: any, objectId?: string) {
        const result = objectId
            ? await this.command(a, 'Runtime.callFunctionOn', {objectId, functionDeclaration: `function(args) { return (${pagePerception.toString()})(args, this); }`, arguments: [{value: args}], returnByValue: true})
            : await this.command(a, 'Runtime.evaluate', {expression: `(${pagePerception.toString()})(${JSON.stringify(args)})`, contextId: a.contextId, returnByValue: true, awaitPromise: true});
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
        if (!result.result || !Object.hasOwn(result.result, 'value')) throw new Error('Perception returned no structured result');
        return result.result.value;
    }
    /**
     * Marks for nodes the DOM scan missed. Nodes resolve concurrently in batches and each batch is
     * marked in one call, instead of three sequential round trips per node.
     */
    private async addMarks(scope: World, snapshotId: string, maxMarks: number, have: number, backendNodeIds: number[], deadline: number) {
        const marks: any[] = [], objectGroup = `ts-marks-${snapshotId}`;
        let inspected = 0;
        try {
            for (let i = 0; i < backendNodeIds.length && have + marks.length < maxMarks && Date.now() < deadline; i += MARK_BATCH) {
                const batch = backendNodeIds.slice(i, i + MARK_BATCH);
                inspected += batch.length;
                const objectIds = (await Promise.all(batch.map(backendNodeId => this.command(scope, 'DOM.resolveNode', {backendNodeId, executionContextId: scope.contextId, objectGroup})
                    .then(node => node.object?.objectId as string | undefined, () => undefined)))).filter((objectId): objectId is string => !!objectId);
                if (!objectIds.length) continue;
                const result = await this.command(scope, 'Runtime.callFunctionOn', {objectId: objectIds[0], returnByValue: true,
                    functionDeclaration: `function(args, ...elements) { const run = (${pagePerception.toString()}); return elements.map(el => run(args, el)); }`,
                    arguments: [{value: {action: 'addMark', snapshotId, maxMarks}}, ...objectIds.map(objectId => ({objectId}))]});
                if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
                for (const mark of result.result?.value ?? []) if (mark && have + marks.length < maxMarks) marks.push(mark);
            }
        } finally { await this.command(scope, 'Runtime.releaseObjectGroup', {objectGroup}).catch(() => {}); }
        return {marks, inspected, full: have + marks.length >= maxMarks && inspected < backendNodeIds.length};
    }
    /** Role+name matches from the accessibility tree; asks only for matching nodes when it can. */
    private async axCandidates(a: World, target: any): Promise<any[]> {
        const match = (s: string) => target.exact === false ? s.toLowerCase().includes(target.name.toLowerCase()) : s.trim() === target.name.trim();
        const usable = (nodes: any[]) => nodes.filter((n: any) => !n.ignored && n.role?.value === target.role && match(n.name?.value ?? '') && n.backendDOMNodeId);
        if (target.exact !== false) {
            // The full tree of a large app is tens of thousands of nodes; an exact name can be looked up instead.
            try {
                const doc = await this.command(a, 'Runtime.evaluate', {expression: 'document', contextId: a.contextId, returnByValue: false});
                try {
                    const found = await this.command(a, 'Accessibility.queryAXTree', {objectId: doc.result.objectId, accessibleName: target.name.trim(), role: target.role});
                    const nodes = usable(found.nodes);
                    if (nodes.length) return nodes;
                } finally { await this.command(a, 'Runtime.releaseObject', {objectId: doc.result.objectId}).catch(() => {}); }
            } catch { /* No match or no query support: read the whole tree as before. */ }
        }
        return usable((await this.command(a, 'Accessibility.getFullAXTree', {frameId: a.frameId})).nodes);
    }
    private async resolve(a: World, target: any, edge?: string): Promise<any> {
        if (!target) throw new Error('An element target or point is required');
        // A listControls ref names a control in the overlay's world; turn it into a selector that finds only that element.
        if (target.ref) target = {selector: (await runPageGuidance(a.tabId, {action: 'resolveRef', ref: target.ref})).selector};
        // Re-resolving the element already found (after hover) needs no new tree lookup.
        if (target.backendNodeId) {
            const {backendNodeId, ...rest} = target;
            try {
                const object = await this.command(a, 'DOM.resolveNode', {backendNodeId, executionContextId: a.contextId});
                try { return {...await this.page(a, {action: 'resolve', target: {selector: '*'}, edge}, object.object.objectId), backendNodeId}; }
                finally { await this.command(a, 'Runtime.releaseObject', {objectId: object.object.objectId}); }
            } catch { target = rest; }
        }
        if (target.mark) {
            const snapshot = this.snapshots.get(target.snapshotId);
            if (!snapshot || snapshot.scope.tabId !== a.tabId || snapshot.scope.frameId !== a.frameId || snapshot.scope.sessionId !== a.sessionId) throw new Error('Mark belongs to a different or expired snapshot');
            const mark = snapshot.marks.find(m => m.id === target.mark);
            if (!mark) throw new Error('Mark not found');
            if (mark.source === 'contour') {
                const metrics = await this.page(a, {action: 'metrics'});
                if (Date.now() - snapshot.timestamp > 30000 || JSON.stringify(metrics) !== JSON.stringify(snapshot.metrics)) throw new Error('Visual mark is stale. Take a new screenshot.');
                return this.page(a, {action: 'resolve', target: mark.localCenter});
            }
        }
        // Role/name targeting uses the browser AX name when possible, including closed roots.
        if (target.role) {
            const candidates = await this.axCandidates(a, target);
            if (candidates.length > 1 && target.index === undefined) throw new Error(`Target is ambiguous (${candidates.length} AX matches). Narrow it or specify index.`);
            const selected = candidates[target.index ?? 0];
            if (candidates.length && !selected) throw new Error('Target index is out of range');
            const visible: any[] = [];
            for (const node of selected ? [selected] : []) {
                const object = await this.command(a, 'DOM.resolveNode', {backendNodeId: node.backendDOMNodeId, executionContextId: a.contextId});
                try { visible.push({...await this.page(a, {action: 'resolve', target: {selector: '*'}, edge}, object.object.objectId), backendNodeId: node.backendDOMNodeId}); }
                catch (error) { if (candidates.length === 1) throw error; }
                finally { await this.command(a, 'Runtime.releaseObject', {objectId: object.object.objectId}); }
            }
            if (visible.length > 1 && target.index === undefined) throw new Error(`Target is ambiguous (${visible.length} visible matches). Narrow it or specify index.`);
            if (visible.length) {
                return visible[0];
            }
        }
        try { return await this.page(a, {action: 'resolve', target, edge}); }
        catch (error) {
            if (!target.selector || !String(error).includes('Target not found')) throw error;
            // CSS fallback pierces closed roots through CDP's document nodes.
            const doc = await this.command(a, 'DOM.getFlattenedDocument', {depth: -1, pierce: true});
            const ids: number[] = [];
            for (const root of doc.nodes.filter((n: any) => n.nodeType === 9 || n.nodeType === 11)) {
                const found = await this.command(a, 'DOM.querySelectorAll', {nodeId: root.nodeId, selector: target.selector}); ids.push(...found.nodeIds);
            }
            const unique = [...new Set(ids)];
            if (!unique.length) throw error;
            if (unique.length > 1 && target.index === undefined) throw new Error('Selector is ambiguous across shadow roots');
            const nodeId = unique[target.index ?? 0];
            if (!nodeId) throw new Error('Target index is out of range');
            const object = await this.command(a, 'DOM.resolveNode', {nodeId, executionContextId: a.contextId});
            try { return await this.page(a, {action: 'resolve', target: {selector: '*'}, edge}, object.object.objectId); }
            finally { await this.command(a, 'Runtime.releaseObject', {objectId: object.object.objectId}); }
        }
    }
    private async frameOffset(a: World, root: World, point?: Point, graph?: any, seen = new Set<string>()): Promise<{x: number; y: number; scaleX: number; scaleY: number}> {
        if (a.frameId === root.frameId) return {x: 0, y: 0, scaleX: 1, scaleY: 1};
        if (seen.has(a.frameId)) throw new Error('Frame ancestry changed. Inspect frames again.');
        seen.add(a.frameId);
        const frames = graph ?? await this.cdp.frames(a.tabId);
        const frame = frames.frames.find((f: any) => f.id === a.frameId);
        if (!frame?.parentId) throw new Error('Frame ancestry is unavailable. Inspect frames again.');
        const parentFrame = frames.frames.find((f: any) => f.id === frame.parentId);
        if (!parentFrame) throw new Error('Parent frame disappeared');
        const parent = parentFrame.id === root.frameId ? root : await this.world({tabId: a.tabId, sessionId: parentFrame.sessionId, frameId: parentFrame.id});
        // Measure each owner in its parent's viewport, then compose ancestors into root CSS pixels.
        const owner = await this.command(parent, 'DOM.getFrameOwner', {frameId: a.frameId});
        const object = await this.command(parent, 'DOM.resolveNode', {backendNodeId: owner.backendNodeId, executionContextId: parent.contextId});
        try {
            const result = await this.command(parent, 'Runtime.callFunctionOn', {objectId: object.object.objectId, returnByValue: true, arguments: [{value: point ?? null}],
                functionDeclaration: `function(point) {
                    if (point) this.scrollIntoView({block: 'nearest', inline: 'nearest', behavior: 'instant'});
                    const transform = getComputedStyle(this).transform;
                    if (transform !== 'none') { const m = new DOMMatrix(transform); if (m.b || m.c) throw new Error('Rotated/skewed iframe targeting is unsupported'); }
                    const b = this.getBoundingClientRect(), scaleX = b.width / this.offsetWidth, scaleY = b.height / this.offsetHeight;
                    const offset = {x: b.x + this.clientLeft * scaleX, y: b.y + this.clientTop * scaleY, scaleX, scaleY};
                    if (point) { const hit = document.elementFromPoint(offset.x + point.x * scaleX, offset.y + point.y * scaleY); if (hit !== this && !this.contains(hit)) throw new Error('Frame is occluded at the action point'); }
                    return offset;
                }`});
            if (!result.result?.value || result.exceptionDetails) throw new Error(result.exceptionDetails?.exception?.description ?? 'Frame offset could not be measured');
            const local = result.result.value;
            const outer = await this.frameOffset(parent, root, point ? {x: local.x + point.x * local.scaleX, y: local.y + point.y * local.scaleY} : undefined, frames, seen);
            return {x: outer.x + local.x * outer.scaleX, y: outer.y + local.y * outer.scaleY, scaleX: local.scaleX * outer.scaleX, scaleY: local.scaleY * outer.scaleY};
        } finally { await this.command(parent, 'Runtime.releaseObject', {objectId: object.object.objectId}); }
    }
    async screenshot(args: any): Promise<any> {
        return withFreshScreenshot(args.tabId, async () => {}, () => this.screenshotOnce(args), async wait => {
            const root = await this.world({tabId: args.tabId});
            const scope = args.sessionId || args.frameId || args.contextId ? await this.world(args) : root;
            const read = async (world: World) => {
                const result = await this.command(world, 'Runtime.evaluate', {
                    expression: `(${pageScreenshotState.toString()})(${JSON.stringify(wait)})`,
                    contextId: world.contextId, returnByValue: true, awaitPromise: true,
                });
                if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
                if (!result.result?.value?.key) throw new Error('Screenshot freshness could not be measured');
                return result.result.value;
            };
            const states = await Promise.all(scope.frameId === root.frameId ? [read(root)] : [read(root), read(scope)]);
            return {key: JSON.stringify(states.map(s => s.key)), settled: states.every(s => s.settled), visible: states.every(s => s.visible)};
        });
    }
    private async screenshotOnce(args: any): Promise<any> {
        const scope = await this.world(args), root = await this.world({tabId: args.tabId});
        const id = crypto.randomUUID();
        const metrics = await this.page(root, {action: 'metrics'});
        const localMetrics = await this.page(scope, {action: 'metrics'});
        const offset = await this.frameOffset(scope, root);
        let marks: any[] = [], candidateLimitReached = false;
        let clickHandlerCoverage: any;
        if (args.mode === 'marks') {
            const result = await this.page(scope, {action: 'marks', snapshotId: id, maxMarks: args.maxMarks});
            candidateLimitReached = result.candidateLimitReached;
            const localMarks = result.marks;
            // Extra discovery (click listeners, closed shadow roots) is a bonus, so it gets a time budget.
            const deadline = Date.now() + MARK_DISCOVERY_MS;
            if (localMarks.length < args.maxMarks) {
                const doc = await this.command(scope, 'Runtime.evaluate', {expression: 'document', contextId: scope.contextId, returnByValue: false});
                try {
                    const listeners = await this.command(scope, 'DOMDebugger.getEventListeners', {objectId: doc.result.objectId, depth: -1, pierce: true});
                    const ids = [...new Set<number>(listeners.listeners.filter((l: any) => ['click', 'mousedown', 'pointerdown'].includes(l.type) && l.backendNodeId).map((l: any) => l.backendNodeId))];
                    const added = await this.addMarks(scope, id, args.maxMarks, localMarks.length, ids.slice(0, 200), deadline);
                    localMarks.push(...added.marks);
                    if (added.full) candidateLimitReached = true;
                    clickHandlerCoverage = {backendCandidates: ids.length, inspected: added.inspected, truncated: ids.length > added.inspected};
                } catch (e) { clickHandlerCoverage = {unavailable: true, reason: String(e).slice(0, 200)}; }
                finally { if (doc.result?.objectId) await this.command(scope, 'Runtime.releaseObject', {objectId: doc.result.objectId}); }
            }
            if (localMarks.length < args.maxMarks && Date.now() < deadline) {
                const document = await this.command(scope, 'DOM.getFlattenedDocument', {depth: -1, pierce: true});
                const nodes = new Map<number, any>(document.nodes.map((n: any) => [n.nodeId, n]));
                const closed = document.nodes.filter((node: any) => {
                    if (!['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'CANVAS'].includes(node.nodeName)) return false;
                    for (let parent = nodes.get(node.parentId), depth = 0; parent && depth < 50; parent = nodes.get(parent.parentId), depth++) if (parent.shadowRootType === 'closed') return true;
                    return false;
                });
                const added = await this.addMarks(scope, id, args.maxMarks, localMarks.length, closed.slice(0, 200).map((node: any) => node.backendNodeId), deadline);
                localMarks.push(...added.marks);
                if (added.full || closed.length > 200) candidateLimitReached = true;
            }
            marks = localMarks.map((m: any) => ({...m, localCenter: m.center, center: {x: offset.x + m.center.x * offset.scaleX, y: offset.y + m.center.y * offset.scaleY},
                bbox: {x: offset.x + m.bbox.x * offset.scaleX, y: offset.y + m.bbox.y * offset.scaleY, width: m.bbox.width * offset.scaleX, height: m.bbox.height * offset.scaleY}}));
        }
        const visibleViewport: Box = {x: metrics.visualViewport?.offsetLeft ?? 0, y: metrics.visualViewport?.offsetTop ?? 0,
            width: metrics.visualViewport?.width ?? metrics.viewport.width, height: metrics.visualViewport?.height ?? metrics.viewport.height};
        let region: Box = {...visibleViewport};
        if (args.region) {
            const previous = args.snapshotId ? this.snapshots.get(args.snapshotId) : undefined;
            if (args.snapshotId && (!previous || previous.scope.tabId !== args.tabId || JSON.stringify(previous.metrics) !== JSON.stringify(localMetrics))) throw new Error('Grid snapshot changed. Capture a new grid first.');
            const size = previous?.gridSize ?? 100;
            if (typeof args.region === 'string') {
                const local = gridRegion(args.region, size, previous ? {width: previous.region.width, height: previous.region.height} : visibleViewport);
                region = {...local, x: local.x + (previous?.region.x ?? visibleViewport.x), y: local.y + (previous?.region.y ?? visibleViewport.y)};
            } else region = boundedRegion(args.region, metrics.viewport);
        }
        const clipped = boundedRegion({...region, x: region.x - visibleViewport.x, y: region.y - visibleViewport.y}, visibleViewport);
        region = {...clipped, x: clipped.x + visibleViewport.x, y: clipped.y + visibleViewport.y};
        const image = await this.command(root, 'Page.captureScreenshot', {format: 'png', fromSurface: true, captureBeyondViewport: false});
        const bitmap = await createImageBitmap(await (await fetch('data:image/png;base64,' + image.data)).blob());
        try {
            const sx = bitmap.width / visibleViewport.width, sy = bitmap.height / visibleViewport.height;
            if (args.mode === 'contours') {
                const detector = new OffscreenCanvas(Math.min(800, bitmap.width), Math.max(1, Math.round(bitmap.height * Math.min(800, bitmap.width) / bitmap.width)));
                const ctx = detector.getContext('2d')!; ctx.drawImage(bitmap, 0, 0, detector.width, detector.height);
                const boxes = detectContours(ctx.getImageData(0, 0, detector.width, detector.height).data, detector.width, detector.height, args.maxMarks);
                marks = boxes.map((box, i) => {
                    const bbox = {x: visibleViewport.x + box.x * visibleViewport.width / detector.width, y: visibleViewport.y + box.y * visibleViewport.height / detector.height, width: box.width * visibleViewport.width / detector.width, height: box.height * visibleViewport.height / detector.height};
                    const center = {x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2};
                    return {id: i + 1, selector: null, role: 'unknown', name: `Visual candidate ${i + 1}`, bbox, center, localCenter: center, source: 'contour', hitTest: false};
                });
                if (scope.frameId !== root.frameId) throw new Error('Contour detection operates on the root viewport. Omit frame targeting.');
            }
            const width = Math.max(1, Math.round(region.width * sx * args.scale)), height = Math.max(1, Math.round(region.height * sy * args.scale));
            if (width * height > 16000000) throw new Error('Screenshot exceeds 16 million pixels. Choose a smaller region or scale.');
            const canvas = new OffscreenCanvas(width, height), ctx = canvas.getContext('2d')!;
            ctx.drawImage(bitmap, (region.x - visibleViewport.x) * sx, (region.y - visibleViewport.y) * sy, region.width * sx, region.height * sy, 0, 0, width, height);
            ctx.scale(width / region.width, height / region.height); ctx.translate(-region.x, -region.y);
            const fontSize = Math.max(10, 14 / args.scale); ctx.font = `bold ${fontSize}px sans-serif`; ctx.lineWidth = 1;
            marks = marks.filter(m => m.center.x >= region.x && m.center.y >= region.y && m.center.x < region.x + region.width && m.center.y < region.y + region.height);
            for (const mark of marks) {
                const b = mark.bbox; ctx.strokeStyle = '#ef4444'; ctx.strokeRect(b.x, b.y, b.width, b.height);
                const label = String(mark.id), labelWidth = Math.max(20, ctx.measureText(label).width + 8);
                ctx.fillStyle = '#dc2626'; ctx.fillRect(Math.max(region.x, b.x), Math.max(region.y, b.y), labelWidth, fontSize + 6);
                ctx.fillStyle = '#ffffff'; ctx.fillText(label, Math.max(region.x, b.x) + 4, Math.max(region.y, b.y) + fontSize + 1);
            }
            const cells: any[] = [];
            if (args.mode === 'grid') {
                const size = args.gridSize;
                if (Math.ceil(region.width / size) * Math.ceil(region.height / size) > 1000) throw new Error('Grid is too dense. Crop a region before using a fine grid.');
                for (let row = 0; row * size < region.height; row++) for (let col = 0; col * size < region.width; col++) {
                    const cell = {label: columnLabel(col) + (row + 1), x: region.x + col * size, y: region.y + row * size, width: Math.min(size, region.width - col * size), height: Math.min(size, region.height - row * size)};
                    cells.push(cell); ctx.strokeStyle = '#00c9ff'; ctx.strokeRect(cell.x, cell.y, cell.width, cell.height);
                    ctx.fillStyle = '#000000bb'; ctx.fillRect(cell.x + 1, cell.y + 1, 72 / args.scale, 32 / args.scale);
                    ctx.fillStyle = '#ffffff'; ctx.fillText(cell.label, cell.x + 3, cell.y + fontSize + 2);
                    ctx.font = `${Math.max(7, 10 / args.scale)}px sans-serif`; ctx.fillText(`${cell.x},${cell.y}`, cell.x + 3, cell.y + fontSize + 13 / args.scale); ctx.font = `bold ${fontSize}px sans-serif`;
                }
            }
            if (args.crosshair) {
                const p = args.crosshair; ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2 / args.scale; ctx.beginPath(); ctx.moveTo(p.x - 12, p.y); ctx.lineTo(p.x + 12, p.y); ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x, p.y + 12); ctx.stroke();
                ctx.fillStyle = '#000'; ctx.fillRect(p.x + 14, p.y - 14, 110, 20); ctx.fillStyle = '#fff'; ctx.fillText(`${p.x}, ${p.y} CSS px`, p.x + 16, p.y);
            }
            const blob = await canvas.convertToBlob({type: 'image/png'});
            const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = '';
            for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            this.snapshots.set(id, {id, timestamp: Date.now(), scope, metrics: localMetrics, marks, region, gridSize: args.gridSize});
            while (this.snapshots.size > 10) this.snapshots.delete(this.snapshots.keys().next().value!);
            return {screenshot: 'data:image/png;base64,' + btoa(binary), snapshotId: id, legend: marks, cells: cells.slice(0, 100), cellCount: cells.length, cellsTruncated: cells.length > 100, candidateLimitReached, clickHandlerCoverage,
                metadata: {...metrics, coordinateSpace: 'root viewport CSS pixels', frameId: scope.frameId, sessionId: scope.sessionId, frameOffset: offset,
                    sourcePixels: {width: bitmap.width, height: bitmap.height}, sourceCSSRegion: visibleViewport, imagePixels: {width, height}, cssRegion: region, devicePixelsPerCSSPixel: {x: sx, y: sy},
                    imagePixelsPerCSSPixel: {x: width / region.width, y: height / region.height}, gridSize: args.mode === 'grid' ? args.gridSize : undefined, scale: args.scale},
                ...(args.mode === 'contours' ? {detection: {method: 'edge-contours', semanticRecognition: false, ocr: false, hint: 'Candidates are unverified image shapes. Inspect the screenshot before acting.'}} : {})};
        } finally { bitmap.close(); }
    }
    async gesture(args: any): Promise<any> {
        const snapshot = args.target?.mark ? this.snapshots.get(args.target.snapshotId) : undefined;
        const a = await this.world(snapshot && !args.frameId && !args.contextId && !args.sessionId ? {...args, frameId: snapshot.scope.frameId, sessionId: snapshot.scope.sessionId} : args), id = crypto.randomUUID();
        const root = a.sessionId || args.frameId || args.contextId || snapshot ? await this.world({tabId: args.tabId}) : a;
        const send = (method: string, params: any) => this.command({tabId: args.tabId}, method, params);
        const resolve = async (target: any, edge?: string) => {
            const local = await this.resolve(a, target, edge);
            const offset = await this.frameOffset(a, root, local.point);
            return {...local, localPoint: local.point, point: {x: offset.x + local.point.x * offset.scaleX, y: offset.y + local.point.y * offset.scaleY}, frameOffset: offset};
        };
        const pause = async (ms: number) => { if (ms) await new Promise(resolve => setTimeout(resolve, ms)); };
        const beforeURL = (await chrome.tabs.get(args.tabId)).url;
        const eventCursor = this.cdp.read(args.tabId).cursor;
        const before = await this.page(a, {action: 'observeStart', id});
        let resolved: any, feedback: any;
        await this.lockInput(args.tabId, true, args.baseline !== false);
        const click = async (target: any) => {
            resolved = await resolve(target);
            await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...resolved.point});
            // Hover can open a menu or move a target; the element found first is checked again directly.
            resolved = await resolve(resolved.backendNodeId ? {...target, backendNodeId: resolved.backendNodeId} : target);
            await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...resolved.point});
            for (let count = 1; count <= args.clickCount; count++) {
                await send('Input.dispatchMouseEvent', {type: 'mousePressed', ...resolved.point, button: args.button, buttons: args.button === 'left' ? 1 : args.button === 'right' ? 2 : 4, clickCount: count});
                await send('Input.dispatchMouseEvent', {type: 'mouseReleased', ...resolved.point, button: args.button, buttons: 0, clickCount: count});
            }
        };
        try {
            if (args.action === 'click') await click(args.target);
            if (args.action === 'hover') { resolved = await resolve(args.target); await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...resolved.point}); await pause(args.duration); }
            if (args.action === 'scroll') {
                const metrics = await this.page(a, {action: 'metrics'});
                resolved = await resolve(args.target ?? {x: metrics.viewport.width / 2, y: metrics.viewport.height / 2});
                const steps = args.smooth ? args.steps : 1;
                for (let i = 0; i < steps; i++) { await send('Input.dispatchMouseEvent', {type: 'mouseWheel', ...resolved.point, deltaX: args.deltaX / steps, deltaY: args.deltaY / steps}); await pause(args.smooth ? args.duration / steps : 0); }
            }
            if (args.action === 'type') {
                if (args.text === undefined) throw new Error('text is required');
                if (args.target) await click(args.target);
                if (args.perKeyDelay) {
                    if ([...args.text].length * args.perKeyDelay > 30000) throw new Error('Typing duration exceeds 30 seconds; shorten the text or perKeyDelay');
                    for (const character of args.text) { await send('Input.insertText', {text: character}); await pause(args.perKeyDelay); }
                } else await send('Input.insertText', {text: args.text});
            }
            if (args.action === 'press') {
                if (!args.chord) throw new Error('chord is required');
                if (args.target) await click(args.target);
                const chord = parseChord(args.chord); let mask = 0;
                const held: any[] = []; let mainDown = false;
                try {
                    for (const modifier of chord.modifiers) { mask |= modifier.mask; held.push(modifier); await send('Input.dispatchKeyEvent', {type: 'keyDown', key: modifier.key, code: modifier.code, windowsVirtualKeyCode: modifier.keyCode, modifiers: mask}); }
                    mainDown = true;
                    await send('Input.dispatchKeyEvent', {type: 'keyDown', key: chord.key, code: chord.code, windowsVirtualKeyCode: chord.keyCode, modifiers: chord.mask});
                    await send('Input.dispatchKeyEvent', {type: 'keyUp', key: chord.key, code: chord.code, windowsVirtualKeyCode: chord.keyCode, modifiers: chord.mask}); mainDown = false;
                    while (held.length) { const modifier = held.at(-1); mask &= ~modifier.mask; await send('Input.dispatchKeyEvent', {type: 'keyUp', key: modifier.key, code: modifier.code, windowsVirtualKeyCode: modifier.keyCode, modifiers: mask}); held.pop(); }
                } finally {
                    if (mainDown) await this.release(args.tabId, 'Input.dispatchKeyEvent', {type: 'keyUp', key: chord.key, code: chord.code, windowsVirtualKeyCode: chord.keyCode, modifiers: 0});
                    for (const modifier of held.reverse()) await this.release(args.tabId, 'Input.dispatchKeyEvent', {type: 'keyUp', key: modifier.key, code: modifier.code, windowsVirtualKeyCode: modifier.keyCode, modifiers: 0});
                }
            }
            if (args.action === 'drag' || args.action === 'selectRange') {
                await resolve(args.from, args.action === 'selectRange' ? 'start' : undefined);
                await resolve(args.to, args.action === 'selectRange' ? 'end' : undefined);
                // Resolve from once more because resolving a distant destination can scroll the viewport.
                const start = await resolve(args.from, args.action === 'selectRange' ? 'start' : undefined);
                const end = await resolve(args.to, args.action === 'selectRange' ? 'end' : undefined);
                if (JSON.stringify(start.metrics.scroll) !== JSON.stringify(end.metrics.scroll)) throw new Error('Gesture endpoints cannot both fit in the viewport. Scroll them into view first.');
                resolved = {from: start, to: end};
                if (args.action === 'drag') await send('Input.setInterceptDrags', {enabled: true});
                const cursor = this.cdp.read(args.tabId).cursor;
                try {
                    await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...start.point});
                    await send('Input.dispatchMouseEvent', {type: 'mousePressed', ...start.point, button: 'left', buttons: 1, clickCount: 1});
                    for (const point of gesturePath(start.point, end.point, args.steps, args.humanize)) { await send('Input.dispatchMouseEvent', {type: 'mouseMoved', ...point, button: 'left', buttons: 1}); await pause(args.duration / args.steps); }
                    const drag = this.cdp.read(args.tabId, cursor).events.find(e => e.method === 'Input.dragIntercepted' && !e.sessionId);
                    if (drag) for (const type of ['dragEnter', 'dragOver', 'drop']) await send('Input.dispatchDragEvent', {type, ...end.point, data: drag.params.data});
                } finally {
                    await this.release(args.tabId, 'Input.dispatchMouseEvent', {type: 'mouseReleased', ...end.point, button: 'left', buttons: 0, clickCount: 1});
                    if (args.action === 'drag') await this.release(args.tabId, 'Input.setInterceptDrags', {enabled: false});
                }
            }
            if (args.action === 'pinch' || args.action === 'rotate') {
                resolved = await resolve(args.target);
                const pointAt = (radius: number, angle: number, id: number) => ({x: resolved.point.x + Math.cos(angle) * radius, y: resolved.point.y + Math.sin(angle) * radius, id});
                const viewport = (await this.page(root, {action: 'metrics'})).viewport;
                const room = Math.min(resolved.point.x, resolved.point.y, viewport.width - resolved.point.x, viewport.height - resolved.point.y);
                const startRadius = Math.min(30, room / (args.action === 'pinch' ? Math.max(1, args.factor) : 1) - 1);
                if (startRadius < 2) throw new Error('Touch target is too close to the viewport edge');
                await send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [pointAt(startRadius, 0, 0), pointAt(startRadius, Math.PI, 1)]});
                try {
                    for (let i = 1; i <= args.steps; i++) {
                        const progress = i / args.steps, radius = args.action === 'pinch' ? startRadius * (1 + (args.factor - 1) * progress) : startRadius;
                        const angle = args.action === 'rotate' ? args.angle * Math.PI / 180 * progress : 0;
                        await send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [pointAt(radius, angle, 0), pointAt(radius, angle + Math.PI, 1)]}); await pause(args.duration / args.steps);
                    }
                } finally { await this.release(args.tabId, 'Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}); }
            }
            await this.settle(a, id, args.feedbackMs);
        } finally {
            await this.lockInput(args.tabId, false);
            try { feedback = await this.page(a, {action: 'observeEnd', id}); }
            catch { feedback = {observationLost: true, before}; }
        }
        const afterURL = await chrome.tabs.get(args.tabId).then(tab => tab.url, () => null);
        const changes = afterURL === null || args.reportChanges === false ? undefined : await pageChanges(args.tabId);
        const dialogs = afterURL === null ? [] : this.cdp.read(args.tabId, eventCursor).events.filter(e => e.method === 'Page.javascriptDialogOpening').slice(-5);
        const actualHit = [...(feedback.events ?? [])].reverse().find((e: any) => e.type === 'mousedown')?.hit;
        const expectedTarget = resolved?.target;
        const output: any = {ok: true, action: args.action, resolved, feedback: {...feedback, actualHit, expectedTarget,
            targetMatched: expectedTarget?.name && actualHit?.name ? expectedTarget.name === actualHit.name : null,
            tabURL: {before: beforeURL, after: afterURL}, urlChanged: beforeURL !== afterURL || feedback.urlChanged, javascriptDialogs: dialogs}, ...(changes ? {changes} : {})};
        if (args.postScreenshot && resolved?.point && afterURL !== null) {
            const p = resolved.point;
            output.postAction = await this.screenshot({tabId: args.tabId, mode: 'plain', region: {x: Math.max(0, p.x - 100), y: Math.max(0, p.y - 75), width: 200, height: 150}, scale: 1, gridSize: 100});
            output.screenshot = output.postAction.screenshot; delete output.postAction.screenshot;
        }
        return output;
    }
    /**
     * Pause the user's site input while the agent's own input is in flight; decoration only.
     * Locking also records the page as it was, for the changes report after the action.
     */
    private lockInput(tabId: number, locked: boolean, baseline = locked) {
        return runPageGuidance(tabId, {action: 'agentLock', locked, baseline: locked && baseline}).catch(() => {});
    }
    /**
     * Waits for the action's effects: until the page has changed and then gone quiet, or for at
     * most `maxMs` when nothing changes (the old fixed wait). A navigation ends the wait early.
     */
    private async settle(a: World, id: string, maxMs: number) {
        if (!maxMs) return;
        try { await this.page(a, {action: 'settle', id, maxMs, quietMs: SETTLE_QUIET_MS}); }
        catch { /* The document went away: there is nothing left to wait for here. */ }
    }
    async observeRaw(args: any, perform: () => Promise<any>) {
        const root = await this.world({tabId: args.tabId}), id = crypto.randomUUID();
        const beforeURL = (await chrome.tabs.get(args.tabId)).url;
        const metadata = await this.page(root, {action: 'metrics'});
        await this.page(root, {action: 'observeStart', id});
        let feedback: any, result: any;
        await this.lockInput(args.tabId, true);
        try { result = await perform(); await this.settle(root, id, args.feedbackMs); }
        finally { await this.lockInput(args.tabId, false); try { feedback = await this.page(root, {action: 'observeEnd', id}); } catch { feedback = {observationLost: true}; } }
        const afterURL = (await chrome.tabs.get(args.tabId)).url;
        return {...result, metadata: {...metadata, coordinateSpace: 'root viewport CSS pixels'}, feedback: {...feedback, tabURL: {before: beforeURL, after: afterURL}, urlChanged: beforeURL !== afterURL || feedback.urlChanged}};
    }
}
