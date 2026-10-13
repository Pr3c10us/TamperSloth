/** Serialized into Chrome's isolated world; keep every dependency inside this function. */
export function pageGuidance(args: any): any {
    const win = window as any;
    let state = win.__tamperSlothGuidance;
    if (!state && ['poll', 'cancel', 'clear', 'dispose'].includes(args.action)) return {status: 'lost', hint: 'Page changed; inspect it and re-anchor the next step.'};
    if (!state) {
        const host = document.createElement('div');
        host.id = 'tampersloth-guidance';
        host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
        const root = host.attachShadow({mode: 'closed'});
        // Load the same bundled faces as the side panel, without depending on the site's fonts.
        if (args.assets && typeof FontFace !== 'undefined') {
            for (const [family,url,descriptors] of [
                ['TamperSloth Geist',args.assets.sans,{weight:'100 900'}],
                ['TamperSloth Instrument',args.assets.heading,{style:'italic',weight:'400'}],
            ] as const) {
                const face=new FontFace(family,`url("${url}")`,descriptors);
                void face.load().then(loaded=>document.fonts.add(loaded)).catch(()=>{});
            }
        }
        const style = document.createElement('style');
        style.textContent = `
            :host{pointer-events:none} *{box-sizing:border-box;pointer-events:none}
            svg{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}
            .mark{animation:arrive .22s ease-out;filter:drop-shadow(0 0 1px #faf8f2) drop-shadow(0 0 1px #faf8f2)}
            .label,.cursor-tag{font:400 12px/1.5 'TamperSloth Geist','Geist Variable',system-ui,sans-serif;-webkit-font-smoothing:antialiased;border-radius:6px;box-shadow:0 2px 8px #0f0f0e14}
            .label{position:fixed;max-width:min(240px,calc(100vw - 24px));overflow-wrap:anywhere;background:#0f0f0e;color:#f6f4ef;padding:6px 12px;outline:1px solid #f6f4ef33;animation:arrive 160ms cubic-bezier(.22,.61,.36,1)}
            .sr-status{position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
            .cursor{position:fixed;left:0;top:0;width:25px;height:30px;transition:transform 90ms linear;filter:drop-shadow(0 1px 2px #0f0f0e26)}
            .cursor svg{position:static;overflow:visible}
            .cursor-tag{position:absolute;left:22px;top:22px;display:flex;align-items:center;gap:5px;white-space:nowrap;padding:3px 7px;background:#faf8f2;color:#0f0f0e;border:1px solid #c9c2b0;font:italic 400 14px/1.2 'TamperSloth Instrument','Instrument Serif',Georgia,serif;letter-spacing:-.02em}
            .cursor-tag img{width:12px;height:12px;object-fit:contain}
            .ripple{position:fixed;width:30px;height:30px;border:1.5px solid #3f4a2a;border-radius:50%;box-shadow:0 0 0 2px #f6f4ef;animation:pulse .45s cubic-bezier(.22,.61,.36,1) forwards}
            @keyframes arrive{from{opacity:0}to{opacity:1}} @keyframes pulse{to{transform:scale(1.9);opacity:0}}
            @media(prefers-reduced-motion:reduce){.mark,.ripple{animation:none}.cursor{transition:none}}
        `;
        root.append(style);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true'); root.append(svg);
        // Waiting is shown in chat; retain announcements for assistive technology only.
        const status = document.createElement('div'); status.className = 'sr-status'; status.hidden = true;
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
        const cursor = document.createElement('div'); cursor.className = 'cursor'; cursor.hidden = true;
        cursor.innerHTML = '<svg viewBox="0 0 25 30" aria-hidden="true"><path d="M3 3L21 16L12 18L8 27Z" fill="#f6f4ef" stroke="#f6f4ef" stroke-width="4" stroke-linejoin="round"/><path d="M3 3L21 16L12 18L8 27Z" fill="#0f0f0e" stroke="#0f0f0e" stroke-width="1.5" stroke-linejoin="round"/></svg><div class="cursor-tag"><span>Sloth</span></div>';
        if(args.assets?.icon) {
            const logo=document.createElement('img');logo.src=args.assets.icon;logo.alt='';
            cursor.querySelector('.cursor-tag')!.prepend(logo);
        }
        root.append(cursor); document.documentElement.append(host);
        state = win.__tamperSlothGuidance = {host, root, svg, status, cursor, marks: new Map(), wait: null};
        state.brief = (text: string) => {
            const compact=text.replace(/^\s*Step\s+\d+\s*:\s*/i,'').replace(/\s+/g,' ').trim();
            if(compact.length<=90) return compact;
            const prefix=compact.slice(0,87);
            return prefix.slice(0,prefix.lastIndexOf(' ')>55 ? prefix.lastIndexOf(' ') : prefix.length)+'…';
        };
        // Measure wrapped text, then choose a clear space. Explicit placement is a preference,
        // never permission to cover a target. Hide the label if no safe space exists.
        state.place = (node: HTMLElement, box: any, protectedBoxes: any[], occupied: any[], preferred?: any, local=false) => {
            const width=node.offsetWidth, height=node.offsetHeight, margin=12, gap=16;
            const clamp=(p: any)=>({x:Math.max(margin,Math.min(innerWidth-width-margin,p.x)),y:Math.max(margin,Math.min(innerHeight-height-margin,p.y))});
            const candidates=[...(preferred ? [preferred] : []),
                {x:box.x,y:box.y-height-gap},{x:box.x+box.width+gap,y:box.y},
                {x:box.x,y:box.y+box.height+gap},{x:box.x-width-gap,y:box.y},
                ...(!local ? [{x:innerWidth-width-margin,y:margin},{x:innerWidth-width-margin,y:innerHeight-height-margin},
                {x:margin,y:margin},{x:margin,y:innerHeight-height-margin}] : [])].map(clamp);
            const overlap=(a: any,b: any,padding=0)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width+padding)-Math.max(a.x,b.x-padding))*Math.max(0,Math.min(a.y+a.height,b.y+b.height+padding)-Math.max(a.y,b.y-padding));
            const controls=Array.from(document.querySelectorAll('button,input,select,textarea,a[href],[role="button"],[role="menuitem"],[role="option"]')).slice(0,600).map(el=>el.getBoundingClientRect()).filter(b=>b.width && b.height);
            let best: any, score=Infinity;
            if(width<=innerWidth-margin*2 && height<=innerHeight-margin*2) for(const [index,p] of candidates.entries()) {
                const rect={...p,width,height};
                if(protectedBoxes.some(b=>overlap(rect,b,10)>0)) continue;
                const distance=Math.hypot(Math.max(box.x-rect.x-width,rect.x-box.x-box.width,0),Math.max(box.y-rect.y-height,rect.y-box.y-box.height,0));
                if(local && (distance>32 || occupied.some(b=>overlap(rect,b,4)>0))) continue;
                const cost=controls.reduce((sum,b)=>sum+overlap(rect,b,4),0)+occupied.reduce((sum: number,b: any)=>sum+overlap(rect,b,8)*3,0)+(local ? distance*10 : 0)+index;
                if(cost<score){best=rect;score=cost;}
            }
            node.style.visibility=best ? 'visible' : 'hidden';
            if(best){node.style.left=`${best.x}px`;node.style.top=`${best.y}px`;}
            return best;
        };
        state.message = (title: string, text: string) => {
            status.replaceChildren(); const strong = document.createElement('strong'); strong.textContent = title;
            status.append(strong, document.createTextNode(text)); status.hidden = false;
        };
        state.find = (selector: string) => {
            const matches: Element[] = [];
            const visit = (root: Document | ShadowRoot) => {
                matches.push(...Array.from(root.querySelectorAll(selector)));
                for (const el of root.querySelectorAll('*')) if (el.shadowRoot) visit(el.shadowRoot);
            };
            visit(document);
            if (matches.length !== 1) throw new Error(matches.length ? 'Guidance selector is ambiguous' : 'Guidance target not found');
            return matches[0];
        };
        state.sketch = (mark: any, box: any) => {
            const {width:w,height:h}=box;
            const path=(pass: number,dashed=mark.lineStyle==='dashed')=>{
                let seed=mark.seed ^ (pass*0x9e3779b9);
                const wobble=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)/4294967296-.5)*2;};
                const line=(a: any,b: any,move=true)=>{
                    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),rough=Math.min(3.5,len/8);
                    if(dashed && len>2) {
                        // Draw each dash as its own pencil stroke, instead of mechanically
                        // chopping a perfect SVG edge with stroke-dasharray.
                        let d='',offset=0;
                        const scale=Math.max(1,len/1600);
                        while(offset<len) {
                            const end=Math.min(len,offset+(6.5+(wobble()+1)*2.2)*scale);
                            const jitter=()=>wobble()*.65;
                            const sx=a.x+dx*offset/len+jitter(),sy=a.y+dy*offset/len+jitter();
                            const ex=a.x+dx*end/len+jitter(),ey=a.y+dy*end/len+jitter();
                            d+=`M${sx},${sy} C${sx+(ex-sx)*.33+jitter()},${sy+(ey-sy)*.33+jitter()} ${sx+(ex-sx)*.67+jitter()},${sy+(ey-sy)*.67+jitter()} ${ex},${ey} `;
                            offset=end+(4+(wobble()+1)*1.5)*scale;
                        }
                        return d;
                    }
                    return `${move ? `M${a.x},${a.y}` : ''} C${a.x+dx*.33+wobble()*rough},${a.y+dy*.33+wobble()*rough} ${a.x+dx*.67+wobble()*rough},${a.y+dy*.67+wobble()*rough} ${b.x},${b.y}`;
                };
                const chain=(points: any[],closed=false)=>points.slice(1).reduce((d,p,i)=>d+line(points[i],p,false),`M${points[0].x},${points[0].y}`)+(closed ? line(points.at(-1),points[0],false)+' Z' : '');
                if(mark.kind==='ellipse') {
                    const cx=w/2,cy=h/2,rx=w/2+5,ry=h/2+5,k=.5522848;
                    return `M${cx+rx},${cy} C${cx+rx+wobble()},${cy+ry*k} ${cx+rx*k},${cy+ry+wobble()} ${cx},${cy+ry} C${cx-rx*k},${cy+ry+wobble()} ${cx-rx+wobble()},${cy+ry*k} ${cx-rx},${cy} C${cx-rx+wobble()},${cy-ry*k} ${cx-rx*k},${cy-ry+wobble()} ${cx},${cy-ry} C${cx+rx*k},${cy-ry+wobble()} ${cx+rx+wobble()},${cy-ry*k} ${cx+rx},${cy} Z`;
                }
                if(['rectangle','highlight'].includes(mark.kind)) {
                    const corner=(x: number,y: number)=>({x:x+wobble(),y:y+wobble()});
                    return chain([corner(-5,-5),corner(w+5,-5),corner(w+5,h+5),corner(-5,h+5)],true);
                }
                if(mark.kind==='bracket') {
                    const corner=Math.min(17,Math.max(10,Math.min(w,h)/3));
                    return [
                        [{x:corner,y:-5},{x:-5,y:-5},{x:-5,y:corner}],
                        [{x:w-corner,y:-5},{x:w+5,y:-5},{x:w+5,y:corner}],
                        [{x:-5,y:h-corner},{x:-5,y:h+5},{x:corner,y:h+5}],
                        [{x:w+5,y:h-corner},{x:w+5,y:h+5},{x:w-corner,y:h+5}],
                    ].map(points=>chain(points)).join(' ');
                }
                if(mark.kind==='arrow') {
                    const a=mark.points?.[0] ? {x:mark.points[0].x-mark.box.x,y:mark.points[0].y-mark.box.y} : {x:Math.max(16-box.x,-65),y:Math.max(16-box.y,-35)};
                    const b=mark.points?.[1] ? {x:mark.points[1].x-mark.box.x,y:mark.points[1].y-mark.box.y} : {x:-8,y:h/2};
                    const angle=Math.atan2(b.y-a.y,b.x-a.x),head=Math.min(12,Math.hypot(b.x-a.x,b.y-a.y)/3);
                    return line(a,b)+line({x:b.x-head*Math.cos(angle-.5),y:b.y-head*Math.sin(angle-.5)},b)+line(b,{x:b.x-head*Math.cos(angle+.5),y:b.y-head*Math.sin(angle+.5)});
                }
                if(mark.kind==='freehand') return chain(mark.points.map((p: any)=>({x:p.x-mark.box.x,y:p.y-mark.box.y})));
                return '';
            };
            mark.group.setAttribute('transform',`translate(${box.x},${box.y})`);
            const d=path(0);mark.shape.setAttribute('d',d);mark.echo.setAttribute('d',path(1));
            if(mark.hatch) {
                mark.clipShape.setAttribute('d',path(0,false));
                const spacing=Math.max(10,(w+h)/150);let hatch='';
                let seed=mark.seed || 1;
                const jitter=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return ((seed>>>0)/4294967296-.5)*2;};
                for(let x=-h-5;x<w+10;x+=spacing*(1+jitter()*.12)) {
                    const endX=x+h+10;
                    hatch+=`M${x+jitter()},${h+5} C${x+(h+10)/3+jitter()*2},${h*.67} ${x+(h+10)*.67+jitter()*2},${h*.33} ${endX+jitter()},-5 `;
                }
                mark.hatch.setAttribute('d',hatch);
            }
        };
        state.render = () => {
            const boxes=new Map<any,any>();
            for(const mark of state.marks.values()) {
                const el=mark.selector ? (()=>{try{return state.find(mark.selector);}catch{return null;}})() : null;
                boxes.set(mark,mark.selector && !el ? null : el?.getBoundingClientRect() ?? mark.box);
            }
            const protectedBoxes=[...boxes.values()].filter(b=>b?.width && b?.height);
            const occupied: any[]=[];
            for (const mark of state.marks.values()) {
                const box=boxes.get(mark);
                mark.group.style.display = mark.selector && (!box?.width || !box?.height) ? 'none' : '';
                if(mark.label) mark.label.style.display=mark.group.style.display;
                if (!box || mark.group.style.display==='none') continue;
                state.sketch(mark,box);
                if (mark.label && !mark.label.hidden) {
                    mark.label.style.display = mark.group.style.display;
                    const placed=state.place(mark.label,box,protectedBoxes,occupied,mark.labelPosition,true);
                    if(placed) occupied.push(placed);
                }
            }
        };
        let scheduled = false;
        state.schedule = () => { if (!scheduled && state.marks.size) {scheduled = true; requestAnimationFrame(() => {scheduled = false; state.render();});} };
        window.addEventListener('scroll', state.schedule, true); window.addEventListener('resize', state.schedule);
        state.resize = new ResizeObserver(state.schedule);
        state.resize.observe(document.documentElement);
        state.resize.observe(status);
        state.mutations = new MutationObserver(state.schedule);
        state.mutations.observe(document.documentElement, {subtree:true,childList:true,attributes:true});
        const actionTypes=['click','input','change','submit','focusin','pointerup'];
        state.annotationListener=(event: Event)=>{
            if(!event.isTrusted) return;
            for(const mark of state.marks.values()) {
                if(!mark.selector) continue;
                let target;try{target=state.find(mark.selector);}catch{continue;}
                if(event.composedPath().includes(target)) {
                    mark.actions.add(event.type);
                    if(mark.label && (!state.wait || state.wait.result || event.type===state.wait.event)) mark.label.hidden=true;
                }
            }
        };
        state.remove = (id: string) => {
            const m=state.marks.get(id);
            if(m){clearTimeout(m.timer);m.group.remove();if(m.label) state.resize.unobserve(m.label);m.label?.remove();state.marks.delete(id);}
            if(!state.marks.size && state.annotationListening) {
                for(const type of actionTypes) document.removeEventListener(type,state.annotationListener,true);
                state.annotationListening=false;
            }
        };
        state.cue = (el: Element, action: string) => {
            const b=el.getBoundingClientRect();
            pageGuidance({action:'cursor',method:action==='type' ? 'Input.insertText' : 'Input.dispatchMouseEvent',params:{x:b.x+b.width/2,y:b.y+b.height/2,type:action==='click' ? 'mousePressed' : action==='scroll' ? 'mouseWheel' : 'mouseMoved'}});
        };
        state.finish = (result: any) => {
            const w = state.wait; if (!w || w.result) return;
            w.result = {...result, elapsedMs:Date.now()-w.started, unexpectedActions:w.unexpected, url:location.href};
            clearTimeout(w.timer); clearInterval(w.check);
            for (const type of [...actionTypes,'keydown']) document.removeEventListener(type,w.listener,true);
            for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);
            if(result.status==='completed') {status.hidden=true;}
            else state.message(result.status === 'timeout' ? 'Still here to help' : 'Guidance paused', result.hint ?? 'Guidance paused.');
            clearTimeout(state.statusTimer); state.statusTimer = setTimeout(() => {status.hidden=true;},5000);
        };
    }
    if(args.action==='dispose') {
        pageGuidance({action:'clear'});
        state.cursor.hidden=true;
        window.removeEventListener('scroll',state.schedule,true);window.removeEventListener('resize',state.schedule);
        state.host.remove();delete win.__tamperSlothGuidance;
        return {ok:true};
    }
    if (args.action === 'cue') {
        const el = args.selector ? document.querySelectorAll(args.selector)[args.index ?? 0] : document.activeElement;
        el?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
        const b = el?.getBoundingClientRect();
        return pageGuidance({action:'cursor',method:args.cue==='type' ? 'Input.insertText' : 'Input.dispatchMouseEvent',params:{x:b?.width ? b.x+b.width/2 : innerWidth/2,y:b?.height ? b.y+b.height/2 : innerHeight/2,type:args.cue==='scroll' ? 'mouseWheel' : args.cue==='click' ? 'mousePressed' : 'mouseMoved'}});
    }
    if (args.action === 'cursor') {
        const p = args.params ?? {}, type = p.type ?? '';
        let point = p.touchPoints?.[0] ?? (Number.isFinite(p.x) ? p : null);
        if (!point && /Key|insertText/.test(args.method)) {
            const box = document.activeElement?.getBoundingClientRect();
            if (box?.width && document.activeElement!==document.body && document.activeElement!==document.documentElement) {
                point = {x:box.right,y:box.top+box.height/2};
                pageGuidance({action:'draw',id:'__focus',kind:'bracket',box:{x:box.x,y:box.y,width:box.width,height:box.height},lifetimeMs:1000});
            }
        }
        if (point) {
            state.cursor.hidden=false; state.cursor.style.transform=`translate(${Math.max(0,Math.min(innerWidth-25,point.x))}px,${Math.max(0,Math.min(innerHeight-30,point.y))}px)`;
            state.cursor.querySelector('span').textContent = /Wheel/.test(type) ? 'Sloth · scroll' : /Key|insertText/.test(args.method) ? 'Sloth · typing' : p.buttons || /touch/.test(type) ? 'Sloth · drag' : 'Sloth';
            if (['mousePressed','touchStart'].includes(type)) {
                const ripple=document.createElement('div'); ripple.className='ripple'; ripple.style.left=`${point.x-15}px`; ripple.style.top=`${point.y-15}px`; state.root.append(ripple); setTimeout(()=>ripple.remove(),550);
            }
        }
        // Only the action cue expires; the cursor remains at its last position.
        clearTimeout(state.cursorTimer); state.cursorTimer=setTimeout(()=>{state.cursor.querySelector('span').textContent='Sloth';},1400);
        return {ok:true};
    }
    if (args.action === 'clear') {
        if (state.wait && !state.wait.result) state.finish({status:'cancelled',hint:'Guidance cleared.'});
        for (const id of [...state.marks.keys()]) state.remove(id);
        clearTimeout(state.cursorTimer); clearTimeout(state.statusTimer);
        state.resize.disconnect(); state.mutations.disconnect();
        state.cursor.querySelector('span').textContent='Sloth';
        state.status.hidden=true; return {ok:true};
    }
    if (args.action === 'remove') {state.remove(args.id); return {ok:true};}
    if (args.action === 'draw') {
        state.resize.observe(document.documentElement);
        state.resize.observe(state.status);
        state.mutations.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
        const id=args.id ?? crypto.randomUUID(); state.remove(id);
        if (state.marks.size >= 30) throw new Error('Clear an annotation before adding more (limit 30).');
        if (args.kind==='label' && !args.label) throw new Error('Label annotations require label text');
        if (args.kind==='freehand' && !args.points?.length) throw new Error('Freehand annotations require points');
        const el=args.selector ? state.find(args.selector) : null;
        const box=el?.getBoundingClientRect() ?? args.box;
        if (!box && !args.points?.length) throw new Error('Supply a selector, box, or path points');
        const ns='http://www.w3.org/2000/svg';
        const group=document.createElementNS(ns,'g'); group.setAttribute('class','mark');
        const shape=document.createElementNS(ns,'path'),echo=document.createElementNS(ns,'path');
        const color=({moss:'#3f4a2a',amber:'#92611c',sky:'#286d87',rose:'#994f64'} as any)[args.color ?? 'moss'];
        for(const stroke of [shape,echo]) {
            stroke.setAttribute('stroke',color);stroke.setAttribute('stroke-width',String((args.lineWidth ?? 2.5)*(stroke===echo ? .6 : .8)));
            stroke.setAttribute('stroke-linecap','round');stroke.setAttribute('stroke-linejoin','round');stroke.setAttribute('fill','none');
        }
        echo.setAttribute('opacity','.4');
        if(args.lineStyle==='dashed') echo.style.display='none';
        if(args.lineStyle==='dashed' && args.kind==='ellipse') shape.setAttribute('stroke-dasharray','8 5 6 6 10 4');
        let hatch,clipShape;
        if(args.kind==='highlight') {
            const defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath'),clipId=`ts-hatch-${crypto.randomUUID()}`;
            clip.setAttribute('id',clipId);clipShape=document.createElementNS(ns,'path');clip.append(clipShape);defs.append(clip);group.append(defs);
            hatch=document.createElementNS(ns,'path');hatch.setAttribute('stroke',color);hatch.setAttribute('stroke-width','1');hatch.setAttribute('opacity','.2');hatch.setAttribute('fill','none');hatch.setAttribute('clip-path',`url(#${clipId})`);group.append(hatch);
        }
        group.append(shape,echo); state.svg.append(group);
        let label: HTMLDivElement | undefined;
        if (args.label) {label=document.createElement('div'); label.className='label'; label.textContent=state.brief(args.label);label.setAttribute('aria-label',args.label); state.root.append(label);state.resize.observe(label);}
        let seed=2166136261;for(const char of id) seed=Math.imul(seed^char.charCodeAt(0),16777619);
        const mark={...args,seed,box:box ?? {x:args.points[0].x,y:args.points[0].y,width:0,height:0},group,shape,echo,hatch,clipShape,label,actions:new Set(),stepId:state.wait && !state.wait.result ? state.wait.id : undefined,timer:undefined as any};
        state.marks.set(id,mark);
        if(!state.annotationListening) {
            for(const type of ['click','input','change','submit','focusin','pointerup']) document.addEventListener(type,state.annotationListener,true);
            state.annotationListening=true;
        }
        state.render();
        if (args.lifetimeMs) mark.timer=setTimeout(()=>state.remove(id),args.lifetimeMs);
        return {ok:true,id};
    }
    if (args.action === 'start') {
        if (!args.id || !args.instruction) throw new Error('Step id and instruction are required');
        if (state.wait && !state.wait.result) state.finish({status:'cancelled',hint:'A new step replaced this step.'});
        const conditionMatches=(condition: any) => {
            let el: any;
            try {el=state.find(condition.selector);} catch(error) {
                // Ambiguity or invalid syntax is never proof that an element is absent.
                return condition.state==='absent' && String(error).includes('target not found');
            }
            if(condition.state==='absent') return false;
            if(condition.state==='checked') return el.checked===true || el.getAttribute('aria-checked')==='true';
            if(condition.state==='selected') return el.selected===true || el.getAttribute('aria-selected')==='true' || el.getAttribute('data-state')==='checked';
            if(condition.state==='pressed') return el.getAttribute('aria-pressed')==='true';
            const b=el.getBoundingClientRect();return b.width>0 && b.height>0 && getComputedStyle(el).visibility!=='hidden';
        };
        if(args.completion && conditionMatches(args.completion)) {
            for(const id of [...state.marks.keys()]) state.remove(id);
            clearTimeout(state.statusTimer);state.status.hidden=true;
            return {status:'completed',alreadySatisfied:true,proof:args.completion,url:location.href,
                hint:'The declared completion condition is already true. Inspect the current page and continue from the first unfinished step; do not repeat this action.'};
        }
        const target=args.selector ? state.find(args.selector) : null;
        if (args.event !== 'state' && !target) throw new Error('An action step requires a unique target selector');
        let alreadyActed=false;
        const retained=new Set(args.annotationIds ?? []);
        for(const [id,mark] of state.marks) {
            if(mark.selector===args.selector && mark.actions.has(args.event)) alreadyActed=true;
            if(retained.has(id)) {mark.stepId=args.id;}
            else state.remove(id);
        }
        clearTimeout(state.statusTimer);state.status.hidden=true;
        const matches = () => {
            if(args.completion) return conditionMatches(args.completion);
            if (!args.expectedSelector) return true;
            let el: any; try {el=state.find(args.expectedSelector);} catch {return args.expectedState==='absent';}
            if (args.expectedState==='absent') return false;
            if (args.expectedState==='checked') return el.checked === true || el.getAttribute('aria-checked')==='true';
            const b=el.getBoundingClientRect(); return b.width>0 && b.height>0 && getComputedStyle(el).visibility!=='hidden';
        };
        const w: any=state.wait={id:args.id,event:args.event,started:Date.now(),unexpected:0,acted:alreadyActed || args.event==='state',result:null,timer:null,check:null,listener:null};
        if(alreadyActed) for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);
        w.listener=(event:any)=> {
            if (!event.isTrusted) return;
            if (event.type==='keydown' && event.key==='Escape') {state.finish({status:'cancelled',hint:'Cancelled with Escape.'});return;}
            const hit=event.composedPath().includes(target);
            if (event.type===args.event && hit) {
                w.acted=true;
                // Remove the instruction immediately, even if its resulting state takes time.
                for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);
                if (matches()) state.finish({status:'completed'});
                else state.message('Checking the page','Waiting for the expected change');
            }
            else if (event.type==='click' && !hit) {w.unexpected++;state.message('Try the marked control','Tab to focus · Enter to activate · Escape to pause');}
        };
        if(w.acted && matches()) {state.finish({status:'completed'});return w.result;}
        for (const type of ['click','input','change','submit','focusin','pointerup','keydown']) document.addEventListener(type,w.listener,true);
        w.check=setInterval(()=>{if(w.acted && matches()) state.finish({status:'completed'});},200);
        w.timer=setTimeout(()=>state.finish({status:'timeout',hint:w.acted ? 'The action happened, but the expected page change did not. Check validation or loading, then retry.' : 'Try Tab to focus the marked control and Enter or Space to activate it, or ask for a smaller step.'}),args.timeoutMs);
        state.message(alreadyActed ? 'Checking the page' : 'Your turn',alreadyActed ? 'Waiting for the expected change' : 'Use the marked control · Escape to pause');
        if (target && !w.acted) {
            // A supplied canvas region can be more precise than its full element bounds.
            if(retained.size) {
                const mark=[...state.marks.values()].find(m=>m.stepId===w.id);
                if(mark && !mark.label) {
                    const label=document.createElement('div');label.className='label';label.textContent=state.brief(args.instruction);label.setAttribute('aria-label',args.instruction);
                    state.root.append(label);state.resize.observe(label);mark.label=label;
                }
                state.render();
            } else pageGuidance({action:'draw',id:'__step',kind:'bracket',selector:args.selector,label:args.instruction});
        }
        return {status:'waiting',id:w.id};
    }
    if (args.action === 'poll' || args.action === 'cancel') {
        if (!state.wait || state.wait.id!==args.id) return {status:'lost',hint:'This step was replaced or the page navigated. Inspect the current page.'};
        if(args.action==='cancel') state.finish({status:'cancelled',hint:'Guidance cancelled.'});
        return state.wait.result ?? {status:'waiting',unexpectedActions:state.wait.unexpected};
    }
    throw new Error('Unknown guidance action');
}

export async function runPageGuidance(tabId: number, args: any) {
    if(args.action!=='dispose' && chrome.storage?.session) {
        await chrome.storage.session.set({[`ts_guidance_tab_${tabId}`]:true});
    }
    const assets=chrome.runtime.getURL ? {
        sans:chrome.runtime.getURL('fonts/geist-latin-wght-normal.woff2'),
        heading:chrome.runtime.getURL('fonts/instrument-serif-latin-400-italic.woff2'),
        icon:chrome.runtime.getURL('favicon.svg'),
    } : undefined;
    const [result] = await chrome.scripting.executeScript({target:{tabId},func:pageGuidance,args:[{...args,assets}]});
    if (!result?.result) throw new Error('Guidance is unavailable on this page');
    return result.result;
}
