import {runPageGuidance} from './pageGuidance';
type Session = chrome.debugger.DebuggerSession;
type Event = {sequence: number; sessionId?: string; method: string; params: any; timestamp: number};
const AUTO_ATTACH = {autoAttach: true, waitForDebuggerOnStart: false, flatten: true, filter: [{type: 'iframe', exclude: false}]};

/** One owner per tab. Child sessions allow access to out-of-process frames. */
export class CDPManager {
    private panelClosed=false;
    setPanelClosed(closed: boolean) {this.panelClosed=closed;}
    private tabs = new Map<number, {events: Event[]; sequence: number; children: Map<string, any>; contexts: Map<string, any>; dropped: number;
        held: {keys: Map<string, any>; mouse: Map<string, any>; touch: boolean}}>();
    private attaching = new Map<number, Promise<void>>();
    constructor() {
        chrome.debugger.onEvent.addListener((source, method, params) => { void this.event(source, method, params); });
        chrome.debugger.onDetach.addListener(source => {
            if (source.tabId !== undefined) this.tabs.delete(source.tabId);
        });
    }
    private async event(source: Session, method: string, params: any) {
        const state = this.tabs.get(source.tabId!);
        if (!state) return;
        if (method === 'Target.attachedToTarget') {
            const session = {...source, sessionId: params.sessionId};
            state.children.set(params.sessionId, params.targetInfo);
            try { await this.enable(session); }
            catch (error) { state.children.set(params.sessionId, {...params.targetInfo, error: String(error)}); }
        }
        if (method === 'Target.detachedFromTarget') {
            state.children.delete(params.sessionId);
            for (const [key, context] of state.contexts) if (context.sessionId === params.sessionId) state.contexts.delete(key);
        }
        if (method === 'Runtime.executionContextCreated') state.contexts.set(`${source.sessionId ?? ''}:${params.context.id}`, {...params.context, sessionId: source.sessionId});
        if (method === 'Runtime.executionContextDestroyed') state.contexts.delete(`${source.sessionId ?? ''}:${params.executionContextId}`);
        if (method === 'Runtime.executionContextsCleared') {
            for (const [key, context] of state.contexts) if (context.sessionId === source.sessionId) state.contexts.delete(key);
        }
        if (/^(Network\.|Input.dragIntercepted|Page.javascriptDialogOpening|Runtime.consoleAPICalled|Runtime.exceptionThrown|Log.entryAdded)/.test(method)) {
            // Bound both count and bytes; retain metadata and mark oversized payloads.
            const json = JSON.stringify(params);
            const bounded = json.length > 24000 ? {requestId: params.requestId, truncated: true, preview: json.slice(0, 24000)} : params;
            state.events.push({sequence: ++state.sequence, sessionId: source.sessionId, method, params: bounded, timestamp: Date.now()});
            if (state.events.length > 500) { state.events.shift(); state.dropped++; }
        }
    }
    private async send(target: Session, method: string, params = {}): Promise<any> {
        if(this.panelClosed && method.startsWith('Input.')) throw new Error('Tampersloth panel closed');
        this.trackInput(target.tabId!, method, params);
        if (/^Input\.(dispatchMouseEvent|dispatchTouchEvent|dispatchKeyEvent|insertText|dispatchDragEvent)$/.test(method)) {
            // Decoration must never prevent real input on a restricted or navigating page.
            await this.announce(target.tabId!, method, params);
        }
        return chrome.debugger.sendCommand(target, method, params);
    }
    // The page lets announced agent input through its gesture lock and blocks everything else.
    private announce(tabId: number, method: string, p: any) {
        return runPageGuidance(tabId, {action:'cursor', method, params:{type:p.type,x:p.x,y:p.y,buttons:p.buttons,key:p.key,code:p.code,
            touchPoints:p.touchPoints?.map((point:any)=>({x:point.x,y:point.y}))}}).catch(() => {});
    }
    private trackInput(tabId: number, method: string, params: any) {
        const held = this.tabs.get(tabId)?.held;
        if (!held) return;
        if (method === 'Input.dispatchKeyEvent') {
            const key = params.code || params.key;
            if (params.type === 'keyDown' || params.type === 'rawKeyDown') held.keys.set(key, params);
            if (params.type === 'keyUp') held.keys.delete(key);
        }
        if (method === 'Input.dispatchMouseEvent') {
            if (params.type === 'mousePressed') held.mouse.set(params.button, params);
            if (params.type === 'mouseReleased') held.mouse.delete(params.button);
            if (params.type === 'mouseMoved') for (const [button, pressed] of held.mouse) held.mouse.set(button, {...pressed, x: params.x, y: params.y});
        }
        if (method === 'Input.dispatchTouchEvent') held.touch = params.type !== 'touchEnd' && params.type !== 'touchCancel';
    }
    async release(tabId: number, method: string, params: any, announce = true) {
        const allowed = method === 'Input.dispatchKeyEvent' && params.type === 'keyUp' || method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased'
            || method === 'Input.dispatchTouchEvent' && ['touchEnd', 'touchCancel'].includes(params.type) || method === 'Input.setInterceptDrags' && params.enabled === false;
        if (!allowed) throw new Error('Only held-input cleanup is allowed');
        if (!this.tabs.has(tabId)) return;
        this.trackInput(tabId, method, params);
        // Cleanup after the overlay is disposed must not recreate it.
        if (announce && !this.panelClosed && method !== 'Input.setInterceptDrags') await this.announce(tabId, method, params);
        await chrome.debugger.sendCommand({tabId}, method, params).catch(() => {});
    }
    private async enable(target: Session) {
        await this.send(target, 'Runtime.enable');
        await this.send(target, 'Network.enable', {maxTotalBufferSize: 5000000, maxResourceBufferSize: 1000000, maxPostDataSize: 24000});
        await this.send(target, 'Log.enable');
        await this.send(target, 'Page.enable');
        await this.send(target, 'DOM.enable');
        await this.send(target, 'Target.setAutoAttach', AUTO_ATTACH);
    }
    async attach(tabId: number) {
        if(this.panelClosed) throw new Error('Tampersloth panel closed');
        const pending = this.attaching.get(tabId);
        if (pending) return pending;
        if (this.tabs.has(tabId)) return;
        const task = (async () => {
            await chrome.debugger.attach({tabId}, '1.3');
            this.tabs.set(tabId, {events: [], sequence: 0, children: new Map(), contexts: new Map(), dropped: 0, held: {keys: new Map(), mouse: new Map(), touch: false}});
            try { await this.enable({tabId}); }
            catch (error) { await this.detach(tabId); throw error; }
        })();
        this.attaching.set(tabId, task);
        try { await task; } finally { this.attaching.delete(tabId); }
    }
    async command(tabId: number, method: string, params = {}, sessionId?: string) {
        await this.attach(tabId);
        if (sessionId && !this.tabs.get(tabId)?.children.has(sessionId)) throw new Error('Unknown or detached frame session. Read frames again.');
        return this.send({tabId, ...(sessionId ? {sessionId} : {})}, method, params);
    }
    async frames(tabId: number) {
        const tree = await this.command(tabId, 'Page.getFrameTree');
        const state = this.tabs.get(tabId)!;
        const records = new Map<string, any>();
        const visit = (node: any, sessionId?: string, parentId?: string) => {
            const previous = records.get(node.frame.id);
            records.set(node.frame.id, {...previous, ...node.frame, parentId: node.frame.parentId ?? parentId ?? previous?.parentId, sessionId});
            for (const child of node.childFrames ?? []) visit(child, sessionId, node.frame.id);
        };
        visit(tree.frameTree);
        const children = await Promise.all([...state.children.keys()].map(async sessionId => {
            try { return {sessionId, tree: await this.command(tabId, 'Page.getFrameTree', {}, sessionId)}; }
            catch { return null; }
        }));
        for (const child of children) if (child) visit(child.tree.frameTree, child.sessionId);
        return {...tree, frames: [...records.values()], sessions: [...state.children].map(([sessionId, target]) => ({sessionId, ...target})), contexts: [...state.contexts.values()]};
    }
    read(tabId: number, after = 0, filter = '', clear = false) {
        const state = this.tabs.get(tabId);
        if (!state) throw new Error('Start capture before reading events.');
        const events = state.events.filter(e => e.sequence > after && JSON.stringify(e).includes(filter));
        const result = {events, cursor: state.sequence, dropped: state.dropped};
        if (clear) state.events = [];
        return result;
    }
    request(tabId: number, requestId: string, sessionId?: string) {
        const state = this.tabs.get(tabId);
        const event = [...(state?.events ?? [])].reverse().find(e => e.method === 'Network.requestWillBeSent' && e.params.requestId === requestId && e.sessionId === sessionId);
        if (!event?.params.request) throw new Error('Captured request unavailable. Start capture first, or provide explicit replay parameters.');
        if (event.params.truncated) throw new Error('Captured request was truncated. Provide explicit replay parameters.');
        return event.params.request;
    }
    async detach(tabId: number) {
        if (!this.tabs.has(tabId)) return;
        const held = this.tabs.get(tabId)!.held;
        for (const key of [...held.keys.values()].reverse()) await this.release(tabId, 'Input.dispatchKeyEvent', {...key, type: 'keyUp', modifiers: 0}, false);
        for (const mouse of [...held.mouse.values()]) await this.release(tabId, 'Input.dispatchMouseEvent', {...mouse, type: 'mouseReleased', buttons: 0}, false);
        if (held.touch) await this.release(tabId, 'Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []}, false);
        this.tabs.delete(tabId);
        await chrome.debugger.detach({tabId}).catch(() => {});
    }
    status() { return [...this.tabs.keys()]; }
}
