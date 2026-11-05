import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoader} from './load-ts.mjs';

function fixture({animate=false,measurable=true,chrome}={}) {
    const listeners = new Map(), timers = new Map(), intervals = new Map(); let sequence=0;
    const frames=new Map(),windowListeners=new Map();
    class Element {
        constructor(tag='div') {this.tagName=tag;this.style={};this.attrs={};this.children=[];this.box={x:80,y:100,width:120,height:35};this.offsetWidth=150;this.offsetHeight=30;this.textContent='';}
        append(...items) {for(const item of items) {if(typeof item==='object') item.parent=this;this.children.push(item);}}
        replaceChildren(...items) {this.children=[];this.append(...items);}
        setAttribute(k,v) {this.attrs[k]=v;}
        getAttribute(k) {return this.attrs[k];}
        getBoundingClientRect() {return {...this.box,right:this.box.x+this.box.width,top:this.box.y};}
        attachShadow() {this.shadow=new Element('shadow');return this.shadow;}
        querySelector(selector) {if(selector==='svg'){this.icon ??=new Element('svg');return this.icon;}return this.tag=new Element('span');}
        remove() {this.removed=true;if(this.parent) this.parent.children=this.parent.children.filter(x=>x!==this);}
        scrollIntoView() {}
        addEventListener(type,fn) {(this.listeners ??= {})[type]=fn;}
    }
    const target=new Element('button'), expected=new Element('div'), elements=new Map([['#target',target]]);
    const document={documentElement:new Element('html'),activeElement:target,
        createElement:tag=>new Element(tag),createElementNS:(_,tag)=>{const el=new Element(tag);if(animate && tag==='path'){el.getTotalLength=()=>measurable && el.parent ? 200 : 0;el.getPointAtLength=n=>({x:n,y:0});}return el;},createTextNode:text=>({textContent:text}),
        querySelectorAll:selector=>selector==='*' ? [...elements.values()] : elements.has(selector) ? [elements.get(selector)] : [],
        addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
        removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),
    };
    const window={addEventListener(type,fn){if(!windowListeners.has(type)) windowListeners.set(type,new Set());windowListeners.get(type).add(fn);},removeEventListener(type,fn){windowListeners.get(type)?.delete(fn);}};
    const storage=new Map(),sessionStorage={getItem:k=>storage.get(k) ?? null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
    const load=createLoader({globals:{...(chrome ? {chrome} : {}),document,window,sessionStorage,location:{href:'https://example.com'},innerWidth:800,innerHeight:600,
        getComputedStyle:()=>({visibility:'visible'}),matchMedia:()=>({matches:!animate}),
        requestAnimationFrame:fn=>{if(!animate){fn();return 0;}const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
        MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},
        setTimeout:(fn,ms)=>{const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
        setInterval:fn=>{const id=++sequence;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id),
    }});
    const run=load('src/background/pageGuidance.ts').pageGuidance;
    const fire=(type,hit=target,isTrusted=true,extra={})=>{
        const event={type,isTrusted,composedPath:()=>[hit],defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};
        for(const fn of [...(windowListeners.get(type)??[])]){fn(event);if(event.stopped) return event;}
        for(const fn of [...(listeners.get(type)??[])]){fn(event);if(event.stopped) break;}
        return event;
    };
    return {run,window,document,target,expected,elements,listeners,timers,intervals,frames,fire};
}

function timedToolFixture(poll, start={status:'waiting',ready:true}) {
    let elapsed=0;const calls=[];
    const chrome={runtime:{sendMessage:async msg=>{
        calls.push(msg);
        if(msg.operation==='guidance' && msg.input.action==='start') return start;
        if(msg.operation==='guidance' && msg.input.action==='poll') return poll(elapsed);
        if(msg.operation==='accessibility') return {nodes:[]};
        if(msg.operation==='perception') return {screenshot:'data:image/png;base64,aW1hZ2U='};
        return {ok:true};
    }},tabs:{get:async()=>({url:'https://example.com',title:'Page'})}};
    const load=createLoader({globals:{chrome,Date:class extends Date {static now(){return elapsed;}},
        setTimeout:(fn,ms)=>{elapsed+=ms;queueMicrotask(fn);return 0;}}});
    const tool=load('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{}).waitForUserAction;
    return {tool,calls,elapsed:()=>elapsed,run:input=>tool.execute(tool.inputSchema.parse(input),{abortSignal:new AbortController().signal})};
}

test('annotations follow target geometry, keep text safe and never intercept page input',()=>{
    const f=fixture();
    f.run({action:'draw',kind:'highlight',selector:'#target',id:'a',label:'<button>Not HTML</button>'});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('a');
    assert.match(state.host.style.cssText,/pointer-events:none/);
    assert.equal(mark.label.textContent,'<button>Not HTML</button>');
    assert.equal(mark.group.attrs.transform,'translate(80,100)');
    f.target.box.x=240;state.render();assert.equal(mark.group.attrs.transform,'translate(240,100)');
    f.elements.delete('#target');state.render();assert.equal(mark.group.style.display,'none');
    f.run({action:'remove',id:'a'});assert.equal(state.marks.size,0);
});

test('guide strokes are clean, stable across renders, and highlights are a translucent wash',()=>{
    const f=fixture();
    for(const kind of ['rectangle','ellipse','bracket','arrow','highlight','freehand']) {
        f.run({action:'draw',id:kind,kind,selector:'#target',points:[{x:80,y:100},{x:140,y:120},{x:190,y:110}],lineStyle:'dashed'});
        const state=f.window.__tamperSlothGuidance,mark=state.marks.get(kind),path=mark.shape.attrs.d;
        assert.ok(path.length);assert.doesNotMatch(path,/NaN|Infinity/);
        // No hand-drawn wobble: edges are straight lines, rounded corners or true arcs.
        assert.doesNotMatch(path,/C/);
        assert.equal(mark.shape.attrs['stroke-dasharray'],'6 5');
        assert.equal(mark.echo.style.display,'none');
        state.render();assert.equal(mark.shape.attrs.d,path);
        f.target.box.x+=30;state.render();assert.equal(mark.shape.attrs.d,path);
        if(kind==='rectangle' || kind==='highlight') assert.match(path,/ Q/,'boxes have rounded corners');
        if(kind==='highlight') {
            assert.equal(mark.fill.attrs.d,path);assert.equal(mark.fill.attrs['fill-opacity'],'.16');assert.equal(mark.fill.attrs.stroke,'none');
        } else {
            assert.equal(mark.fill,undefined);
        }
    }
});

test('wrapped tips and unsafe explicit positions never cover marked controls',()=>{
    const f=fixture();
    f.target.box={x:125,y:82,width:30,height:30};
    f.run({action:'draw',id:'tip',kind:'bracket',selector:'#target',label:'Click the black swatch',labelPosition:{x:125,y:82}});
    const state=f.window.__tamperSlothGuidance,label=state.cursorTag;
    label.offsetWidth=260;label.offsetHeight=104;
    const overlaps=()=>{
        const x=state.cursorPoint.x+parseFloat(label.style.left),y=state.cursorPoint.y+parseFloat(label.style.top),b=f.target.box;
        return x<b.x+b.width && x+label.offsetWidth>b.x && y<b.y+b.height && y+label.offsetHeight>b.y;
    };
    state.render();assert.equal(overlaps(),false);assert.equal(label.style.visibility,'visible');
    f.target.box={x:780,y:560,width:20,height:35};state.render();assert.equal(overlaps(),false);
    assert.ok(state.cursorPoint.x+parseFloat(label.style.left)+label.offsetWidth<=788);
    assert.ok(state.cursorPoint.y+parseFloat(label.style.top)+label.offsetHeight<=588);
});

test('tips stay brief, retain accessible text, and hide if every position obscures a target',()=>{
    const f=fixture(),text='Step 6: Click the first option, Hachure, in the Fill panel. If the color picker is still open, close it first by clicking an empty part of the panel.';
    f.run({action:'draw',id:'tip',kind:'bracket',selector:'#target',label:text});
    const state=f.window.__tamperSlothGuidance,label=state.marks.get('tip').label;
    assert.ok(label.textContent.length<=90);assert.equal(label.textContent.startsWith('Step'),false);
    assert.equal(label.attrs['aria-label'],text);
    f.target.box={x:0,y:0,width:800,height:600};state.render();assert.equal(state.cursorTag.style.visibility,'hidden');
});

test('toolbar tips remain beside their target even when a distant position is requested',()=>{
    const f=fixture();f.target.box={x:550,y:35,width:30,height:30};
    f.run({action:'draw',id:'toolbar',kind:'bracket',selector:'#target',label:'Click the Rectangle tool',labelPosition:{x:12,y:12}});
    const state=f.window.__tamperSlothGuidance,label=state.cursorTag;
    assert.ok(state.cursorPoint.x+parseFloat(label.style.left)>=384);
    assert.ok(state.cursorPoint.y+parseFloat(label.style.top)<100);
    assert.equal(label.style.visibility,'visible');
});

test('guidance keeps status announcements accessible without showing a waiting popup',()=>{
    const f=fixture();
    f.run({action:'start',id:'step',selector:'#target',event:'click',instruction:'Click Continue',expectedSelector:'#expected',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.status.className,'sr-status');assert.equal(state.status.attrs['aria-live'],'polite');
    assert.equal(state.marks.get('__step').label.textContent,'Click Continue');
    f.fire('click',f.expected);state.render();assert.equal(state.status.style.left,undefined);
    f.fire('click');assert.equal(state.status.className,'sr-status');
    f.run({action:'cancel',id:'step'});assert.equal(state.status.className,'sr-status');
});

test('a verified completion condition skips a finished step before resolving a stale action target',()=>{
    const f=fixture();f.expected.attrs['aria-pressed']='true';f.elements.set('#expected',f.expected);
    const result=f.run({action:'start',id:'resume',selector:'#removed-button',event:'click',instruction:'Select Rectangle',completion:{selector:'#expected',state:'pressed'},timeoutMs:1000});
    assert.equal(result.status,'completed');assert.equal(result.alreadySatisfied,true);
    assert.equal(f.window.__tamperSlothGuidance.marks.size,0);assert.equal(f.intervals.size,0);
});

test('an unfinished completion condition still waits and verifies live state after action',()=>{
    const f=fixture();f.elements.set('#expected',f.expected);
    f.run({action:'start',id:'resume',selector:'#target',event:'click',instruction:'Select Rectangle',completion:{selector:'#expected',state:'pressed'},timeoutMs:1000});
    f.fire('click');assert.equal(f.run({action:'poll',id:'resume'}).status,'waiting');
    f.expected.attrs['aria-pressed']='true';for(const fn of f.intervals.values())fn();
    assert.equal(f.run({action:'poll',id:'resume'}).status,'completed');
});

test('a live completion condition finishes the step even when its action event was missed',()=>{
    const f=fixture();f.elements.set('#expected',f.expected);
    const completion={selector:'#expected',state:'pressed'};
    f.run({action:'start',id:'missed',selector:'#target',event:'click',instruction:'Select Rectangle',completion,timeoutMs:20000});
    for(const fn of f.intervals.values()) fn();
    assert.equal(f.run({action:'poll',id:'missed'}).status,'waiting');
    f.expected.attrs['aria-pressed']='true';
    for(const fn of f.intervals.values()) fn();
    const result=f.run({action:'poll',id:'missed'});
    assert.equal(result.status,'completed');assert.equal(result.actionObserved,false);assert.deepEqual(result.proof,completion);
    assert.equal(f.intervals.size,0);assert.equal(f.window.__tamperSlothGuidance.marks.size,0);
});

test('an expected selector alone cannot finish a step without an observed action',()=>{
    const f=fixture();f.elements.set('#expected',f.expected);
    f.run({action:'start',id:'unproven',selector:'#target',event:'click',instruction:'Continue',expectedSelector:'#expected',timeoutMs:20000});
    for(const fn of f.intervals.values()) fn();
    assert.equal(f.run({action:'poll',id:'unproven'}).status,'waiting');
});

test('observation failures return fresh evidence and recovery guidance instead of terminal errors',async()=>{
    const operations=[];
    const chrome={runtime:{sendMessage:async msg=>{
        operations.push(msg.operation);
        if(msg.operation==='guidance' && msg.input.action==='start') return {error:'Guidance target not found'};
        if(msg.operation==='accessibility') return {nodes:[{role:'button',name:'Rectangle',pressed:'true'}]};
        if(msg.operation==='perception') return {screenshot:'data:image/png;base64,aW1hZ2U=',metadata:{freshness:{settled:true}}};
        return {ok:true};
    }},tabs:{get:async()=>({url:'https://example.com',title:'Current page'})}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const input=tools.waitForUserAction.inputSchema.parse({selector:'#stale',instruction:'Select Rectangle'});
    const result=await tools.waitForUserAction.execute(input,{abortSignal:new AbortController().signal});
    assert.equal(result.status,'needsReview');assert.equal(result.recoverable,true);assert.equal(result.error,undefined);
    assert.equal(result.observationPhase,'notStarted');assert.equal(result.actionObserved,null);
    assert.equal(result.currentState.nodes[0].pressed,'true');assert.ok(result.screenshot);assert.match(result.hint,/first unfinished step/);
    assert.ok(operations.includes('accessibility'));assert.ok(operations.includes('perception'));
});

test('failed highlights retry transient targets using one stable annotation ID',async()=>{
    const drawings=[];let failures=2;
    const chrome={runtime:{sendMessage:async msg=>{
        if(msg.operation==='guidance' && msg.input.action==='draw') {
            drawings.push(msg.input);if(failures-->0)return {error:'Guidance target not found'};
            return {ok:true,id:msg.input.id};
        }
        return {ok:true};
    }}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const input=tools.annotatePage.inputSchema.parse({action:'draw',selector:'#target',kind:'highlight'});
    const result=await tools.annotatePage.execute(input,{abortSignal:new AbortController().signal});
    assert.equal(result.ok,true);assert.equal(result.attempts,3);assert.equal(drawings.length,3);
    assert.equal(new Set(drawings.map(draw=>draw.id)).size,1);
});

test('a highlight that still fails returns page evidence and requests another visual target',async()=>{
    let attempts=0;
    const chrome={runtime:{sendMessage:async msg=>{
        if(msg.operation==='guidance' && msg.input.action==='draw'){attempts++;return {error:'Guidance target not found'};}
        if(msg.operation==='accessibility') return {nodes:[{elementId:'new-target',role:'button'}]};
        if(msg.operation==='perception') return {screenshot:'data:image/png;base64,aW1hZ2U='};
        return {ok:true};
    }}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const input=tools.annotatePage.inputSchema.parse({action:'draw',selector:'#old'});
    const result=await tools.annotatePage.execute(input,{abortSignal:new AbortController().signal});
    assert.equal(attempts,3);assert.equal(result.status,'needsReview');assert.equal(result.error,undefined);
    assert.equal(result.currentState.nodes[0].elementId,'new-target');assert.ok(result.screenshot);
    assert.match(result.hint,/retry the drawing/);
});

test('highlight retries stop on cancellation',async()=>{
    let attempts=0;const controller=new AbortController();
    const chrome={runtime:{sendMessage:async msg=>{
        if(msg.operation==='guidance' && msg.input.action==='draw'){attempts++;controller.abort();return {error:'Target disappeared'};}
        return {ok:true};
    }}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const input=tools.annotatePage.inputSchema.parse({action:'draw',selector:'#target'});
    await assert.rejects(tools.annotatePage.execute(input,{abortSignal:controller.signal}),/Aborted/);
    assert.equal(attempts,1);
});

test('already-completed tool starts return directly and do not poll a nonexistent wait',async()=>{
    const calls=[];
    const chrome={runtime:{sendMessage:async msg=>{calls.push(msg.input.action);return {status:'completed',alreadySatisfied:true};}},tabs:{get:async()=>({url:'https://example.com',title:'Page'})}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const input=tools.waitForUserAction.inputSchema.parse({selector:'#target',instruction:'Select Rectangle',completion:{selector:'#rectangle',state:'pressed'}});
    const result=await tools.waitForUserAction.execute(input,{abortSignal:new AbortController().signal});
    assert.equal(result.alreadySatisfied,true);assert.deepEqual(calls.filter(action=>action!=='controls'),['start']);
});

test('a guided step replaces old tips and removes retained drawings immediately on action',()=>{
    const f=fixture();
    f.run({action:'draw',id:'stale',kind:'rectangle',box:{x:20,y:20,width:30,height:30},label:'Old tip'});
    f.run({action:'draw',id:'region',kind:'rectangle',box:{x:250,y:200,width:120,height:100},label:'Drag corner to corner'});
    f.run({action:'start',id:'drag',selector:'#target',annotationIds:['region'],event:'pointerup',instruction:'Drag corner to corner',expectedSelector:'#expected',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.marks.has('stale'),false);assert.equal(state.marks.size,1);
    f.fire('pointerup');assert.equal(state.marks.size,0);
    assert.equal(f.run({action:'poll',id:'drag'}).status,'waiting');
    f.elements.set('#expected',f.expected);for(const fn of f.intervals.values())fn();
    assert.equal(f.run({action:'poll',id:'drag'}).status,'completed');
    assert.equal(state.status.hidden,true);
});

test('an action taken between drawing and starting a wait does not bring the tip back',()=>{
    const f=fixture();
    f.run({action:'draw',id:'early',kind:'bracket',selector:'#target',label:'Click Continue'});
    const state=f.window.__tamperSlothGuidance,label=state.marks.get('early').label;
    f.fire('click');assert.equal(label.hidden,true);
    const result=f.run({action:'start',id:'late',selector:'#target',event:'click',instruction:'Click Continue',timeoutMs:1000});
    assert.equal(result.status,'completed');assert.equal(state.marks.size,0);assert.equal(state.status.hidden,true);
    assert.equal(f.intervals.size,0);
});

test('guided steps ignore synthetic actions, re-guide wrong clicks, and verify resulting state',()=>{
    const f=fixture();
    f.run({action:'start',id:'step',selector:'#target',event:'click',instruction:'Open settings',expectedSelector:'#expected',expectedState:'visible',timeoutMs:1000});
    f.fire('click',f.target,false);assert.equal(f.run({action:'poll',id:'step'}).status,'waiting');
    f.fire('click',f.expected);assert.equal(f.run({action:'poll',id:'step'}).unexpectedActions,1);
    f.fire('click');assert.equal(f.run({action:'poll',id:'step'}).status,'waiting');
    f.elements.set('#expected',f.expected);for(const fn of f.intervals.values())fn();
    const result=f.run({action:'poll',id:'step'});assert.equal(result.status,'completed');assert.equal(result.unexpectedActions,1);
    assert.equal(f.intervals.size,0);assert.equal(f.listeners.get('click').size,0);
    assert.equal(f.window.__tamperSlothGuidance.marks.size,0);
});

test('timeouts distinguish a missing action from a missing resulting change',()=>{
    const f=fixture();
    f.run({action:'start',id:'step',selector:'#target',event:'change',instruction:'Choose a plan',expectedSelector:'#expected',timeoutMs:1000});
    f.fire('change');const timeout=[...f.timers.values()].find(t=>t.ms===1000);timeout.fn();
    const result=f.run({action:'poll',id:'step'});assert.equal(result.status,'timeout');assert.equal(result.actionObserved,true);assert.match(result.hint,/expected page change/);
    assert.equal(f.intervals.size,0);assert.equal(f.listeners.get('change').size,0);
});

test('an idle user ends the wait early while page activity restarts the idle window',()=>{
    const f=fixture();
    f.run({action:'start',id:'idle',selector:'#target',event:'click',instruction:'Select Rectangle',timeoutMs:60000,idleTimeoutMs:5000});
    const idleTimer=()=>[...f.timers.values()].find(timer=>timer.ms===5000);
    const first=idleTimer();f.fire('keyup',f.expected);
    assert.ok(first);assert.equal([...f.timers.values()].includes(first),false);
    assert.equal(f.run({action:'poll',id:'idle'}).status,'waiting');
    idleTimer().fn();
    const result=f.run({action:'poll',id:'idle'});
    assert.equal(result.status,'timeout');assert.equal(result.idle,true);assert.equal(result.actionObserved,false);
    assert.equal(f.intervals.size,0);
});

test('the guidance guard holds text-only fallbacks after an observer failure and resumes the overlay',()=>{
    const {createGuidanceGuard}=createLoader()('src/chat/lib/guidanceGuard.ts');
    const guard=createGuidanceGuard();
    assert.equal(guard.holding(),false);
    guard.observe('waitForUserAction',{status:'needsReview',observationPhase:'notStarted'});
    assert.equal(guard.holding(),true);
    assert.equal(guard.resume(),true);
    // A fresh observed step releases the hold so the model can finish normally.
    guard.observe('waitForUserAction',{status:'completed'});
    assert.equal(guard.holding(),false);assert.equal(guard.resume(),false);
    // Legacy results without permission to check in still hold; a check-in releases immediately.
    guard.observe('waitForUserAction',{status:'needsReview',idle:true,checkInAllowed:false});
    assert.equal(guard.holding(),true);
    guard.observe('waitForUserAction',{status:'needsReview',idle:true,checkInAllowed:true});
    assert.equal(guard.holding(),false);
    guard.observe('waitForUserAction',{status:'needsReview',observationPhase:'interactionPause',checkInAllowed:true});
    assert.equal(guard.holding(),false);assert.equal(guard.resume(),false);
    // askUser about the stuck step is a legitimate way to end the turn.
    guard.observe('annotatePage',{status:'needsReview'});
    guard.observe('askUser',{answer:'x'});
    assert.equal(guard.holding(),false);
});

test('the guidance guard stops nudging after repeated failures',()=>{
    const {createGuidanceGuard}=createLoader()('src/chat/lib/guidanceGuard.ts');
    const guard=createGuidanceGuard();
    for(let i=0;i<3;i++) guard.observe('waitForUserAction',{status:'needsReview',observationPhase:'timedOut'});
    assert.equal(guard.holding(),false);assert.equal(guard.resume(),false);
});

test('an observed action disables the idle timeout',()=>{
    const f=fixture();
    f.run({action:'start',id:'acted',selector:'#target',event:'click',instruction:'Continue',expectedSelector:'#expected',timeoutMs:60000,idleTimeoutMs:5000});
    f.fire('click');
    const idle=[...f.timers.values()].find(timer=>timer.ms===5000);
    idle?.fn();
    assert.equal(f.run({action:'poll',id:'acted'}).status,'waiting');
});

test('a held pointer keeps the step active until the user finishes or cancels the gesture',()=>{
    const f=fixture();
    f.run({action:'start',id:'drag',selector:'#target',event:'pointerup',instruction:'Draw a frame',timeoutMs:20000,idleTimeoutMs:10000});
    f.fire('pointerdown',f.expected);
    assert.equal(f.run({action:'poll',id:'drag'}).interactionActive,true);
    assert.equal([...f.timers.values()].some(timer=>timer.ms===10000),false);
    f.fire('pointerup',f.expected);
    assert.equal(f.run({action:'poll',id:'drag'}).interactionActive,false);
    assert.equal([...f.timers.values()].some(timer=>timer.ms===10000),true);
    f.fire('pointerdown',f.expected);f.fire('pointercancel',f.expected);
    assert.equal(f.run({action:'poll',id:'drag'}).interactionActive,false);
    assert.equal([...f.timers.values()].some(timer=>timer.ms===10000),true);
});

test('the first idle timeout allows a check-in instead of another long wait',async()=>{
    const f=timedToolFixture(()=>({status:'timeout',idle:true,actionObserved:false}));
    const result=await f.run({selector:'#target',instruction:'Select Rectangle'});
    const start=f.calls.find(call=>call.input.action==='start').input;
    assert.equal(start.timeoutMs,20000);assert.equal(start.idleTimeoutMs,10000);
    assert.equal(result.status,'needsReview');assert.equal(result.checkInAllowed,true);assert.equal(result.actionObserved,false);
    assert.ok(result.screenshot);assert.ok(result.currentState);
    assert.match(result.hint,/Do not silently start another wait/);assert.doesNotMatch(result.hint,/45000/);
    const guard=createLoader()('src/chat/lib/guidanceGuard.ts').createGuidanceGuard();
    guard.observe('waitForUserAction',result);
    assert.equal(guard.holding(),false);assert.equal(guard.resume(),false);
});

test('a missed selector action checks progress promptly after the user pauses',async()=>{
    const f=timedToolFixture(()=>({status:'waiting',ready:true,interactions:1,actionObserved:false}));
    const result=await f.run({selector:'#target',instruction:'Select Rectangle'});
    assert.equal(f.elapsed(),3000);assert.equal(result.status,'needsReview');assert.equal(result.observationPhase,'interactionPause');
    assert.equal(result.actionObserved,false);assert.equal(result.checkInAllowed,true);assert.ok(result.screenshot);assert.ok(result.currentState);
    assert.equal(f.calls.filter(call=>call.input.action==='start').length,1);
});

test('progress checks wait for active typing and held pointer gestures to pause',async()=>{
    for(const pointer of [false,true]) {
        const f=timedToolFixture(now=>({status:'waiting',ready:true,actionObserved:false,
            interactions:pointer ? (now<5000 ? 1 : 2) : Math.min(now/250+1,21),interactionActive:pointer && now<5000}));
        const result=await f.run({selector:'#target',event:pointer ? 'pointerup' : 'change',instruction:'Finish this step'});
        assert.equal(result.observationPhase,'interactionPause');assert.equal(f.elapsed(),6000);
    }
});

test('progress checks start their clock after the guidance drawing is ready',async()=>{
    const f=timedToolFixture(now=>({status:'waiting',ready:now>=7000,interactions:1,actionObserved:false}),{status:'waiting',ready:false});
    const result=await f.run({selector:'#target',instruction:'Select Rectangle'});
    assert.equal(result.observationPhase,'interactionPause');assert.equal(f.elapsed(),10000);
});

test('observed actions and state waits keep watching for their declared result',async()=>{
    for(const event of ['click','state']) {
        const f=timedToolFixture(now=>({status:now>=10000 ? 'completed' : 'waiting',ready:true,interactions:1,actionObserved:event==='click'}));
        const result=await f.run({selector:'#target',event,expectedSelector:'#expected',instruction:'Wait for confirmation'});
        assert.equal(result.status,'completed');assert.equal(f.elapsed(),10000);
        assert.equal(f.calls.some(call=>call.operation==='perception'),false);
    }
});

test('an untouched step reports no action',()=>{
    const f=fixture();
    f.run({action:'start',id:'untouched',selector:'#target',event:'click',instruction:'Select Rectangle',timeoutMs:1000});
    [...f.timers.values()].find(timer=>timer.ms===1000).fn();
    assert.equal(f.run({action:'poll',id:'untouched'}).actionObserved,false);
});

test('Escape cancels without suppressing keyboard input and lost pages are reported honestly',()=>{
    const f=fixture();
    assert.equal(f.run({action:'poll',id:'old'}).status,'lost');
    f.run({action:'start',id:'step',selector:'#target',event:'click',instruction:'Continue',timeoutMs:1000});
    f.fire('keydown',f.target,true,{key:'Escape'});assert.equal(f.run({action:'poll',id:'step'}).status,'cancelled');
    assert.equal(f.intervals.size,0);
    assert.equal(f.run({action:'poll',id:'other'}).status,'lost');
});

test('cursor uses actual event coordinates and has action-specific cues',()=>{
    const f=fixture();
    f.run({action:'cursor',method:'Input.dispatchMouseEvent',params:{type:'mouseWheel',x:230,y:150}});
    const cursor=f.window.__tamperSlothGuidance.cursor;
    assert.equal(cursor.style.transform,'translate(230px,150px)');assert.equal(f.window.__tamperSlothGuidance.cursorName.textContent,'Sloth · scroll');
    f.target.tagName='INPUT';f.run({action:'cursor',method:'Input.insertText',params:{}});assert.equal(f.window.__tamperSlothGuidance.cursorName.textContent,'Sloth · typing');
    f.run({action:'clear'});assert.equal(cursor.hidden,false);
});

test('cursor stays visible at its last position during idle time and annotation cleanup',()=>{
    const f=fixture();
    f.run({action:'cursor',method:'Input.dispatchMouseEvent',params:{type:'mouseWheel',x:230,y:150}});
    const state=f.window.__tamperSlothGuidance,position=state.cursor.style.transform;
    const idle=[...f.timers.values()].find(timer=>timer.ms===1400);
    idle.fn();assert.equal(state.cursor.hidden,false);assert.equal(state.cursorName.textContent,'Sloth');
    assert.equal(state.cursor.style.transform,position);
    f.run({action:'draw',id:'mark',kind:'bracket',selector:'#target'});
    const drawnPosition=state.cursor.style.transform;
    f.run({action:'clear'});assert.equal(state.marks.size,0);
    assert.equal(state.cursor.hidden,false);assert.equal(state.cursor.style.transform,drawnPosition);
});

test('cursor traces lime guide strokes, streams its description, and cancels animation on cleanup',()=>{
    const f=fixture({animate:true});
    f.run({action:'draw',id:'animated',kind:'rectangle',selector:'#target',label:'Click the Rectangle tool',color:'rose'});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('animated');
    assert.equal(mark.shape.attrs.stroke,'#a8bd85');assert.equal(mark.echo.attrs.stroke,'#a8bd85');
    assert.equal(mark.group.style.mask,undefined);assert.equal(mark.shape.attrs.d,'');assert.equal(mark.echo.style.display,'none');assert.equal(state.cursorBody.hidden,true);
    assert.equal(state.inputLocked,true);
    assert.equal(mark.group.style.filter,'none');
    // Frame rendering must use the cached points, without asking SVG to measure again.
    for(const geometry of mark.measurements.children) geometry.getPointAtLength=()=>{throw new Error('Geometry read during animation');};
    const first=[...f.frames][0];f.frames.delete(first[0]);first[1](performance.now()+100);
    assert.equal(state.cursor.hidden,false);assert.equal(mark.drawn,undefined);
    assert.match(mark.shape.attrs.d,/^ M0,0 L/);assert.equal(mark.echo.style.display,'none');
    const middle=[...f.frames][0];f.frames.delete(middle[0]);middle[1](performance.now()+150);
    assert.notEqual(state.cursor.icon.style.transform,'rotate(0deg)');
    const finish=[...f.frames][0];f.frames.delete(finish[0]);finish[1](performance.now()+6000);
    assert.equal(mark.drawn,true);assert.equal(state.cursorBody.hidden,false);
    assert.equal(mark.group.style.filter,'');
    assert.ok(mark.shape.attrs.d.length>0);assert.equal(mark.measurements.removed,true);
    assert.equal(state.inputLocked,false);
    assert.equal(state.cursorBody.textContent,'C');assert.equal(state.cursorBody.attrs['aria-label'],'Click the Rectangle tool');
    assert.equal(state.cursorBody.style.minHeight,'');
    assert.equal(state.cursorTag.style.width,'');
    assert.equal(state.cursorTag.style.top,'34px');
    for(const timer of [...f.timers.values()]) if(timer.ms===16)timer.fn();
    assert.equal(state.cursorBody.textContent,'Cl');
    f.run({action:'clear'});assert.equal(state.drawing,null);assert.equal(state.cursorBody.hidden,true);
    assert.equal(f.frames.size,0);assert.equal(state.marks.size,0);
});

test('guide tips are text only, with no logo next to the lime-glowing pointer',()=>{
    const f=fixture();f.run({action:'draw',id:'compact',kind:'bracket',selector:'#target',label:'Click Black'});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.cursorTag.children.length,1);assert.equal(state.cursorTag.children[0].children[0],state.cursorBody);
    assert.equal(state.cursorTag.children[0].children.length,1);
    assert.equal(state.cursor.children.some(child=>child.tagName==='img'),false);
    assert.equal(state.cursorBody.textContent,'Click Black');assert.equal(state.cursorBody.style.minHeight,'');
    assert.equal(state.cursorTag.style.top,'34px');
    assert.match(state.cursor.innerHTML,/fill="black"/);assert.match(state.cursor.innerHTML,/stroke="#A8BD85"/);
    assert.match(state.cursor.innerHTML,/M3\.22324 1\.01515C3\.80072/);
    state.moveCursor({x:300,y:590},false,true);
    assert.equal(state.cursorTag.style.top,'34px');
    assert.ok(state.cursorPoint.y+34+state.cursorTag.offsetHeight<=588);
    assert.equal(state.cursorTag.style.width,'');
    f.run({action:'remove',id:'compact'});assert.equal(state.cursorBody.hidden,true);assert.equal(state.cursorTag.hidden,true);
});

test('the sloth mark rides under the cursor while acting or idle, never while guiding',()=>{
    const f=fixture();f.run({action:'cursor',method:'Input.dispatchMouseEvent',params:{x:40,y:40,type:'mouseMoved'}});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.cursorBadge.hidden,false);
    f.run({action:'draw',id:'guide',kind:'bracket',selector:'#target',label:'Click Black'});
    assert.equal(state.cursorBadge.hidden,true);
    f.run({action:'remove',id:'guide'});assert.equal(state.cursorBadge.hidden,false);
    f.run({action:'draw',id:'__focus',kind:'bracket',box:{x:0,y:0,width:10,height:10},animate:false});
    assert.equal(state.cursorBadge.hidden,false);
});

test('a zero-progress first frame preserves the move command so later strokes paint live',()=>{
    const f=fixture({animate:true});
    f.run({action:'draw',id:'zero-frame',kind:'rectangle',selector:'#target'});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('zero-frame');
    const tick=time=>{const [id,frame]=[...f.frames][0];f.frames.delete(id);frame(time);};
    tick(0);
    assert.equal(mark.shape.attrs.d,' M0,0');
    tick(performance.now()+150);
    assert.match(mark.shape.attrs.d,/^ M0,0 L/);
    assert.equal(mark.drawn,undefined);
    f.run({action:'clear'});
});

test('live ink and the cursor hotspot stay together after layout shifts and at viewport edges',()=>{
    const f=fixture({animate:true});
    f.run({action:'draw',id:'edge',kind:'rectangle',selector:'#target'});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('edge');
    f.target.box={x:790,y:595,width:120,height:35};
    state.render();
    assert.equal(mark.group.attrs.transform,'translate(790,595)');
    assert.equal(mark.shape.attrs.d,'');
    const frame=[...f.frames][0];f.frames.delete(frame[0]);frame[1](performance.now()+150);
    const end=mark.shape.attrs.d.match(/L([\d.]+),([\d.]+)$/);
    assert.ok(end,'A partial stroke must be visible before completion');
    assert.equal(mark.drawn,undefined);
    assert.equal(state.cursorPoint.x+3,790+Number(end[1]));
    assert.equal(state.cursorPoint.y+3,595+Number(end[2]));
    assert.equal(state.cursor.style.transition,'none');
    f.run({action:'clear'});
});

test('reduced motion draws immediately and provides the full description in the cursor bubble',()=>{
    const f=fixture();f.run({action:'draw',kind:'highlight',selector:'#target',label:'Save preferences',color:'sky'});
    const state=f.window.__tamperSlothGuidance,mark=[...state.marks.values()][0];
    assert.equal(mark.drawn,true);assert.equal(mark.group.style.mask,undefined);assert.equal(mark.fill.attrs.fill,'#a8bd85');
    assert.equal(mark.label.hidden,true);assert.equal(state.cursorBody.textContent,'Save preferences');
    assert.equal(state.cursorBody.attrs['data-typing'],'false');
});

test('drawing completion resolves the tool when animation frames are suspended',async()=>{
    const f=fixture({animate:true});
    const pending=f.run({action:'draw',id:'background',kind:'rectangle',selector:'#target',label:'Click Continue',waitForDrawing:true});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(typeof pending.then,'function');
    assert.equal(state.cursorBody.hidden,true);
    const fallback=f.timers.get(state.marks.get('background').animationTimer);
    fallback.fn();const result=await pending;
    assert.equal(result.ok,true);assert.equal(state.marks.get('background').drawn,true);assert.equal(state.drawing,null);
    assert.ok(state.marks.get('background').shape.attrs.d.length>0);assert.equal(state.cursorBody.hidden,false);
    assert.equal(f.frames.size,0);
});

test('unmeasurable geometry keeps the outline visible before showing its description',()=>{
    const f=fixture({animate:true,measurable:false});
    f.run({action:'draw',id:'unmeasurable',kind:'rectangle',selector:'#target',label:'Click Continue'});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('unmeasurable');
    assert.equal(mark.drawn,true);assert.ok(mark.shape.attrs.d.endsWith(' Z'));
    assert.equal(mark.group.style.visibility,'visible');assert.equal(state.cursorBody.hidden,false);
    assert.equal(mark.measurements.removed,true);assert.equal(f.frames.size,0);
    assert.equal(state.inputLocked,false);
});

test('input is blocked while drawing and later clicks observe a replaced target node',()=>{
    const f=fixture({animate:true});
    f.run({action:'start',id:'step',selector:'#target',event:'click',instruction:'Click Continue',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.inputLocked,true);assert.equal(state.inputGuard.hidden,false);
    assert.equal([...f.timers.values()].some(timer=>timer.ms===1000),false);
    assert.equal(f.run({action:'poll',id:'step'}).ready,false);
    assert.equal(f.fire('click').defaultPrevented,true);
    assert.equal(f.fire('pointermove').defaultPrevented,true);
    assert.equal(f.fire('wheel').defaultPrevented,true);
    assert.equal(f.run({action:'poll',id:'step'}).actionObserved,false);
    const finish=[...f.frames][0];f.frames.delete(finish[0]);finish[1](performance.now()+6000);
    assert.equal(state.inputLocked,false);assert.equal(state.inputGuard.hidden,true);
    assert.equal(f.run({action:'poll',id:'step'}).ready,true);
    assert.equal([...f.timers.values()].some(timer=>timer.ms===1000),true);
    f.elements.set('#target',f.expected);
    assert.equal(f.fire('click',f.expected).defaultPrevented,false);
    assert.equal(f.run({action:'poll',id:'step'}).status,'completed');
});

test('Escape and the lock watchdog both release drawing input guards',()=>{
    const f=fixture({animate:true});
    f.run({action:'start',id:'step',selector:'#target',event:'click',instruction:'Continue',timeoutMs:10000});
    const state=f.window.__tamperSlothGuidance;
    f.fire('keydown',f.target,true,{key:'Escape'});
    assert.equal(state.inputLocked,false);assert.equal(state.inputGuard.hidden,true);
    assert.equal(f.run({action:'poll',id:'step'}).status,'cancelled');
    f.run({action:'draw',id:'watchdog',kind:'rectangle',selector:'#target'});
    assert.equal(state.inputLocked,true);
    f.timers.get(state.inputLockTimer).fn();assert.equal(state.inputLocked,false);
    assert.equal(f.fire('click').defaultPrevented,false);
});

test('ordinary typing focus cues do not pause site input',()=>{
    const f=fixture({animate:true});
    f.target.tagName='INPUT';f.run({action:'cursor',method:'Input.insertText',params:{}});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.inputLocked,false);assert.equal(state.inputGuard.hidden,true);
    assert.equal(state.marks.get('__focus').drawn,true);
    assert.equal(f.fire('beforeinput').defaultPrevented,false);
});

test('ending a run disposes the cursor and an unfocused keyboard event does not park it at the edge',()=>{
    const f=fixture();
    f.run({action:'cursor',method:'Input.dispatchMouseEvent',params:{type:'mouseMoved',x:230,y:150}});
    const state=f.window.__tamperSlothGuidance,position=state.cursor.style.transform;
    // The root represents an unfocused page, rather than an editable control.
    f.target.box={x:0,y:0,width:800,height:600};
    f.document.body=f.target;
    f.run({action:'cursor',method:'Input.dispatchKeyEvent',params:{type:'keyDown'}});
    assert.equal(state.cursor.style.transform,position);
    // Shortcuts on a focused canvas or app container leave the cursor where it last acted.
    f.target.box={x:300,y:200,width:500,height:400};f.document.body=undefined;
    f.run({action:'cursor',method:'Input.dispatchKeyEvent',params:{type:'keyDown',key:'o'}});
    assert.equal(state.cursor.style.transform,position);assert.equal(state.marks.has('__focus'),false);
    f.run({action:'dispose'});
    assert.equal(state.cursor.hidden,true);assert.equal(state.host.removed,true);
    assert.equal(f.window.__tamperSlothGuidance,undefined);
    assert.equal(f.run({action:'dispose'}).status,'lost');
    assert.equal(position,'translate(230px,150px)');
});

test('run cleanup covers all visited tabs and releases their debugger sessions',async()=>{
    const disposed=[],detached=[],removed=[];
    const chrome={storage:{session:{get:async()=>({ts_guidance_tab_7:true,ts_guidance_tab_9:true,unrelated:true}),remove:async keys=>removed.push(...keys)}}};
    const load=createLoader({globals:{chrome},mocks:{'./pageGuidance':{runPageGuidance:async (id,args)=>disposed.push([id,args.action])}}});
    await load('src/background/panelLifecycle.ts').cleanupBrowserGuidance({status:()=>[7,10],detach:async id=>detached.push(id)});
    assert.deepEqual(disposed,[[7,'dispose'],[9,'dispose'],[10,'dispose']]);
    assert.deepEqual(detached,[7,9,10]);assert.deepEqual(removed,['ts_guidance_tab_7','ts_guidance_tab_9']);
});

test('closing the last extension panel disposes guidance and blocks further input',async()=>{
    let connected;const disposed=[],closed=[],detached=[];
    const chrome={runtime:{id:'test-extension',getURL:()=> 'chrome-extension://test-extension/',onConnect:{addListener:fn=>{connected=fn;}}},
        storage:{session:{get:async()=>({ts_guidance_tab_7:true}),remove:async()=>{}}}};
    const load=createLoader({globals:{chrome},mocks:{'./pageGuidance':{runPageGuidance:async id=>disposed.push(id)}}});
    load('src/background/panelLifecycle.ts').installPanelLifecycle({status:()=>[7],detach:async id=>detached.push(id),setPanelClosed:value=>closed.push(value)});
    function port(){let disconnect;return {name:'tampersloth-panel',sender:{id:'test-extension',url:'chrome-extension://test-extension/index.html'},onDisconnect:{addListener:fn=>{disconnect=fn;}},close:()=>disconnect()};}
    const first=port(),second=port();connected(first);connected(second);first.close();
    assert.deepEqual(closed,[false,false]);assert.equal(disposed.length,0);
    second.close();await new Promise(resolve=>setTimeout(resolve,0));
    assert.deepEqual(closed,[false,false,true]);assert.deepEqual(disposed,[7]);assert.deepEqual(detached,[7]);
});

test('tool waits cancel on abort and return current page metadata after completion',async()=>{
    const calls=[];let polls=0;
    const chrome={runtime:{sendMessage:async msg=>{calls.push(msg.input);return msg.input.action==='poll' ? {status:++polls===1?'waiting':'completed'} : {status:'waiting'};}},tabs:{get:async()=>({url:'https://example.com/updated',title:'Updated'})}};
    const load=createLoader({globals:{chrome}}), tools=load('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const schema=tools.waitForUserAction.inputSchema;
    const input=schema.parse({selector:'#target',instruction:'Continue'});
    const controller=new AbortController();
    const result=await tools.waitForUserAction.execute(input,{abortSignal:controller.signal});
    assert.equal(result.status,'completed');assert.equal(result.page.title,'Updated');assert.equal(calls.at(-1).action,'cancel');
    polls=0;calls.length=0;
    const pending=tools.waitForUserAction.execute(input,{abortSignal:controller.signal});
    setTimeout(()=>controller.abort(),10);
    await assert.rejects(pending,/Aborted/);assert.ok(calls.some(c=>c.action==='cancel'));
    assert.throws(()=>tools.annotatePage.inputSchema.parse({action:'start'}));
});

test('hidden duplicates do not make a visible target ambiguous',()=>{
    const f=fixture(),hidden=f.document.createElement('button');hidden.box={x:0,y:0,width:0,height:0};
    const query=f.document.querySelectorAll;
    f.document.querySelectorAll=selector=>selector==='[aria-label="Frame"]' ? [hidden,f.target] : query(selector);
    const result=f.run({action:'start',id:'frame',selector:'[aria-label="Frame"]',event:'click',instruction:'Pick the Frame tool',timeoutMs:1000});
    assert.equal(result.status,'waiting');
    f.fire('click');assert.equal(f.run({action:'poll',id:'frame'}).status,'completed');
    f.document.querySelectorAll=selector=>selector==='.dup' ? [f.target,f.expected] : query(selector);
    assert.throws(()=>f.run({action:'start',id:'dup',selector:'.dup',event:'click',instruction:'Click',timeoutMs:1000}),/ambiguous \(2 matches\)/);
});

test('a rendered target scrolled out of view is not ambiguous with a hidden duplicate',()=>{
    const f=fixture(),hidden=f.document.createElement('a');hidden.box={x:0,y:0,width:0,height:0};
    f.target.box={x:20,y:900,width:160,height:30};
    const query=f.document.querySelectorAll;
    f.document.querySelectorAll=selector=>selector==='a[href="/settings/apps"]' ? [hidden,f.target] : query(selector);
    const result=f.run({action:'start',id:'dev',selector:'a[href="/settings/apps"]',event:'click',instruction:'Open Developer settings',timeoutMs:1000});
    assert.equal(result.status,'waiting');
});

test('an action followed by a full page load is still reported as observed',()=>{
    const f=fixture();
    f.run({action:'start',id:'nav',selector:'#target',event:'click',instruction:'Open Developer settings',expectedSelector:'#expected',timeoutMs:60000});
    f.fire('pointerdown');
    delete f.window.__tamperSlothGuidance;
    const result=f.run({action:'poll',id:'nav'});
    assert.equal(result.status,'lost');assert.equal(result.actionObserved,true);
    assert.equal(f.run({action:'poll',id:'nav'}).actionObserved,undefined);
    assert.equal(f.run({action:'poll',id:'other'}).actionObserved,undefined);
});

test('a click made before the wait starts is observed without a prior annotation',()=>{
    const f=fixture();
    f.run({action:'draw',id:'other',kind:'rectangle',box:{x:5,y:5,width:10,height:10}});f.run({action:'remove',id:'other'});
    f.fire('pointerdown');f.fire('click');
    const result=f.run({action:'start',id:'early',selector:'#target',event:'click',instruction:'Pick the Frame tool',timeoutMs:1000});
    assert.equal(result.status,'completed');assert.equal(result.actionObserved,true);
    const next=f.run({action:'start',id:'next',selector:'#target',event:'click',instruction:'Pick it again',timeoutMs:1000});
    assert.equal(next.status,'waiting');
});

test('a press on a toolbar button that re-renders counts as its click',()=>{
    const f=fixture(),parent=f.document.createElement('div');
    f.run({action:'start',id:'tool',selector:'#target',event:'click',instruction:'Pick the Frame tool',timeoutMs:1000});
    f.fire('pointerdown');f.fire('click',parent);
    const result=f.run({action:'poll',id:'tool'});
    assert.equal(result.status,'completed');assert.equal(result.unexpectedActions,0);
});

test('a page that stops propagation before document listeners is still observed',()=>{
    const f=fixture();
    f.run({action:'start',id:'tool',selector:'#target',event:'click',instruction:'Pick the Frame tool',timeoutMs:1000});
    f.window.addEventListener('click',event=>event.stopImmediatePropagation());
    f.fire('click');assert.equal(f.run({action:'poll',id:'tool'}).status,'waiting');
    for(const fn of f.intervals.values()) fn();
    assert.equal(f.run({action:'poll',id:'tool'}).status,'completed');
});

test('region steps draw at measured coordinates and observe presses inside them',()=>{
    const f=fixture(),region={x:300,y:200,width:40,height:40};
    const started=f.run({action:'start',id:'frame',region,event:'click',instruction:'Pick the Frame tool',timeoutMs:1000});
    assert.equal(started.status,'waiting');
    const state=f.window.__tamperSlothGuidance;assert.deepEqual(state.marks.get('__step').box,region);
    f.fire('click',f.expected,true,{clientX:10,clientY:10});
    assert.equal(f.run({action:'poll',id:'frame'}).unexpectedActions,1);
    f.fire('pointerup',f.expected,true,{clientX:10,clientY:10});
    assert.equal(f.run({action:'poll',id:'frame'}).interactions,2);
    f.fire('pointerdown',f.expected,true,{clientX:320,clientY:215});
    const result=f.run({action:'poll',id:'frame'});
    assert.equal(result.status,'completed');assert.equal(result.verification,'visual');assert.equal(state.marks.size,0);
});

test('coordinate fallback unlocks only after repeated selector failures and returns a screenshot to judge',async()=>{
    const starts=[];
    const chrome={runtime:{sendMessage:async msg=>{
        if(msg.operation==='guidance' && msg.input.action==='start'){starts.push(msg.input);return msg.input.region ? {status:'completed',actionObserved:true,verification:'visual'} : {error:'Guidance target not found'};}
        if(msg.operation==='perception') return {screenshot:'data:image/png;base64,aW1hZ2U=',metadata:{}};
        if(msg.operation==='accessibility') return {nodes:[]};
        return {ok:true};
    }},tabs:{get:async()=>({url:'https://figma.com',title:'Figma'})}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const schema=tools.waitForUserAction.inputSchema,options={abortSignal:new AbortController().signal};
    const regional=schema.parse({region:{x:300,y:200,width:40,height:40},instruction:'Pick the Frame tool'});
    await assert.rejects(tools.waitForUserAction.execute(regional,options),/unlocks after 2/);
    assert.throws(()=>schema.parse({region:{x:1,y:1,width:0,height:5},instruction:'x'}));
    const first=await tools.waitForUserAction.execute(schema.parse({selector:'#frame',instruction:'Pick the Frame tool'}),options);
    assert.doesNotMatch(first.hint,/fall back to coordinates/);
    const second=await tools.waitForUserAction.execute(schema.parse({selector:'#frame-tool',instruction:'Pick the Frame tool'}),options);
    assert.match(second.hint,/fall back to coordinates/);
    const result=await tools.waitForUserAction.execute(regional,options);
    assert.equal(result.status,'visualCheck');assert.equal(result.trigger,'regionAction');assert.equal(result.actionObserved,true);
    assert.ok(result.screenshot);assert.match(result.hint,/Judge from this screenshot/);
    assert.deepEqual(starts.at(-1).region,regional.region);
});

test('region steps check a screenshot once the user interacts elsewhere and pauses',async()=>{
    let failing=true;
    const chrome={runtime:{sendMessage:async msg=>{
        if(msg.operation==='guidance' && msg.input.action==='start') return failing ? {error:'Guidance target not found'} : {status:'waiting',ready:true};
        if(msg.operation==='guidance' && msg.input.action==='poll') return {status:'waiting',ready:true,interactions:1};
        if(msg.operation==='perception') return {screenshot:'data:image/png;base64,aW1hZ2U=',metadata:{}};
        return {ok:true};
    }},tabs:{get:async()=>({url:'https://figma.com',title:'Figma'})}};
    const tools=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    const schema=tools.waitForUserAction.inputSchema,options={abortSignal:new AbortController().signal};
    for(const selector of ['#a','#b']) await tools.waitForUserAction.execute(schema.parse({selector,instruction:'Draw a frame'}),options);
    failing=false;
    const result=await tools.waitForUserAction.execute(schema.parse({region:{x:100,y:100,width:400,height:300},event:'pointerup',instruction:'Draw a frame',checkAfterMs:3000}),options);
    assert.equal(result.status,'visualCheck');assert.equal(result.trigger,'interactionPause');assert.equal(result.actionObserved,null);assert.ok(result.screenshot);
});

test('agent gestures pause user input, let announced agent input through, and show a corner indicator',()=>{
    const f=fixture();
    f.run({action:'agentLock',locked:true});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.lockPill.hidden,false);assert.equal(state.lockTitle.textContent,'Stop Sloth');assert.equal(state.agentGlow.hidden,false);
    f.run({action:'cursor',method:'Input.dispatchMouseEvent',params:{type:'mousePressed',x:230,y:150}});
    assert.equal(f.fire('mousedown',f.target,true,{clientX:230,clientY:150}).defaultPrevented,false);
    assert.equal(f.fire('mousedown',f.target,true,{clientX:40,clientY:500}).defaultPrevented,true);
    f.run({action:'cursor',method:'Input.dispatchKeyEvent',params:{type:'keyDown',key:'o',code:'KeyO'}});
    assert.equal(f.fire('keydown',f.target,true,{key:'o',code:'KeyO'}).defaultPrevented,false);
    assert.equal(f.fire('keydown',f.target,true,{key:'x',code:'KeyX'}).defaultPrevented,true);
    // Untrusted page script events are never the user's and are left alone.
    assert.equal(f.fire('mousedown',f.target,false,{clientX:40,clientY:500}).defaultPrevented,false);
    // Batched actions relock within the grace period without the indicator flashing.
    f.run({action:'agentLock',locked:false});
    assert.equal(state.lockPill.hidden,false);assert.equal(state.agentLocked,true);
    f.run({action:'agentLock',locked:true});assert.equal(state.lockPill.hidden,false);
    f.run({action:'agentLock',locked:false});
    f.timers.get(state.agentLockTimer).fn();
    assert.equal(state.lockPill.hidden,true);assert.equal(state.agentGlow.hidden,true);
    assert.equal(f.fire('mousedown',f.target,true,{clientX:40,clientY:500}).defaultPrevented,false);
});

test('the stop button stays clickable during an agent gesture and asks the panel to stop the run',()=>{
    const sent=[];
    const f=fixture({chrome:{runtime:{sendMessage:msg=>{sent.push(msg);return Promise.resolve();}}}});
    f.run({action:'agentLock',locked:true});
    const state=f.window.__tamperSlothGuidance;
    // Clicks on the button reach the closed root retargeted to the host and are let through.
    assert.equal(f.fire('click',state.host,true,{clientX:400,clientY:570}).defaultPrevented,false);
    state.lockPill.listeners.click();
    assert.deepEqual(sent.map(m=>m.type),['AGENT_STOP_REQUESTED']);
    assert.equal(state.agentLocked,false);assert.equal(state.lockPill.hidden,true);assert.equal(state.agentGlow.hidden,true);
});

test('escape hands control back during an agent gesture, and the lock has a watchdog',()=>{
    const f=fixture();
    f.run({action:'agentLock',locked:true});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(f.fire('keydown',f.target,true,{key:'Escape'}).defaultPrevented,true);
    assert.equal(state.agentLocked,false);assert.equal(state.lockPill.hidden,true);
    assert.equal(f.fire('click',f.target,true,{clientX:40,clientY:500}).defaultPrevented,false);
    f.run({action:'agentLock',locked:true});
    f.timers.get(state.agentLockTimer).fn();
    assert.equal(state.agentLocked,false);
});

test('unlocking does not create the overlay on a page that has none',()=>{
    const f=fixture();
    assert.equal(f.run({action:'agentLock',locked:false}).ok,true);
    assert.equal(f.window.__tamperSlothGuidance,undefined);
});

test('off-screen guidance targets scroll into view before drawing',()=>{
    const f=fixture();let scrolled=0;
    f.target.scrollIntoView=()=>{scrolled++;f.target.box.y=280;};
    f.target.box.y=1400;
    f.run({action:'draw',kind:'bracket',selector:'#target',id:'below'});
    assert.equal(scrolled,1);assert.equal(f.window.__tamperSlothGuidance.marks.get('below').currentBox.y,280);
    f.run({action:'draw',kind:'bracket',selector:'#target',id:'visible'});
    assert.equal(scrolled,1,'visible targets do not scroll');
    f.window.scrollX=0;f.window.scrollY=0;
    f.window.scrollBy=({left,top})=>{f.window.scrollX+=left;f.window.scrollY+=top;};
    f.run({action:'draw',kind:'rectangle',box:{x:100,y:1500,width:50,height:20},id:'box'});
    assert.deepEqual({...f.window.__tamperSlothGuidance.marks.get('box').box},{x:100,y:290,width:50,height:20});
    const started=f.run({action:'start',id:'region',region:{x:300,y:2000,width:40,height:40},event:'click',instruction:'Pick it',timeoutMs:1000});
    assert.equal(started.status,'waiting');
    assert.deepEqual({...f.window.__tamperSlothGuidance.marks.get('__step').box},{x:300,y:280,width:40,height:40});
    f.fire('pointerdown',f.expected,true,{clientX:320,clientY:300});
    assert.equal(f.run({action:'poll',id:'region'}).status,'completed');
});

test('an overlay left by an older build is replaced, not reused',()=>{
    const f=fixture();
    f.run({action:'draw',id:'old',kind:'rectangle',selector:'#target'});
    const stale=f.window.__tamperSlothGuidance;
    // An overlay from before an extension reload carries no version, or an older one.
    delete stale.version;
    f.run({action:'draw',id:'new',kind:'rectangle',selector:'#target'});
    const state=f.window.__tamperSlothGuidance;
    assert.notEqual(state,stale);
    assert.equal(stale.host.removed,true);
    assert.deepEqual([...state.marks.keys()],['new']);
});

test('guidance joins the top layer and rises above modals and popovers the page opens later',()=>{
    const f=fixture();
    f.run({action:'draw',id:'a',kind:'rectangle',selector:'#target'});
    const state=f.window.__tamperSlothGuidance,host=state.host;
    assert.equal(host.attrs.popover,'manual');
    let open=false;const shown=[];
    host.matches=selector=>selector===':popover-open' && open;
    host.showPopover=()=>{open=true;shown.push('show');};host.hidePopover=()=>{open=false;shown.push('hide');};
    const dialog=new (host.constructor)('dialog');
    f.fire('toggle',dialog,true,{target:dialog,newState:'open'});
    assert.deepEqual(shown,['show']);
    // Re-showing moves an already open overlay to the top of the top layer.
    f.fire('toggle',dialog,true,{target:dialog,newState:'open'});
    assert.deepEqual(shown,['show','hide','show']);
    // Closing page popovers, and the overlay's own toggles, leave it alone.
    f.fire('toggle',dialog,true,{target:dialog,newState:'closed'});
    f.fire('toggle',host,true,{target:host,newState:'open'});
    assert.deepEqual(shown,['show','hide','show']);
    f.run({action:'dispose'});
    f.fire('toggle',dialog,true,{target:dialog,newState:'open'});
    assert.deepEqual(shown,['show','hide','show']);
});

test('a full-page canvas step marks a visible drawing area instead of outlining the viewport edges',()=>{
    const f=fixture();
    const canvas=f.document.createElement('canvas');canvas.localName='canvas';canvas.box={x:0,y:0,width:800,height:600};
    f.elements.set('canvas.interactive',canvas);
    const started=f.run({action:'start',id:'square',selector:'canvas.interactive',event:'pointerup',instruction:'Drag out a square',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('__step');
    assert.equal(JSON.stringify(started.guideArea),JSON.stringify({x:310,y:210,width:180,height:180}));
    assert.equal(mark.kind,'rectangle');assert.equal(mark.lineStyle,'dashed');assert.equal(mark.selector,undefined);
    assert.equal(mark.group.attrs.transform,'translate(310,210)');
    f.fire('pointerup',canvas);
    assert.equal(f.run({action:'poll',id:'square'}).status,'completed');
    // A measured region with the selector places the area; small canvases keep their outline.
    f.run({action:'start',id:'back',selector:'canvas.interactive',region:{x:400,y:150,width:120,height:120},event:'pointerup',instruction:'Draw the back square',timeoutMs:1000});
    assert.equal(state.marks.get('__step').group.attrs.transform,'translate(400,150)');
    canvas.box={x:20,y:20,width:200,height:100};
    f.run({action:'start',id:'small',selector:'canvas.interactive',event:'pointerup',instruction:'Pick a color',timeoutMs:1000});
    assert.equal(state.marks.get('__step').kind,'highlight');
});

test('an action whose expected change never comes hands back once the page settles',()=>{
    const f=fixture();
    f.run({action:'start',id:'toggle',selector:'#target',event:'click',instruction:'Open the menu',expectedSelector:'#expected',timeoutMs:60000});
    f.fire('click');
    const state=f.window.__tamperSlothGuidance,check=[...f.intervals.values()].at(-1);
    check();assert.equal(f.run({action:'poll',id:'toggle'}).status,'waiting');
    state.wait.actedAt-=4500;state.lastMutation=Date.now();check();
    assert.equal(f.run({action:'poll',id:'toggle'}).status,'waiting','a page still changing keeps the wait');
    state.lastMutation=0;check();
    const result=f.run({action:'poll',id:'toggle'});
    assert.equal(result.status,'unconfirmed');assert.equal(result.actionObserved,true);
});

test('an unconfirmed action returns page evidence without counting as an observer failure',async()=>{
    const f=timedToolFixture(()=>({status:'unconfirmed',actionObserved:true,hint:'settled'}));
    const result=await f.run({selector:'#target',expectedSelector:'#expected',instruction:'Open the menu'});
    assert.equal(result.status,'needsReview');assert.equal(result.observationPhase,'actedUnconfirmed');assert.equal(result.actionObserved,true);
    assert.ok(result.screenshot);assert.match(result.hint,/Do not wait for the same condition again/);
    assert.doesNotMatch(result.hint,/fall back to coordinates/);
});

test('a step that never reports ready still gets prompt progress checks',async()=>{
    const f=timedToolFixture(()=>({status:'waiting',ready:false,interactions:1,actionObserved:false}),{status:'waiting',ready:false});
    const result=await f.run({selector:'#target',instruction:'Open the menu'});
    assert.equal(result.observationPhase,'interactionPause');assert.ok(f.elapsed()<=12000,`took ${f.elapsed()}ms`);
});

test('releasing the drawing guard starts the step clocks',()=>{
    const f=fixture();
    f.run({action:'start',id:'step',selector:'#target',event:'click',instruction:'Continue',timeoutMs:30000,idleTimeoutMs:5000});
    const state=f.window.__tamperSlothGuidance;
    state.setInputLocked(true);state.wait.waitingForDraw=true;clearTimeout(state.wait.timer);state.wait.timer=null;
    state.setInputLocked(false);
    assert.equal(state.wait.waitingForDraw,false);assert.ok([...f.timers.values()].some(timer=>timer.ms===30000));
});

test('a drag on a stacked canvas counts for the selected canvas, but a toolbar click over it does not',()=>{
    const f=fixture();
    const lower=f.document.createElement('canvas'),upper=f.document.createElement('canvas'),tool=f.document.createElement('button');
    lower.localName=upper.localName='canvas';lower.box=upper.box={x:0,y:0,width:800,height:600};
    f.elements.set('canvas.static',lower);
    f.run({action:'start',id:'square',selector:'canvas.static',event:'pointerup',instruction:'Drag out a square',timeoutMs:1000});
    f.fire('pointerup',tool,true,{clientX:400,clientY:20});
    assert.equal(f.run({action:'poll',id:'square'}).status,'waiting');
    f.fire('pointerup',upper,true,{clientX:420,clientY:330});
    assert.equal(f.run({action:'poll',id:'square'}).status,'completed');
});

test('a check-in after a missed action asks the model to judge the screenshot before asking',async()=>{
    const f=timedToolFixture(()=>({status:'waiting',ready:true,interactions:1,actionObserved:false}));
    const result=await f.run({selector:'canvas',event:'pointerup',instruction:'Drag out a square'});
    assert.equal(result.checkInAllowed,true);assert.match(result.hint,/First judge the screenshot/);
});

test('a canvas line step draws the stroke to make, and shape steps can show an ellipse area',()=>{
    const f=fixture();
    const canvas=f.document.createElement('canvas');canvas.localName='canvas';canvas.box={x:0,y:0,width:800,height:600};
    f.elements.set('canvas',canvas);
    const path=[{x:300,y:190},{x:380,y:135}];
    const started=f.run({action:'start',id:'edge',selector:'canvas',path,event:'pointerup',instruction:'Drag corner to corner',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('__step');
    assert.equal(mark.kind,'arrow');assert.equal(mark.lineStyle,'dashed');assert.equal(started.guideArea,undefined);
    assert.match(mark.shape.attrs.d,/^M0,0 L80,-55/);
    f.run({action:'start',id:'curve',selector:'canvas',path:[...path,{x:420,y:160}],event:'pointerup',instruction:'Trace the curve',timeoutMs:1000});
    assert.equal(state.marks.get('__step').kind,'freehand');
    f.run({action:'start',id:'circle',selector:'canvas',region:{x:100,y:100,width:150,height:150},shape:'ellipse',event:'pointerup',instruction:'Draw a circle',timeoutMs:1000});
    assert.equal(state.marks.get('__step').kind,'ellipse');
});

test('a stroke path needs the canvas selector and cannot be mixed with a shape area',async()=>{
    const f=timedToolFixture(()=>({status:'completed'}));
    await assert.rejects(f.run({path:[{x:1,y:1},{x:9,y:9}],instruction:'Draw a line'}),/pass the canvas selector/);
    await assert.rejects(f.run({selector:'canvas',path:[{x:1,y:1},{x:9,y:9}],region:{x:0,y:0,width:5,height:5},instruction:'Draw a line'}),/not both/);
    assert.equal((await f.run({selector:'canvas',event:'pointerup',path:[{x:1,y:1},{x:9,y:9}],instruction:'Draw a line'})).status,'completed');
});

test('drawing step evidence carries contour boxes for measuring the next shape, other steps a plain screenshot',async()=>{
    for(const [event,mode] of [['pointerup','contours'],['click','plain']]) {
        const f=timedToolFixture(()=>({status:'waiting',ready:true,interactions:1,actionObserved:false}));
        await f.run({selector:'canvas',event,instruction:'Draw the back square'});
        assert.equal(f.calls.find(call=>call.operation==='perception').input.mode,mode);
    }
});

// Controls the user can operate, with ids so generated selectors resolve in the fake DOM.
function controlsFixture(specs) {
    const f=fixture(),all=[];
    const add=({tag='button',id,text='',attrs={},box={x:40,y:40,width:100,height:30}})=>{
        const el=f.document.createElement(tag);
        Object.assign(el,{localName:tag,id,textContent:text,box,isConnected:true});Object.assign(el.attrs,attrs);
        all.push(el);return el;
    };
    for(const spec of specs) add(spec);
    f.document.querySelectorAll=selector=>{
        if(selector==='*' || selector.includes('[role="button"]')) return all.filter(el=>!el.removed);
        const attribute=/^(\w*)\[([\w-]+)="(.*)"\]$/.exec(selector);
        if(attribute) return all.filter(el=>(!attribute[1] || el.localName===attribute[1]) && el.attrs[attribute[2]]===attribute[3]);
        return all.filter(el=>`#${el.id}`===selector || el.localName===selector);
    };
    return {...f,add,all};
}

test('generated selectors match only the target, never a hidden duplicate a click could land on',()=>{
    const f=controlsFixture([{text:'Frame',attrs:{'aria-label':'Frame'},box:{x:0,y:0,width:0,height:0}},{text:'Frame',attrs:{'aria-label':'Frame'}}]);
    f.run({action:'start',id:'frame',target:{name:'Frame'},event:'click',instruction:'Pick the Frame tool',timeoutMs:1000});
    const selector=f.window.__tamperSlothGuidance.marks.get('__step').selector;
    assert.notEqual(selector,'button[aria-label="Frame"]');
    assert.equal(f.document.querySelectorAll(selector).length,1);assert.equal(f.document.querySelectorAll(selector)[0],f.all[1]);
});

test('controls are listed as short refs, and a ref target is guided without any CSS',()=>{
    const f=controlsFixture([{id:'save',text:'Save'},{tag:'a',id:'billing',text:' Billing ',attrs:{href:'/billing'}},{id:'delete',text:'Delete',box:{x:40,y:2000,width:100,height:30}}]);
    const listed=f.run({action:'controls'});
    assert.equal(JSON.stringify(listed.controls),JSON.stringify(['c1 button "Save"','c2 link "Billing"']));
    assert.equal(listed.newControls,undefined);assert.equal(listed.url,'https://example.com');
    assert.equal(JSON.stringify(f.run({action:'controls',query:'delete'}).controls),JSON.stringify(['c3 button "Delete" [offscreen]']));
    const started=f.run({action:'start',id:'bill',target:{ref:'c2'},event:'click',instruction:'Open Billing',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(started.status,'waiting');assert.equal(started.target,'c2 link "Billing"');
    assert.equal(state.marks.get('__step').selector,'#billing');
    f.fire('click',f.all[1]);
    const result=f.run({action:'poll',id:'bill'});
    assert.equal(result.status,'completed');assert.equal(result.target,'c2 link "Billing"');
});

test('names and text resolve case-insensitively, ties prefer what the last step opened, and misses list candidates',()=>{
    const f=controlsFixture([{id:'menu',text:'Open user menu',attrs:{'aria-expanded':'false'}},{tag:'a',id:'repo-settings',text:'Settings'}]);
    f.run({action:'start',id:'open',target:{role:'button',name:'open user menu'},event:'click',instruction:'Open your menu',timeoutMs:1000});
    const state=f.window.__tamperSlothGuidance;
    assert.equal(state.marks.get('__step').selector,'#menu');
    f.add({tag:'a',id:'menu-settings',text:'Settings',box:{x:40,y:120,width:100,height:30}});
    f.fire('click',f.all[0]);
    assert.equal(f.run({action:'poll',id:'open'}).status,'completed');
    const listed=f.run({action:'controls',fresh:true});
    assert.equal(listed.newControls.length,1);assert.match(listed.newControls[0],/^c\d+ link "Settings"$/);
    assert.ok(listed.controls.some(line=>/link "Settings"/.test(line)));
    f.run({action:'start',id:'settings',target:{text:'Settings'},event:'click',instruction:'Open Settings',timeoutMs:1000});
    assert.equal(state.marks.get('__step').selector,'#menu-settings');
    // Once both were on screen at the step start, neither is new, so the name alone is ambiguous.
    assert.throws(()=>f.run({action:'draw',id:'again',target:{text:'Settings'}}),/ambiguous: 2 controls match "Settings"; pass one ref\. Candidates: c\d+ link "Settings"; c\d+ link "Settings"/);
    assert.throws(()=>f.run({action:'draw',id:'none',target:{text:'Emails'}}),/target not found: no control is named "Emails"\. Candidates: c\d+/);
    assert.throws(()=>f.run({action:'draw',id:'old',target:{ref:'c99'}}),/c99 is not a control on this page/);
});

test('a completion condition without a selector applies to the step target itself',()=>{
    const f=controlsFixture([{id:'menu',text:'Account',attrs:{'aria-expanded':'true'}}]);
    const done=f.run({action:'start',id:'a',target:{text:'Account'},completion:{state:'expanded'},event:'click',instruction:'Open Account',timeoutMs:1000});
    assert.equal(done.alreadySatisfied,true);assert.equal(done.proof.selector,'#menu');
    f.all[0].attrs['aria-expanded']='false';
    const waiting=f.run({action:'start',id:'b',target:{text:'Account'},completion:{state:'expanded'},event:'click',instruction:'Open Account',timeoutMs:1000});
    assert.equal(waiting.status,'waiting');
    f.all[0].attrs['aria-expanded']='true';[...f.intervals.values()].at(-1)();
    const result=f.run({action:'poll',id:'b'});
    assert.equal(result.status,'completed');assert.equal(result.proof.state,'expanded');
});

test('errors raised in the page come back with their reason instead of "unavailable"',async()=>{
    const f=fixture();
    assert.equal(f.run({action:'draw',id:'gone',selector:'#missing',reportErrors:true}).guidanceError,'Guidance target not found');
    const calls=[];
    const chrome={storage:{session:{set:async()=>{}}},runtime:{getURL:path=>path},
        scripting:{executeScript:async options=>{calls.push(options.args[0]);return [{result:{guidanceError:'Guidance selector is ambiguous (3 matches)'}}];}}};
    const {runPageGuidance}=createLoader({globals:{chrome}})('src/background/pageGuidance.ts');
    await assert.rejects(runPageGuidance(7,{action:'start'}),/ambiguous \(3 matches\)/);
    assert.equal(calls[0].reportErrors,true);
});

test('an agent action reports what it changed against the page just before it, and refs resolve to unique selectors',()=>{
    const f=controlsFixture([{id:'menu',text:'Open menu'},{id:'email',tag:'input',text:'',attrs:{'aria-label':'Email'}}]);
    // Live regions are not controls; dialogs and invalid fields are absent here.
    const base=f.document.querySelectorAll,live=el=>['status','alert'].includes(el.attrs.role);
    f.document.querySelectorAll=selector=>selector.includes('[role="status"]') ? f.all.filter(live)
        : selector.includes('dialog') || selector.includes('aria-invalid') ? [] : base(selector).filter(el=>!live(el));
    // A new document has no baseline: the report hands over its controls instead.
    const fresh=f.run({action:'changes'});
    assert.equal(fresh.page.url,'https://example.com');assert.ok(fresh.controls.some(line=>/button "Open menu"/.test(line)));
    f.run({action:'cue',selector:'#menu',cue:'click',baseline:true});
    assert.deepEqual(JSON.parse(JSON.stringify(f.run({action:'changes'}))),{},'Nothing changed, nothing to report');
    f.add({tag:'a',id:'profile',text:'Profile',box:{x:40,y:120,width:100,height:30}});
    f.add({tag:'div',id:'toast',text:' Saved ',attrs:{role:'status'}});
    const report=f.run({action:'changes'});
    assert.equal(report.newControls.length,1);assert.match(report.newControls[0],/^c\d+ link "Profile"/);
    assert.deepEqual([...report.messages],['Saved']);assert.equal(report.url,undefined);
    const ref=report.newControls[0].split(' ')[0];
    const resolved=f.run({action:'resolveRef',ref});
    assert.equal(resolved.selector,'#profile');assert.equal(resolved.name,'Profile');
    assert.throws(()=>f.run({action:'resolveRef',ref:'c99'}),/c99 is not a control on this page/);
});

test('the overlay is injected once per build; later calls run the installed copy',async()=>{
    const f=fixture(),calls=[],writes=[];
    const chrome={storage:{session:{set:async value=>{writes.push(value);}}},runtime:{getURL:path=>path},
        scripting:{executeScript:async ({func,args})=>{calls.push(func.name);return [{result:func(...args)}];}}};
    const page=createLoader({globals:{chrome,window:f.window,document:f.document,location:{href:'https://example.com'},innerWidth:800,innerHeight:600,
        getComputedStyle:()=>({visibility:'visible'}),matchMedia:()=>({matches:true}),requestAnimationFrame:fn=>{fn();return 0;},cancelAnimationFrame:()=>{},
        MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}unobserve(){}disconnect(){}},sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}}}})('src/background/pageGuidance.ts');
    await page.runPageGuidance(7,{action:'agentLock',locked:true});
    await page.runPageGuidance(7,{action:'agentLock',locked:false});
    await page.runPageGuidance(7,{action:'cursor',method:'Input.dispatchMouseEvent',params:{type:'mouseMoved',x:1,y:1}});
    assert.deepEqual(calls,['runInstalledGuidance','pageGuidance','runInstalledGuidance','runInstalledGuidance']);
    assert.equal(writes.length,1,'The overlay flag is written once per tab');
    // An overlay left by another build (an extension reload) is rebuilt with the full script.
    f.window.__tamperSlothGuidance.build='older-build';
    await page.runPageGuidance(7,{action:'agentLock',locked:false});
    assert.deepEqual(calls.slice(4),['runInstalledGuidance','pageGuidance']);
    await page.runPageGuidance(7,{action:'dispose'});
    await page.runPageGuidance(7,{action:'agentLock',locked:true});
    assert.equal(writes.length,2,'Disposing forgets the flag, so the next overlay is recorded again');
});

test('the browser service keeps every guidance field the tools send',()=>{
    const {browserSchemas}=createLoader()('src/chat/lib/browserSchemas.ts');
    const parsed=browserSchemas.guidance.parse({action:'start',tabId:7,target:{ref:'c4'},path:[{x:1,y:2},{x:3,y:4}],shape:'ellipse',completion:{state:'expanded'}});
    assert.equal(parsed.target.ref,'c4');assert.equal(parsed.path.length,2);assert.equal(parsed.shape,'ellipse');assert.equal(parsed.completion.state,'expanded');
    assert.throws(()=>browserSchemas.guidance.parse({action:'start',target:{role:'button'}}),/ref, role\+name, or text/);
    const tools=createLoader()('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{});
    assert.equal('target' in tools.annotatePage.inputSchema.shape,true);assert.equal('query' in tools.annotatePage.inputSchema.shape,false);
});

test('a completed step hands over the controls it opened once the page settles',async()=>{
    const messages=[];let elapsed=0;
    const listings=()=>messages.filter(msg=>msg.input.action==='controls').length;
    const chrome={runtime:{sendMessage:async msg=>{
        messages.push(msg);
        if(msg.input.action==='start') return {status:'waiting',ready:true};
        if(msg.input.action==='poll') return {status:'completed',actionObserved:true,target:'c3 button "Open menu"'};
        if(msg.input.action==='controls') return {newControls:['c7 menuitem "Settings"'],controls:['c3 button "Open menu" [expanded]'],url:'u',title:'t',quietMs:listings()===1 ? 50 : 400};
        return {ok:true};
    }},tabs:{get:async()=>({url:'https://example.com',title:'Page'})}};
    const load=createLoader({globals:{chrome,Date:class extends Date {static now(){return elapsed;}},setTimeout:(fn,ms)=>{elapsed+=ms;queueMicrotask(fn);return 0;}}});
    const tool=load('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{}).waitForUserAction;
    const result=await tool.execute(tool.inputSchema.parse({target:{ref:'c3'},instruction:'Open the menu'}),{abortSignal:new AbortController().signal});
    assert.equal(messages.find(msg=>msg.input.action==='start').input.target.ref,'c3');
    assert.equal(result.status,'completed');assert.equal(result.newControls[0],'c7 menuitem "Settings"');assert.equal(result.controls.length,1);
    assert.equal(result.quietMs,undefined);assert.equal(result.title,undefined);assert.equal(listings(),2,'a page still changing is listed again');
    assert.match(result.hint,/guide the next step with one of their refs/);
});

test('a target that does not resolve returns its candidates without a screenshot',async()=>{
    const operations=[];
    const chrome={runtime:{sendMessage:async msg=>{
        operations.push(msg.operation);
        if(msg.input.action==='start') return {error:'Guidance target is ambiguous: 2 controls match "Settings"; pass one ref. Candidates: c2 link "Settings" in nav; c9 menuitem "Settings" in menu'};
        return {ok:true};
    }},tabs:{get:async()=>({url:'https://example.com',title:'Page'})}};
    const tool=createLoader({globals:{chrome}})('src/chat/lib/browserTools.ts').createBrowserTools(()=>7,()=>{}).waitForUserAction;
    const result=await tool.execute(tool.inputSchema.parse({target:{text:'Settings'},instruction:'Open Settings'}),{abortSignal:new AbortController().signal});
    assert.equal(result.status,'needsReview');assert.equal(result.observationPhase,'notStarted');
    assert.match(result.reason,/c9 menuitem "Settings" in menu/);assert.match(result.hint,/Pick the intended ref/);
    assert.equal(result.screenshot,undefined);assert.equal(operations.includes('perception'),false);
});

const textField=f=>{f.target.localName='input';f.target.attrs.type='email';return f;};

test('a typing step keeps its guide and tip through the click in and every keystroke, and ends on Enter',()=>{
    const f=textField(fixture());
    f.run({action:'start',id:'email',selector:'#target',event:'input',instruction:'Type your work email',timeoutMs:20000});
    const state=f.window.__tamperSlothGuidance;
    f.fire('pointerdown');f.fire('click');f.fire('focusin');
    assert.ok(state.marks.has('__step'));
    const focused=f.run({action:'poll',id:'email'});
    assert.equal(focused.status,'waiting');assert.equal(focused.typing,true,'a focused field counts as typing before the first key');
    f.fire('input');f.fire('input');
    assert.ok(state.marks.has('__step'));assert.equal(state.cursorBody.hidden,false);
    assert.equal(f.run({action:'poll',id:'email'}).status,'waiting');
    f.fire('keydown',f.target,true,{key:'Enter'});
    assert.equal(f.run({action:'poll',id:'email'}).status,'completed');assert.equal(state.marks.has('__step'),false);
});

test('a typing step also ends when the user leaves the field after typing, or pauses',()=>{
    const left=textField(fixture());
    left.run({action:'start',id:'name',selector:'#target',event:'click',instruction:'Type your name',timeoutMs:20000});
    left.fire('focusin');left.fire('focusout');
    assert.equal(left.run({action:'poll',id:'name'}).status,'waiting','leaving before typing is not done');
    left.fire('focusin');left.fire('input');left.fire('focusout');
    assert.equal(left.run({action:'poll',id:'name'}).status,'completed');
    const paused=textField(fixture());
    paused.run({action:'start',id:'note',selector:'#target',event:'input',instruction:'Type a note',timeoutMs:20000});
    paused.fire('input');
    const state=paused.window.__tamperSlothGuidance,check=[...paused.intervals.values()].at(-1);
    check();assert.equal(paused.run({action:'poll',id:'note'}).status,'waiting');
    state.wait.lastInput-=5000;check();
    assert.equal(paused.run({action:'poll',id:'note'}).status,'completed');
});

test('pauses between keystrokes never trigger a progress check that would clear the guide',async()=>{
    const f=timedToolFixture(now=>now>=9000 ? {status:'completed',actionObserved:true} : {status:'waiting',ready:true,interactions:1,typing:true});
    const result=await f.run({selector:'#email',event:'input',instruction:'Type your work email'});
    assert.equal(result.status,'completed');assert.equal(f.calls.some(call=>call.operation==='perception'),false);
});
