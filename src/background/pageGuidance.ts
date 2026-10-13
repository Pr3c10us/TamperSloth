/** Serialized into Chrome's isolated world; keep every dependency inside this function. */
export function pageGuidance(args: any): any {
    const win = window as any;
    const actionTypes=['click','input','change','submit','focusin','pointerup','pointerdown'];
    let state = win.__tamperSlothGuidance;
    if (!state && args.action==='agentLock' && !args.locked) return {ok:true};
    if (!state && ['poll', 'cancel', 'clear', 'dispose'].includes(args.action)) {
        // A full page load wipes window state; the acted marker survives same-origin navigations.
        let actionObserved=false;
        try{actionObserved=!!args.id && sessionStorage.getItem('__tamperSlothActed')===args.id;if(actionObserved) sessionStorage.removeItem('__tamperSlothActed');}catch{}
        return {status: 'lost', ...(actionObserved ? {actionObserved} : {}), hint: 'Page changed; inspect it and re-anchor the next step.'};
    }
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
            .mark{filter:drop-shadow(0 0 1px #0f0f0e66)}
            .label,.cursor-tag{font:400 12px/1.5 'TamperSloth Geist','Geist Variable',system-ui,sans-serif;-webkit-font-smoothing:antialiased;border-radius:6px;box-shadow:0 2px 8px #0f0f0e14}
            .label{position:fixed;max-width:min(240px,calc(100vw - 24px));overflow-wrap:anywhere;background:#0f0f0e;color:#f6f4ef;padding:6px 12px;outline:1px solid #f6f4ef33;animation:arrive 160ms cubic-bezier(.22,.61,.36,1)}
            .sr-status{position:fixed;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap;border:0}
            .cursor{position:fixed;left:0;top:0;width:25px;height:30px;transition:transform 160ms cubic-bezier(.22,.61,.36,1)}
            .cursor svg{position:static;overflow:visible;transform-origin:3px 3px;transform:rotate(-15deg);transition:transform 80ms ease-out;filter:drop-shadow(0 0 4px #a8bd85ee) drop-shadow(0 0 10px #a8bd8599)}
            .cursor-tag{position:absolute;left:12px;top:34px;width:max-content;max-width:min(240px,calc(100vw - 24px));padding:8px 10px;background:#1d1f1b;color:#f6f4ef;border:1px solid #a8bd8566;border-radius:8px;box-shadow:0 4px 16px #0f0f0e26}
            .cursor-tag-content{display:flex;align-items:center;gap:6px;max-width:218px}
            .input-guard{position:absolute;inset:0;pointer-events:auto;cursor:progress}
            .cursor-description{min-width:0;max-width:min(218px,calc(100vw - 44px));font:400 13px/1.45 'TamperSloth Geist',system-ui,sans-serif;overflow-wrap:anywhere;white-space:normal}
            .cursor-description[data-typing="true"]::after{content:'';display:inline-block;height:1em;border-left:2px solid #a8bd85;margin-left:2px;vertical-align:-2px;animation:caret 1s steps(2,end) infinite}
            .ripple{position:fixed;width:30px;height:30px;border:1.5px solid #a8bd85;border-radius:50%;box-shadow:0 0 0 2px #0f0f0e66;animation:pulse .45s cubic-bezier(.22,.61,.36,1) forwards}
            @keyframes arrive{from{opacity:0}to{opacity:1}} @keyframes pulse{to{transform:scale(1.9);opacity:0}}
            .lock-pill{position:fixed;right:12px;bottom:12px;display:flex;align-items:center;gap:6px;padding:5px 9px;background:#0f0f0ebf;color:#f6f4efd9;border-radius:6px;font:400 11px/1.3 'TamperSloth Geist','Geist Variable',system-ui,sans-serif;-webkit-font-smoothing:antialiased;-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:1;transition:opacity 180ms ease,visibility 0s}
            .lock-pill[hidden]{display:flex;opacity:0;visibility:hidden;transition:opacity 180ms ease,visibility 0s 180ms}
            .lock-dot{flex:none;width:5px;height:5px;border-radius:50%;background:#a8bd85}
            .lock-hint{color:#f6f4ef80}
            @keyframes caret{50%{opacity:0}}
            @media(prefers-reduced-motion:reduce){.mark,.ripple,.cursor-description::after{animation:none}.cursor,.cursor svg,.lock-pill{transition:none}}
        `;
        root.append(style);
        const inputGuard=document.createElement('div');inputGuard.className='input-guard';inputGuard.hidden=true;inputGuard.setAttribute('aria-hidden','true');root.append(inputGuard);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('aria-hidden', 'true'); root.append(svg);
        // Waiting is shown in chat; retain announcements for assistive technology only.
        const status = document.createElement('div'); status.className = 'sr-status'; status.hidden = true;
        status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); root.append(status);
        const cursor = document.createElement('div'); cursor.className = 'cursor'; cursor.hidden = true;
        // Supplied SVG path, uniformly scaled with its rounded tip at the (3, 3) hotspot.
        cursor.innerHTML = '<svg viewBox="0 0 25 30" aria-hidden="true"><g transform="translate(2.1 1.74) scale(.063)"><path d="M41.1621 6.11426C50.3285 5.55172 56.4049 7.10811 61.7979 9.94043C67.5827 12.9786 72.7214 17.5049 80.29 23.7646L80.292 23.7666L99.6143 39.7344L99.6172 39.7373L172.763 100.113L260.784 172.793L288.688 195.827L288.688 195.828C299.721 204.931 308.114 210.166 312.016 221.188L312.198 221.718C314.957 229.952 314.333 238.946 310.463 246.721C306.354 254.959 299.012 261.124 290.188 263.74H290.188C287.229 264.618 283.08 265.006 278.274 265.117C273.425 265.23 268.846 265.064 264.431 265.062L224.271 265.053L220.9 265.036C204.037 264.888 186.952 263.912 169.137 269.92L169.086 269.937L169.035 269.955C158.71 273.644 149.202 279.306 141.04 286.629L141.029 286.639L141.018 286.649C132.171 294.668 122.869 308.119 116.184 316.961L116.183 316.962L81.4727 362.884C75.0195 371.344 67.8902 376.508 57.96 377.783L57.958 377.784C49.2069 378.911 40.3672 376.509 33.3896 371.109L33.376 371.1L32.7217 370.582C26.0355 365.161 21.751 357.311 20.8242 348.73L20.8213 348.705L20.8184 348.679C20.209 343.462 20.2064 337.766 19.8887 331.771H19.8896L17.9434 291.823V291.822L11.959 169.128L7.91113 86.1465V86.1455L6.76172 62.7061L6.76074 62.6797L6.75879 62.6543L6.44531 57.3682C6.11716 51.7185 5.81264 45.3319 6.13281 41.3994C6.7646 33.6452 9.71963 26.2606 14.6113 20.2109L14.625 20.1943L14.6377 20.1777C21.2131 11.9249 30.3825 7.3599 41.1621 6.11426Z" fill="black" stroke="#ffffff" stroke-width="32"/></g></svg>';
        const cursorTag=document.createElement('div');cursorTag.className='cursor-tag';cursorTag.hidden=true;
        const cursorName=document.createElement('span');cursorName.textContent='Sloth';
        const cursorContent=document.createElement('div');cursorContent.className='cursor-tag-content';
        const cursorBody=document.createElement('div');cursorBody.className='cursor-description';cursorBody.hidden=true;
        cursorContent.append(cursorBody);cursorTag.append(cursorContent);cursor.append(cursorTag);
        // Visible while site input is paused, so a blocked click is never a mystery.
        const lockPill=document.createElement('div');lockPill.className='lock-pill';lockPill.hidden=true;lockPill.setAttribute('role','status');
        const lockDot=document.createElement('span');lockDot.className='lock-dot';
        const lockTitle=document.createElement('span');const lockHint=document.createElement('span');lockHint.className='lock-hint';
        lockPill.append(lockDot,lockTitle,lockHint);
        root.append(cursor,lockPill); document.documentElement.append(host);
        state = win.__tamperSlothGuidance = {host, root, svg, status, cursor,cursorTag,cursorName,cursorBody,inputGuard,lockPill,lockTitle,lockHint, marks: new Map(), wait: null,drawQueue:[],drawing:null,agentPoints:[],agentKeys:[]};
        state.renderLock=()=>{
            lockPill.hidden=!state.inputLocked && !state.agentLocked;
            if(state.inputLocked){lockTitle.textContent='Drawing guide';lockHint.textContent='Esc';}
            else if(state.agentLocked){lockTitle.textContent='Sloth is working';lockHint.textContent='Esc';}
            lockPill.setAttribute('aria-label',state.inputLocked ? 'Drawing guide. Input paused. Escape cancels.' : 'Sloth is working. Input paused. Escape to take over.');
        };
        // Gestures arrive through CDP as trusted events, so a guard overlay would swallow
        // them too. Instead, only input matching what the agent announced gets through.
        // Batched actions unlock and relock back to back. Linger briefly so the gap
        // neither flashes the indicator nor lets a stray click land mid-batch.
        state.setAgentLocked=(locked: boolean,linger=false)=>{
            clearTimeout(state.agentLockTimer);
            if(locked) state.agentLockTimer=setTimeout(()=>state.setAgentLocked(false),15000);
            else if(linger && state.agentLocked){state.agentLockTimer=setTimeout(()=>state.setAgentLocked(false),900);return;}
            if(state.agentLocked===locked) return;
            state.agentLocked=locked;state.renderLock();
        };
        state.isAgentInput=(event: Event)=>{
            const now=performance.now(),e=event as any;
            if(/^key/.test(event.type)) return state.agentKeys.some((k: any)=>now-k.at<1500 && (k.key===e.key || !!k.code && k.code===e.code));
            const t=e.changedTouches?.[0] ?? e.touches?.[0] ?? e;
            // Derived events (input, change, submit) only follow input that was already filtered.
            if(!Number.isFinite(t.clientX)) return true;
            return state.agentPoints.some((p: any)=>now-p.at<1500 && Math.abs(p.x-t.clientX)<=2 && Math.abs(p.y-t.clientY)<=2);
        };
        state.setInputLocked=(locked: boolean)=>{
            if(state.inputLocked===locked) return;
            state.inputLocked=locked;inputGuard.hidden=!locked;state.renderLock();
            clearTimeout(state.inputLockTimer);
            if(locked){state.message('Drawing the guide','Site input is briefly paused. Escape cancels.');state.inputLockTimer=setTimeout(()=>pageGuidance({action:'clear'}),7000);}
        };
        state.blockInput=(event: Event)=>{
            if(!event.isTrusted) return;
            const escape=event.type==='keydown' && (event as KeyboardEvent).key==='Escape';
            if(state.inputLocked){if(escape) pageGuidance({action:'clear'});}
            else if(!state.agentLocked || state.isAgentInput(event)) return;
            else if(escape) state.setAgentLocked(false);
            event.preventDefault();event.stopImmediatePropagation();
        };
        state.lockEvents=['pointerdown','pointermove','pointerup','mousedown','mousemove','mouseup','click','dblclick','auxclick','contextmenu','dragstart','dragover','drop','touchstart','touchmove','touchend','wheel','keydown','keyup','keypress','beforeinput','input','change','submit'];
        for(const type of state.lockEvents) window.addEventListener(type,state.blockInput,{capture:true,passive:false});
        state.reduced=()=>typeof matchMedia==='undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches;
        state.positionTooltip=()=>{
            const p=state.cursorPoint;if(!p) return;
            cursorTag.hidden=cursor.hidden || cursorBody.hidden;
            if(cursorTag.hidden) return;
            const width=cursorTag.offsetWidth,height=cursorTag.offsetHeight,margin=12;
            // Keep the bubble below the pointer. Near the bottom, lift the resting
            // pointer rather than flipping its description above it.
            if(state.resting && !state.drawing && p.y+34+height>innerHeight-margin) {
                p.y=Math.max(margin,innerHeight-height-34-margin);
                cursor.style.transform=`translate(${p.x}px,${p.y}px)`;
            }
            const y=p.y+34;
            const candidates=[p.x+12,p.x-width+12,p.x-width/2].map(x=>Math.max(margin,Math.min(innerWidth-width-margin,x)));
            const x=candidates.find(x=>!(state.protectedBoxes ?? []).some((b: any)=>x<b.x+b.width+8 && x+width>b.x-8 && y<b.y+b.height+8 && y+height>b.y-8));
            const fits=x!==undefined && width<=innerWidth-margin*2 && y+height<=innerHeight-margin;
            cursorTag.style.visibility=fits ? 'visible' : 'hidden';
            if(fits){cursorTag.style.left=`${x-p.x}px`;cursorTag.style.top='34px';}
        };
        state.moveCursor=(point: any,drawing=false,resting=false)=>{
            state.resting=resting;
            // The drawing hotspot must stay on the ink, including at viewport edges.
            const old=state.cursorPoint,p=drawing ? {x:point.x,y:point.y} : {x:Math.max(0,Math.min(innerWidth-25,point.x)),y:Math.max(0,Math.min(innerHeight-30,point.y))};
            cursor.hidden=false;cursor.style.transition=drawing || state.reduced() ? 'none' : '';
            cursor.style.transform=`translate(${p.x}px,${p.y}px)`;
            const direction=old ? Math.atan2(p.y-old.y,p.x-old.x) : 0;
            const angle=!state.reduced() && old ? drawing ? Math.sin(direction)*16+Math.cos(direction)*8 : Math.max(-8,Math.min(8,(p.x-old.x)*.18+(p.y-old.y)*.08)) : 0;
            cursor.querySelector('svg')!.style.transform=`rotate(${angle-15}deg)`;
            clearTimeout(state.rotationTimer);state.rotationTimer=setTimeout(()=>{cursor.querySelector('svg')!.style.transform='rotate(-15deg)';},180);
            state.cursorPoint=p;
            // Avoid repeated DOM scans on every animation frame.
            if(!drawing || !state.tooltipAt || performance.now()-state.tooltipAt>80){state.positionTooltip();state.tooltipAt=performance.now();}
        };
        state.describe=(mark: any)=>{
            clearTimeout(state.typingTimer);state.guideOwner=mark.id;
            cursorBody.hidden=false;cursorBody.setAttribute('aria-label',mark.label.getAttribute('aria-label') ?? mark.label.textContent);
            const text=mark.label.textContent;cursorBody.textContent=text;
            cursorTag.hidden=false;cursorTag.style.width='';cursorBody.style.minHeight='';
            state.message('Sloth',cursorBody.getAttribute('aria-label'));
            // Natural content width grows with the typed instruction.
            if(state.reduced()){cursorBody.setAttribute('data-typing','false');state.positionTooltip();return;}
            cursorBody.setAttribute('data-typing','true');
            let count=0;cursorBody.textContent='';
            const type=()=>{
                if(!state.marks.has(mark.id)) return;
                count=Math.min(text.length,count+1);cursorBody.textContent=text.slice(0,count);state.positionTooltip();
                if(count<text.length) state.typingTimer=setTimeout(type,45);
                else cursorBody.setAttribute('data-typing','false');
            };type();
        };
        state.park=(mark: any)=>{
            const b=mark.currentBox ?? mark.box;
            const points=[{x:b.x+b.width+16,y:b.y},{x:b.x-30,y:b.y},{x:b.x,y:b.y-34},{x:b.x,y:b.y+b.height+16}];
            const p=points.find(p=>p.x>=0 && p.x<innerWidth-25 && p.y>=0 && p.y<innerHeight-30) ?? points[0];
            state.moveCursor(p,false,true);cursorName.textContent='Sloth';
        };
        state.drawNext=()=>{
            if(state.drawing || state.clearing) return;
            let mark;while(state.drawQueue.length && !mark){const next=state.drawQueue.shift();if(state.marks.has(next.id)) mark=next;}
            if(!mark) return;
            state.drawing=mark;
            clearTimeout(state.typingTimer);cursorBody.hidden=true;
            const done=()=>{clearTimeout(mark.animationTimer);mark.measurements?.remove();mark.group.style.filter='';mark.group.style.visibility='visible';mark.drawn=true;state.drawing=null;state.park(mark);if(mark.label) state.describe(mark);mark.resolveDrawing?.({ok:true,id:mark.id});if(!state.drawQueue.length){state.setInputLocked(false);state.wait?.armTimeout?.();}state.drawNext();};
            if(mark.animate===false || state.reduced() || typeof mark.shape.getTotalLength!=='function'){done();return;}
            const ns='http://www.w3.org/2000/svg',stages: any[]=[],nodes=[mark.shape,...(mark.echo.style.display==='none' ? [] : [mark.echo]),...(mark.hatch ? [mark.hatch] : [])];
            const measurements=document.createElementNS(ns,'defs');mark.measurements=measurements;mark.group.append(measurements);
            const originals=new Map<any,string>();
            let length=0,lastPoint: any;
            for(const node of nodes) {
                const source=node.getAttribute('d') ?? '';originals.set(node,source);
                for(const subpath of source.match(/M[^M]*/g) ?? []) {
                    const geometry=document.createElementNS(ns,'path');geometry.setAttribute('d',subpath);
                    // Connected SVG geometry is measurable even when it is not painted.
                    measurements.append(geometry);
                    const size=geometry.getTotalLength();if(!size || !Number.isFinite(size)) continue;
                    const first=geometry.getPointAtLength(0);
                    if(lastPoint){const travel=Math.hypot(first.x-lastPoint.x,first.y-lastPoint.y)*.35;if(travel>1){stages.push({travel:true,from:lastPoint,to:first,start:length,length:travel});length+=travel;}}
                    // Sample connected geometry once. SVG geometry queries during every
                    // frame force repeated path measurement and can stall visible painting.
                    const count=Math.max(1,Math.ceil(size/2)),points=[];
                    for(let i=0;i<=count;i++){const p=geometry.getPointAtLength(size*i/count);points.push({x:p.x,y:p.y});}
                    stages.push({node,points,start:length,length:size,drawn:0,started:false});length+=size;lastPoint=points[count];
                }
            }
            if(!length || !Number.isFinite(length)){done();return;}
            for(const node of nodes){node.setAttribute('d','');node.style.strokeDasharray='';}
            mark.animationNodes=new Map(nodes.map(node=>[node,'']));mark.drawingActive=true;
            state.setInputLocked(true);
            // A changing SVG filter bounding box can defer painting thin partial strokes.
            // Paint the live ink directly; restore its subtle shadow when complete.
            mark.group.style.filter='none';
            mark.group.style.visibility='visible';
            const start=performance.now(),duration=Math.max(1100,Math.min(4500,length*4));cursorName.textContent='Sloth · drawing';
            // A background tab can suspend RAF; never leave a drawing tool waiting forever.
            mark.animationTimer=setTimeout(()=>{
                if(state.drawing!==mark) return;
                if(typeof cancelAnimationFrame==='function') cancelAnimationFrame(state.drawFrame);
                for(const [node,source] of originals) node.setAttribute('d',source);
                mark.drawingActive=false;done();
            },duration+1000);
            const frame=(now: number)=>{
                if(!state.marks.has(mark.id) || state.drawing!==mark) return;
                const progress=Math.min(1,Math.max(0,(now-start)/duration)),distance=length*progress;
                let p: any;
                for(const stage of stages) {
                    if(distance<stage.start) break;
                    const at=Math.min(stage.length,distance-stage.start);
                    if(stage.travel){p={x:stage.from.x+(stage.to.x-stage.from.x)*at/stage.length,y:stage.from.y+(stage.to.y-stage.from.y)*at/stage.length};}
                    else {
                        let d=mark.animationNodes.get(stage.node) ?? '';
                        if(!stage.started){
                            const first=stage.points[0];d+=` M${first.x},${first.y}`;stage.started=true;
                            // RAF can first run with zero elapsed time. Persist the move
                            // even before any line is added, or the next frame starts with
                            // an invalid L command and nothing paints until completion.
                            stage.node.setAttribute('d',d);mark.animationNodes.set(stage.node,d);
                        }
                        const index=at/stage.length*(stage.points.length-1),lower=Math.floor(index),fraction=index-lower;
                        const a=stage.points[lower],b=stage.points[Math.min(lower+1,stage.points.length-1)];
                        p={x:a.x+(b.x-a.x)*fraction,y:a.y+(b.y-a.y)*fraction};
                        for(let i=Math.floor(stage.drawn/stage.length*(stage.points.length-1))+1;i<=lower;i++){const point=stage.points[i];d+=` L${point.x},${point.y}`;}
                        if(at>stage.drawn){d+=` L${p.x},${p.y}`;stage.drawn=at;stage.node.setAttribute('d',d);mark.animationNodes.set(stage.node,d);}
                    }
                    if(at<stage.length) break;
                }
                const b=mark.currentBox ?? mark.box;if(p) state.moveCursor({x:b.x+p.x-3,y:b.y+p.y-3},true);
                if(progress<1 && !state.reduced()) state.drawFrame=requestAnimationFrame(frame);
                else{for(const [node,source] of originals) node.setAttribute('d',source);mark.drawingActive=false;done();}
            };state.drawFrame=requestAnimationFrame(frame);
        };
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
        // Bring guidance targets into view before drawing. Partly clipped targets that fit
        // the viewport scroll too; oversized ones only scroll when entirely off screen.
        state.outOfView=(b: any)=>{
            const right=b.x+b.width,bottom=b.y+b.height;
            if(right<=0 || bottom<=0 || b.x>=innerWidth || b.y>=innerHeight) return true;
            return (b.x<0 || b.y<0 || right>innerWidth || bottom>innerHeight) && b.width<=innerWidth && b.height<=innerHeight;
        };
        state.reveal=(el: Element)=>{
            const b=el.getBoundingClientRect();if(!state.outOfView(b)) return;
            const block=b.y<0 || b.y+b.height>innerHeight ? 'center' : 'nearest',inline=b.x<0 || b.x+b.width>innerWidth ? 'center' : 'nearest';
            el.scrollIntoView({block,inline,behavior:'instant' as ScrollBehavior});
        };
        // Boxes and points are viewport coordinates, so return how far the page moved to shift them.
        state.revealBox=(b: any)=>{
            if(!state.outOfView(b) || typeof win.scrollBy!=='function') return {x:0,y:0};
            const x0=win.scrollX ?? 0,y0=win.scrollY ?? 0;
            // Center only the axis that is clipped, so a vertical reveal never pans sideways.
            const clipped=(start: number,size: number,view: number)=>start<0 || start+size>view ? start+size/2-view/2 : 0;
            win.scrollBy({left:clipped(b.x,b.width,innerWidth),top:clipped(b.y,b.height,innerHeight),behavior:'instant'});
            return {x:(win.scrollX ?? 0)-x0,y:(win.scrollY ?? 0)-y0};
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
            // Apps such as Figma keep hidden duplicates (tooltips, menus); a single rendered match is unambiguous,
            // even when it is scrolled out of view (e.g. GitHub's desktop + collapsed mobile settings nav).
            if (matches.length > 1) {
                const rendered=matches.filter(el=>{const b=el.getBoundingClientRect();return b.width>0 && b.height>0 && getComputedStyle(el).visibility!=='hidden';});
                if (rendered.length === 1) return rendered[0];
                const visible=rendered.filter(el=>{const b=el.getBoundingClientRect();return b.x<innerWidth && b.y<innerHeight && b.x+b.width>0 && b.y+b.height>0;});
                if (visible.length === 1) return visible[0];
            }
            if (matches.length !== 1) throw new Error(matches.length ? `Guidance selector is ambiguous (${matches.length} matches)` : 'Guidance target not found');
            return matches[0];
        };
        // A re-rendered node is still the target when the event path contains an element matching its selector.
        state.hits=(event: Event,selector: string,el?: Element | null)=>{
            const path=event.composedPath();
            if(el && path.includes(el)) return true;
            return path.some((node: any)=>{try{return node?.nodeType===1 && node.matches?.(selector);}catch{return false;}});
        };
        // Toolbars that re-render on press retarget the click to an ancestor; the press itself proves intent.
        state.sameAction=(type: string,wanted: string)=>type===wanted || (wanted==='click' && type==='pointerdown');
        // Remember trusted actions between steps, at window capture so page handlers cannot hide them.
        state.recent=[];
        state.recordAction=(event: Event)=>{
            if(!event.isTrusted || state.inputLocked) return;
            const e=event as any;
            state.recent.push({type:event.type,path:event.composedPath(),x:e.clientX,y:e.clientY});
            if(state.recent.length>20) state.recent.shift();
            // Coordinate-fallback steps cannot verify outcomes themselves; count interactions for a later screenshot check.
            if(state.wait && !state.wait.result && ['pointerup','input','change','submit','keyup'].includes(event.type)) state.wait.interactions++;
            // Any user activity means they are engaged, so restart the short idle window.
            if(state.wait && !state.wait.result) state.wait.armIdle?.();
        };
        state.inRegion=(p: any,box: any)=>Number.isFinite(p.x) && Number.isFinite(p.y) && p.x>=box.x-6 && p.x<=box.x+box.width+6 && p.y>=box.y-6 && p.y<=box.y+box.height+6;
        state.recentRegionHit=(box: any,wanted: string)=>state.recent.some((entry: any)=>state.sameAction(entry.type,wanted) && state.inRegion(entry,box));
        state.recentHit=(selector: string,el: Element | null,wanted: string)=>state.recent.some((entry: any)=>state.sameAction(entry.type,wanted) && state.hits({composedPath:()=>entry.path} as any,selector,el));
        state.recordEvents=['pointerdown','click','input','change','submit','focusin','pointerup','keyup'];
        for(const type of state.recordEvents) window.addEventListener(type,state.recordAction,{capture:true,passive:true});
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
            state.protectedBoxes=protectedBoxes;
            for (const mark of state.marks.values()) {
                const box=boxes.get(mark);
                mark.group.style.display = mark.selector && (!box?.width || !box?.height) ? 'none' : '';
                if(mark.label) mark.label.style.display=mark.group.style.display;
                if (!box || mark.group.style.display==='none') {if(state.guideOwner===mark.id) cursorBody.hidden=true;continue;}
                mark.currentBox=box;
                mark.group.setAttribute('transform',`translate(${box.x},${box.y})`);
                if(!mark.drawingActive) state.sketch(mark,box);
                if(state.guideOwner===mark.id && !state.drawing) state.park(mark);
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
        state.annotationListener=(event: Event)=>{
            if(!event.isTrusted || state.inputLocked) return;
            for(const mark of state.marks.values()) {
                if(!mark.selector) continue;
                let target;try{target=state.find(mark.selector);}catch{target=null;}
                if(state.hits(event,mark.selector,target)) {
                    mark.actions.add(event.type);if(event.type==='pointerdown') mark.actions.add('click');
                    if(mark.label && (!state.wait || state.wait.result || event.type===state.wait.event)) mark.label.hidden=true;
                    if(state.guideOwner===mark.id && (!state.wait || state.wait.result || event.type===state.wait.event)) {
                        clearTimeout(state.typingTimer);cursorBody.hidden=true;state.guideOwner=undefined;state.positionTooltip();
                    }
                }
            }
        };
        state.remove = (id: string) => {
            const m=state.marks.get(id);
            if(m) clearTimeout(m.animationTimer);
            m?.resolveDrawing?.({ok:true,id,removed:true});
            if(state.drawing===m && m){if(typeof cancelAnimationFrame==='function') cancelAnimationFrame(state.drawFrame);state.drawing=null;}
            state.drawQueue=state.drawQueue.filter((mark: any)=>mark.id!==id);
            if(state.guideOwner===id){clearTimeout(state.typingTimer);cursorBody.hidden=true;state.guideOwner=undefined;state.positionTooltip();}
            if(m){clearTimeout(m.timer);m.group.remove();if(m.label) state.resize.unobserve(m.label);m.label?.remove();state.marks.delete(id);}
            if(!state.marks.size && state.annotationListening) {
                for(const type of actionTypes) document.removeEventListener(type,state.annotationListener,true);
                state.annotationListening=false;
            }
            state.drawNext();
            if(!state.drawing && !state.drawQueue.length) state.setInputLocked(false);
        };
        state.cue = (el: Element, action: string) => {
            const b=el.getBoundingClientRect();
            pageGuidance({action:'cursor',method:action==='type' ? 'Input.insertText' : 'Input.dispatchMouseEvent',params:{x:b.x+b.width/2,y:b.y+b.height/2,type:action==='click' ? 'mousePressed' : action==='scroll' ? 'mouseWheel' : 'mouseMoved'}});
        };
        state.finish = (result: any) => {
            const w = state.wait; if (!w || w.result) return;
            w.result = {...result, actionObserved:w.acted && w.event!=='state', elapsedMs:Date.now()-w.started, unexpectedActions:w.unexpected, interactions:w.interactions, url:location.href,...(w.region ? {verification:'visual'} : {})};
            clearTimeout(w.timer); clearTimeout(w.idleTimer); clearInterval(w.check); state.recent=[];
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
        for(const type of state.lockEvents) window.removeEventListener(type,state.blockInput,true);
        for(const type of state.recordEvents) window.removeEventListener(type,state.recordAction,true);
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
        const p = args.params ?? {}, type = p.type ?? '', now = performance.now();
        let point = p.touchPoints?.[0] ?? (Number.isFinite(p.x) ? p : null);
        for (const at of p.touchPoints ?? (point ? [point] : [])) state.agentPoints.push({x:at.x,y:at.y,at:now});
        if (p.key || p.code) state.agentKeys.push({key:p.key,code:p.code,at:now});
        state.agentPoints=state.agentPoints.filter((a: any)=>now-a.at<1500).slice(-64);
        state.agentKeys=state.agentKeys.filter((a: any)=>now-a.at<1500).slice(-16);
        if (state.agentLocked) state.setAgentLocked(true);
        // Keys only relocate the cursor into a text field. Shortcuts on canvases or
        // app containers keep it at its last action instead of jumping to their edge.
        const active = document.activeElement as HTMLElement | null;
        const editable = !!active && (/^(INPUT|TEXTAREA|SELECT)$/i.test(active.tagName) || active.isContentEditable);
        if (!point && editable && /Key|insertText/.test(args.method)) {
            const box = active!.getBoundingClientRect();
            const caret = active!.isContentEditable && getSelection()?.rangeCount ? getSelection()!.getRangeAt(0).getBoundingClientRect() : null;
            if (caret?.height) point = {x:caret.right,y:caret.top+caret.height/2};
            else if (box.width) {
                point = {x:box.right,y:box.top+box.height/2};
                pageGuidance({action:'draw',id:'__focus',kind:'bracket',box:{x:box.x,y:box.y,width:box.width,height:box.height},lifetimeMs:1000,animate:false});
            }
        }
        if (point) {
            state.moveCursor(point);
            state.cursorName.textContent = /Wheel/.test(type) ? 'Sloth · scroll' : /Key|insertText/.test(args.method) ? 'Sloth · typing' : p.buttons || /touch/.test(type) ? 'Sloth · drag' : 'Sloth';
            if (['mousePressed','touchStart'].includes(type)) {
                const ripple=document.createElement('div'); ripple.className='ripple'; ripple.style.left=`${point.x-15}px`; ripple.style.top=`${point.y-15}px`; state.root.append(ripple); setTimeout(()=>ripple.remove(),550);
            }
        }
        // Only the action cue expires; the cursor remains at its last position.
        clearTimeout(state.cursorTimer); state.cursorTimer=setTimeout(()=>{state.cursorName.textContent='Sloth';},1400);
        return {ok:true};
    }
    if (args.action === 'clear') {
        state.clearing=true;state.drawQueue=[];
        if (state.wait && !state.wait.result) state.finish({status:'cancelled',hint:'Guidance cleared.'});
        for (const id of [...state.marks.keys()]) state.remove(id);
        clearTimeout(state.cursorTimer); clearTimeout(state.statusTimer);clearTimeout(state.rotationTimer);
        state.setInputLocked(false);state.setAgentLocked(false);
        state.resize.disconnect(); state.mutations.disconnect();
        state.cursorName.textContent='Sloth';
        state.clearing=false;
        state.status.hidden=true; return {ok:true};
    }
    if (args.action === 'remove') {state.remove(args.id); return {ok:true};}
    if (args.action === 'agentLock') {state.setAgentLocked(!!args.locked,true); return {ok:true};}
    if (args.action === 'draw') {
        state.resize.observe(document.documentElement);
        state.resize.observe(state.status);
        state.mutations.observe(document.documentElement,{subtree:true,childList:true,attributes:true});
        const id=args.id ?? crypto.randomUUID(); state.remove(id);
        if (state.marks.size >= 30) throw new Error('Clear an annotation before adding more (limit 30).');
        if (args.kind==='label' && !args.label) throw new Error('Label annotations require label text');
        if (args.kind==='freehand' && !args.points?.length) throw new Error('Freehand annotations require points');
        const el=args.selector ? state.find(args.selector) : null;
        if(el && args.reveal!==false) state.reveal(el);
        else if(!el && args.reveal!==false && (args.box || args.points?.length)) {
            const xs=[...(args.box ? [args.box.x,args.box.x+args.box.width] : []),...(args.points ?? []).map((p: any)=>p.x)];
            const ys=[...(args.box ? [args.box.y,args.box.y+args.box.height] : []),...(args.points ?? []).map((p: any)=>p.y)];
            const d=state.revealBox({x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)});
            if(d.x || d.y) {
                args={...args,box:args.box && {...args.box,x:args.box.x-d.x,y:args.box.y-d.y},points:args.points?.map((p: any)=>({...p,x:p.x-d.x,y:p.y-d.y}))};
            }
        }
        const box=el?.getBoundingClientRect() ?? args.box;
        if (!box && !args.points?.length) throw new Error('Supply a selector, box, or path points');
        const ns='http://www.w3.org/2000/svg';
        const group=document.createElementNS(ns,'g'); group.setAttribute('class','mark');group.style.visibility='hidden';
        const shape=document.createElementNS(ns,'path'),echo=document.createElementNS(ns,'path');
        const color='#a8bd85';
        for(const stroke of [shape,echo]) {
            stroke.setAttribute('stroke',color);stroke.setAttribute('stroke-width',String((args.lineWidth ?? 2.5)*(stroke===echo ? .6 : .8)));
            stroke.setAttribute('stroke-linecap','round');stroke.setAttribute('stroke-linejoin','round');stroke.setAttribute('fill','none');
        }
        // One outline pass: a second perimeter would look like tracing an existing shape.
        echo.setAttribute('opacity','.4');echo.style.display='none';
        if(args.lineStyle==='dashed' && args.kind==='ellipse') shape.setAttribute('stroke-dasharray','8 5 6 6 10 4');
        let hatch,clipShape;
        if(args.kind==='highlight') {
            const defs=document.createElementNS(ns,'defs'),clip=document.createElementNS(ns,'clipPath'),clipId=`ts-hatch-${crypto.randomUUID()}`;
            clip.setAttribute('id',clipId);clipShape=document.createElementNS(ns,'path');clip.append(clipShape);defs.append(clip);group.append(defs);
            hatch=document.createElementNS(ns,'path');hatch.setAttribute('stroke',color);hatch.setAttribute('stroke-width','1');hatch.setAttribute('opacity','.2');hatch.setAttribute('fill','none');hatch.setAttribute('clip-path',`url(#${clipId})`);group.append(hatch);
        }
        group.append(shape,echo); state.svg.append(group);
        let label: HTMLDivElement | undefined;
        if (args.label) {label=document.createElement('div'); label.hidden=true;label.className='label'; label.textContent=state.brief(args.label);label.setAttribute('aria-label',args.label);}
        let seed=2166136261;for(const char of id) seed=Math.imul(seed^char.charCodeAt(0),16777619);
        const mark={...args,id,seed,box:box ?? {x:args.points[0].x,y:args.points[0].y,width:0,height:0},group,shape,echo,hatch,clipShape,label,actions:new Set(),stepId:state.wait && !state.wait.result ? state.wait.id : undefined,timer:undefined as any};
        state.marks.set(id,mark);
        if(!state.annotationListening) {
            for(const type of actionTypes) document.addEventListener(type,state.annotationListener,true);
            state.annotationListening=true;
        }
        state.render();
        state.drawQueue.push(mark);state.drawNext();
        if (args.lifetimeMs) mark.timer=setTimeout(()=>state.remove(id),args.lifetimeMs);
        if(args.waitForDrawing && !mark.drawn) return new Promise(resolve=>{(mark as any).resolveDrawing=resolve;});
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
        let region=!args.selector && args.region ? args.region : null;
        if (args.event !== 'state' && !target && !region) throw new Error('An action step requires a unique target selector or a measured region');
        // The user may act before the wait starts, e.g. while the agent is still inspecting.
        let alreadyActed=args.event!=='state' && (region ? state.recentRegionHit(region,args.event) : state.recentHit(args.selector,target,args.event));
        state.recent=[];
        // Scroll an off-screen region into view and keep its hit area aligned with the page.
        if(region && !alreadyActed) {
            const d=state.revealBox(region);
            if(d.x || d.y) region={...region,x:region.x-d.x,y:region.y-d.y};
        }
        const retained=new Set(args.annotationIds ?? []);
        for(const [id,mark] of state.marks) {
            let markTarget=null;if(mark.selector) try{markTarget=state.find(mark.selector);}catch{}
            if((mark.selector===args.selector || (target && markTarget===target)) && mark.actions.has(args.event)) alreadyActed=true;
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
        const w: any=state.wait={id:args.id,event:args.event,region,interactions:0,started:Date.now(),waitingForDraw:true,unexpected:0,acted:alreadyActed || args.event==='state',result:null,timer:null,check:null,listener:null};
        // Persist the action so a poll after a full page load (link click) still knows the user acted.
        const markActed=()=>{w.acted=true;try{sessionStorage.setItem('__tamperSlothActed',w.id);}catch{}};
        if(alreadyActed){markActed();for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);}
        w.listener=(event:any)=> {
            if (!event.isTrusted || state.inputLocked) return;
            if (event.type==='keydown' && event.key==='Escape') {state.finish({status:'cancelled',hint:'Cancelled with Escape.'});return;}
            // Framework updates may replace the original DOM node while drawing.
            let currentTarget=target;try{if(args.selector) currentTarget=state.find(args.selector);}catch{currentTarget=null;}
            const hit=region ? state.inRegion({x:event.clientX,y:event.clientY},region) : !!args.selector && state.hits(event,args.selector,currentTarget);
            if (state.sameAction(event.type,args.event) && hit) {
                markActed();
                // Remove the instruction immediately, even if its resulting state takes time.
                for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);
                if (matches()) state.finish({status:'completed'});
                else state.message('Checking the page','Waiting for the expected change');
            }
            else if (event.type==='click' && !hit && !w.acted) {w.unexpected++;state.message('Try the marked control','Tab to focus · Enter to activate · Escape to pause');}
        };
        if(w.acted && matches()) {state.finish({status:'completed'});return w.result;}
        for (const type of [...actionTypes,'keydown']) document.addEventListener(type,w.listener,true);
        w.check=setInterval(()=>{
            // Fall back to the window-level log when the page stops propagation before document listeners run.
            if(!w.acted && region && state.recentRegionHit(region,args.event)){markActed();for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);}
            if(!w.acted && args.selector && state.recentHit(args.selector,(()=>{try{return state.find(args.selector);}catch{return target;}})(),args.event)){markActed();for(const [id,mark] of state.marks) if(mark.stepId===w.id) state.remove(id);}
            if(w.acted && matches()) state.finish({status:'completed'});
        },200);
        w.armTimeout=()=>{
            if(w.result || w.timer) return;
            w.waitingForDraw=false;
            w.timer=setTimeout(()=>state.finish({status:'timeout',hint:w.acted ? 'The action happened, but the expected page change did not. Check validation or loading, then retry.' : 'Try Tab to focus the marked control and Enter or Space to activate it, or ask for a smaller step.'}),args.timeoutMs);
            w.armIdle();
        };
        // Stop early when the user shows no activity at all, instead of holding the full timeout.
        w.armIdle=()=>{
            clearTimeout(w.idleTimer);
            if(w.result || w.acted || w.waitingForDraw || !args.idleTimeoutMs) return;
            w.idleTimer=setTimeout(()=>{if(!w.acted) state.finish({status:'timeout',idle:true,hint:'No user activity was seen on the page. Check in with the user briefly instead of waiting longer.'});},args.idleTimeoutMs);
        };
        state.message(alreadyActed ? 'Checking the page' : 'Your turn',alreadyActed ? 'Waiting for the expected change' : 'Use the marked control · Escape to pause');
        if ((target || region) && !w.acted) {
            // A supplied canvas region can be more precise than its full element bounds.
            if(retained.size) {
                const mark=[...state.marks.values()].find(m=>m.stepId===w.id);
                if(mark && !mark.label) {
                    const label=document.createElement('div');label.hidden=true;label.className='label';label.textContent=state.brief(args.instruction);label.setAttribute('aria-label',args.instruction);mark.label=label;
                    if(mark.drawn){state.describe(mark);state.park(mark);}
                }
                state.render();
            } else pageGuidance({action:'draw',id:'__step',kind:'bracket',...(region ? {box:region} : {selector:args.selector}),label:args.instruction});
        }
        if(!state.inputLocked) w.armTimeout();
        return {status:'waiting',id:w.id,ready:!w.waitingForDraw};
    }
    if (args.action === 'poll' || args.action === 'cancel') {
        if (!state.wait || state.wait.id!==args.id) return {status:'lost',hint:'This step was replaced or the page navigated. Inspect the current page.'};
        if(args.action==='cancel') state.finish({status:'cancelled',hint:'Guidance cancelled.'});
        return state.wait.result ?? {status:'waiting',ready:!state.wait.waitingForDraw,actionObserved:state.wait.acted && state.wait.event!=='state',unexpectedActions:state.wait.unexpected,interactions:state.wait.interactions};
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
    } : undefined;
    const [result] = await chrome.scripting.executeScript({target:{tabId},func:pageGuidance,args:[{...args,assets,waitForDrawing:args.action==='draw'}]});
    if (!result?.result) throw new Error('Guidance is unavailable on this page');
    return result.result;
}
