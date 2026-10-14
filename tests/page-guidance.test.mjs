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

test('sketch strokes are deterministic across renders and highlights use bounded clipped hatching',()=>{
    const f=fixture();
    for(const kind of ['rectangle','ellipse','bracket','arrow','highlight','freehand']) {
        f.run({action:'draw',id:kind,kind,selector:'#target',points:[{x:80,y:100},{x:140,y:120},{x:190,y:110}],lineStyle:'dashed'});
        const state=f.window.__tamperSlothGuidance,mark=state.marks.get(kind),path=mark.shape.attrs.d;
        assert.ok(path.includes('C'));assert.doesNotMatch(path,/NaN|Infinity/);
        assert.notEqual(mark.echo.attrs.d,path);
        assert.equal(mark.shape.attrs['stroke-dasharray'],kind==='ellipse' ? '8 5 6 6 10 4' : undefined);
        assert.equal(mark.echo.style.display,'none');
        state.render();assert.equal(mark.shape.attrs.d,path);
        f.target.box.x+=30;state.render();assert.equal(mark.shape.attrs.d,path);
        if(kind==='highlight') {
            assert.ok(mark.clipShape.attrs.d.endsWith(' Z'));assert.match(mark.hatch.attrs['clip-path'],/^url\(#ts-hatch-/);
            assert.ok(mark.hatch.attrs.d.includes('C'));
            assert.ok(mark.hatch.attrs.d.length<15000);assert.equal(mark.hatch.attrs.opacity,'.2');
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
    assert.equal(result.alreadySatisfied,true);assert.deepEqual(calls,['start']);
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
    const label=createLoader()('src/chat/lib/guidanceStatus.ts').guidanceStatusLabel;
    assert.equal(label({status:'needsReview',observationPhase:'timedOut',actionObserved:false,idle:true}),'No activity yet; still watching');
    assert.equal(label({status:'needsReview',observationPhase:'timedOut',actionObserved:false,idle:true,checkInAllowed:true}),'No activity; checking in');
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
    // The first idle round must re-wait; a later one may check in and end the turn.
    guard.observe('waitForUserAction',{status:'needsReview',idle:true,checkInAllowed:false});
    assert.equal(guard.holding(),true);
    guard.observe('waitForUserAction',{status:'needsReview',idle:true,checkInAllowed:true});
    assert.equal(guard.holding(),false);
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

test('an untouched step reports no action and status labels never imply progress during recovery',()=>{
    const f=fixture();
    f.run({action:'start',id:'untouched',selector:'#target',event:'click',instruction:'Select Rectangle',timeoutMs:1000});
    [...f.timers.values()].find(timer=>timer.ms===1000).fn();
    assert.equal(f.run({action:'poll',id:'untouched'}).actionObserved,false);
    const label=createLoader()('src/chat/lib/guidanceStatus.ts').guidanceStatusLabel;
    assert.equal(label({status:'needsReview',observationPhase:'notStarted',actionObserved:null}),'Could not watch this step');
    assert.equal(label({status:'needsReview',observationPhase:'timedOut',actionObserved:false}),'No action detected');
    assert.equal(label({status:'needsReview',actionObserved:true}),'Action detected; outcome unconfirmed');
    assert.equal(label({status:'needsReview',actionObserved:null}),'Action check interrupted');
    assert.equal(label({status:'completed',alreadySatisfied:true}),'Step already complete');
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
    const middle=[...f.frames][0];f.frames.delete(middle[0]);middle[1](performance.now()+250);
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
    for(const timer of [...f.timers.values()]) if(timer.ms===45)timer.fn();
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
    assert.match(state.cursor.innerHTML,/fill="black"/);assert.match(state.cursor.innerHTML,/stroke="#ffffff"/);
    assert.match(state.cursor.innerHTML,/M41\.1621 6\.11426C50\.3285/);
    state.moveCursor({x:300,y:590},false,true);
    assert.equal(state.cursorTag.style.top,'34px');
    assert.ok(state.cursorPoint.y+34+state.cursorTag.offsetHeight<=588);
    assert.equal(state.cursorTag.style.width,'');
    f.run({action:'remove',id:'compact'});assert.equal(state.cursorBody.hidden,true);assert.equal(state.cursorTag.hidden,true);
});

test('a zero-progress first frame preserves the move command so later strokes paint live',()=>{
    const f=fixture({animate:true});
    f.run({action:'draw',id:'zero-frame',kind:'rectangle',selector:'#target'});
    const state=f.window.__tamperSlothGuidance,mark=state.marks.get('zero-frame');
    const tick=time=>{const [id,frame]=[...f.frames][0];f.frames.delete(id);frame(time);};
    tick(0);
    assert.equal(mark.shape.attrs.d,' M0,0');
    tick(performance.now()+250);
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
    const frame=[...f.frames][0];f.frames.delete(frame[0]);frame[1](performance.now()+250);
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
    assert.equal(mark.drawn,true);assert.equal(mark.group.style.mask,undefined);assert.equal(mark.hatch.attrs.stroke,'#a8bd85');
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
    assert.equal(mark.drawn,true);assert.ok(mark.shape.attrs.d.includes('C'));
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
    const label=createLoader()('src/chat/lib/guidanceStatus.ts').guidanceStatusLabel;
    assert.equal(label({status:'needsReview',observationPhase:'navigated',actionObserved:true}),'Step observed; page changed');
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
    assert.equal(f.run({action:'poll',id:'frame'}).interactions,1);
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
    await assert.rejects(tools.waitForUserAction.execute({...regional,selector:'#frame'},options),/either selector or region/);
    const result=await tools.waitForUserAction.execute(regional,options);
    assert.equal(result.status,'visualCheck');assert.equal(result.trigger,'regionAction');assert.equal(result.actionObserved,true);
    assert.ok(result.screenshot);assert.match(result.hint,/Judge from this screenshot/);
    assert.deepEqual(starts.at(-1).region,regional.region);
    const label=createLoader()('src/chat/lib/guidanceStatus.ts').guidanceStatusLabel;
    assert.equal(label(result),'Click seen; checking screenshot');
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
