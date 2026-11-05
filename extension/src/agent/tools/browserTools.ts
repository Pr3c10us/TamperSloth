import {tool} from 'ai';
import {z} from 'zod';
import {browserSchemas, toolSchemas, type BrowserOperation} from '@/shared/browserSchemas';
import {blobToBase64} from '@/storage/imageLibrary';

// Keep the recursive JSON validator inside the browser service. Gemini rejects
// z.json()'s recursive additionalProperties reference in function declarations.
const storeToolSchema = browserSchemas.store.extend({
    value: z.string().describe('JSON-encoded value for set, e.g. {"count":3}, [1,2], false, or "hello" (including the quotes).')
        .transform((value, ctx) => {
            try {
                return JSON.parse(value);
            } catch {
                ctx.addIssue({code: 'custom', message: 'value must be a valid JSON-encoded string'});
                return z.NEVER;
            }
        }).pipe(z.json()).optional(),
});

const imageToolSchema = browserSchemas.images.omit({dataUrl: true}).extend({
    ref: z.string().max(20).optional().describe('An element ref, instead of selector.'),
    attachment: z.string().max(300).optional().describe('save: the file name of an image the user sent in this chat.'),
});

export async function browserCall(operation: BrowserOperation, input: unknown) {
    const response = await chrome.runtime.sendMessage({type: 'BROWSER_CALL', operation, input});
    if (!response || response.error) throw new Error(response?.error ?? 'Browser service unavailable');
    return response;
}

/** Marks the task group as working or waiting on the user; a chat without task tabs is unaffected. */
export function setTaskStatus(conversationId: string, status: 'working' | 'waiting') {
    return browserCall('taskStatus', {conversationId, status}).catch(() => {});
}

export function browserImageOutput(output: any) {
    const {screenshot, ...details} = output;
    return {type: 'content' as const, value: [
        {type: 'file' as const, data: {type: 'data' as const, data: screenshot.split(',')[1]}, mediaType: screenshot.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'},
        ...(Object.keys(details).length ? [{type: 'text' as const, text: JSON.stringify(details)}] : []),
    ]};
}

/** `button "Send"`: enough to confirm which element was used, without selectors or boxes. */
const label = (element: any): string | undefined => {
    if (!element) return undefined;
    const name = String(element.name ?? '');
    return (element.role || element.tag) + (name ? ` "${name.length > 60 ? name.slice(0, 57) + '...' : name}"` : '');
};

/** Model projection of one gesture/clickTarget step: only what the action changed or
 * what went wrong. The model already knows the action and target it sent, so points,
 * boxes, metrics and routine event lists are dropped; the UI and readToolResult keep
 * the raw result. */
export function compactGestureOutput(output: any) {
    if (!output || typeof output !== 'object' || !output.feedback) return output;
    const {resolved, feedback: f, action = 'click'} = output;
    const step: Record<string, unknown> = {};
    const targets = resolved?.from ? [resolved.from.target, resolved.to?.target] : [resolved?.target];
    const names = [...new Set(targets.map(label).filter(Boolean))];
    if (names.length) step.target = names.join(' -> ');
    if (f.observationLost) step.observationLost = true;
    if (f.targetMatched === false) step.landedOn = label(f.actualHit);
    const untrusted = (f.events ?? []).filter((event: any) => event.trusted === false).map((event: any) => event.type);
    if (untrusted.length) step.untrustedEvents = untrusted;
    if (['click', 'press'].includes(action) && !f.observationLost && !f.events?.length) step.noInputEvents = true;
    const url = f.tabURL && f.tabURL.before !== f.tabURL.after ? f.tabURL.after : f.urlChanged ? f.after?.url : undefined;
    if (url) step.url = url;
    if (f.focusMoved) step.focus = label(f.after?.focus) ?? null;
    const {before, after} = f;
    if (before?.scroll && after?.scroll && (before.scroll.x !== after.scroll.x || before.scroll.y !== after.scroll.y)) step.scroll = after.scroll;
    if (f.newDialogs?.length) step.dialogs = f.newDialogs.map(label);
    if (f.javascriptDialogs?.length) step.jsDialogs = f.javascriptDialogs.map((event: any) => ({type: event.params?.type, message: event.params?.message}));
    if (f.mutationCount !== undefined) step.mutations = f.mutationCount;
    // What the action opened or changed, with refs, so the next step needs no page read.
    if (output.changes && Object.keys(output.changes).length) step.changes = output.changes;
    return step;
}

/** Batched steps usually hit the same element; name it only when it changes. Only the last step reports page changes. */
export function compactGestureSteps(results: any[]) {
    let previous: unknown;
    return results.map((result, index) => {
        const step = compactGestureOutput(result);
        if (step?.target !== undefined && step.target === previous) delete step.target;
        else previous = step?.target;
        if (index < results.length - 1 && step) delete step.changes;
        return step;
    });
}

const gestureModelOutput = (output: any, postAction?: any) => output.screenshot
    ? browserImageOutput({...output, ...(postAction?.metadata?.cssRegion ? {screenshotRegion: postAction.metadata.cssRegion} : {})})
    : {type: 'text' as const, value: JSON.stringify(output)};

/** Identifies the chat's task so the browser service can group, guard and clean up the tabs it opens. */
interface TaskContext {conversationId: string; originTabId?: number; /** Whether the chat started on a new tab page, which then belongs to the task. */ originBlank?: Promise<boolean>;
    /** The bytes of an image the user sent in this chat, by file name. */ findAttachment?: (name: string) => Promise<Blob | null>}

export function createBrowserTools(getTabId: () => number, selectTab: (id: number) => void, abortSignal?: AbortSignal, task?: TaskContext) {
    // Coordinate guidance cannot prove outcomes, so it unlocks only after selector-based guidance keeps failing.
    const FALLBACK_AFTER=2;
    let observerFailures=0;
    const fallbackHint=()=>observerFailures>=FALLBACK_AFTER ? ` Selector-based guidance has failed ${observerFailures} times; you may fall back to coordinates: measure the target's viewport CSS box from a screenshot (takeMarkedScreenshot grid/plain metadata), then call waitForUserAction with region instead of selector.` : '';
    const retryGuidance=async(input: Record<string,unknown>,signal?: AbortSignal)=>{
        const args: Record<string,unknown>={...input,id:input.id ?? crypto.randomUUID()};
        let last: unknown;
        for(let attempt=1;attempt<=3;attempt++) {
            if(signal?.aborted) throw new DOMException('Aborted','AbortError');
            try {
                const result=await browserCall('guidance',args);
                return {...result,attempts:attempt};
            } catch(error) {
                last=error;
                await browserCall('guidance',{tabId:args.tabId,action:args.action==='start' ? 'cancel' : 'remove',id:args.id}).catch(()=>{});
                if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                // Invalid/ambiguous targets need new evidence; access restrictions need user action.
                if(/ambiguous|invalid selector|not a valid selector|cannot access|not allowed|restricted|permission/i.test(String(error))) break;
                if(attempt<3) await new Promise<void>(resolve=>setTimeout(resolve,attempt*250));
            }
        }
        throw last;
    };
    const make = <K extends BrowserOperation,>(operation: K, description: string) => tool({
        description, inputSchema: (operation === 'store' ? storeToolSchema : operation === 'tabs' ? browserSchemas.tabs.omit({conversationId: true, originTabId: true, originBlank: true})
            : operation === 'tabGroups' ? browserSchemas.tabGroups.omit({conversationId: true}) : browserSchemas[operation]) as z.ZodType<Record<string, unknown>>,
        execute: async input => {
            const args = {...input} as Record<string, unknown>;
            if (task && operation === 'tabs') Object.assign(args, {conversationId: task.conversationId, originTabId: task.originTabId, originBlank: await task.originBlank});
            if (task && operation === 'tabGroups') args.conversationId = task.conversationId;
            if ('tabId' in browserSchemas[operation].shape && !args.tabId) args.tabId = getTabId();
            const result = await browserCall(operation, args);
            if (operation === 'tabs' && ['select', 'create'].includes(String(args.action)) && result.tabId) {
                selectTab(result.tabId);
                // Away from the working tab, page actions now land elsewhere: say where to return for the main work.
                if (task?.originTabId && result.tabId !== task.originTabId) return {...result, workingTabId: task.originTabId};
            }
            return result;
        },
        ...(operation === 'perception' ? {toModelOutput: ({output}: {output: any}) => gestureModelOutput(output)} : {}),
    });
    return {
        annotatePage: tool({description:'Draw/remove/clear non-blocking on-page guidance: arrow, highlight, rectangle, ellipse, bracket, freehand or label. Anchor to a target {ref} from listControls, {role,name} or {text}, or a unique CSS selector (tracks layout/scroll), or viewport CSS box/points. The cursor draws the strokes in the app lime accent; label text streams into its bubble. Drawing finishes before this call returns. Solid/dashed lines; lifetimeMs 0 persists. Clear when finished.',
            inputSchema:browserSchemas.guidance.omit({completion:true,annotationIds:true,instruction:true,event:true,expectedSelector:true,expectedState:true,timeoutMs:true,idleTimeoutMs:true,index:true,cue:true,
                query:true,limit:true,fresh:true,path:true,shape:true}).extend({action:z.enum(['draw','remove','clear'])}),
            execute:async(input,options)=>{
                const tabId=input.tabId ?? getTabId(),signal=abortSignal ?? options.abortSignal;
                if(input.action!=='draw') return browserCall('guidance',{...input,tabId});
                try{return await retryGuidance({...input,tabId},signal);}
                catch(error){
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    if(input.selector) observerFailures++;
                    const [dom,image]=await Promise.allSettled([
                        browserCall('accessibility',{tabId,mode:'dom',maxNodes:80}),browserCall('perception',{tabId,mode:'plain'}),
                    ]);
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    return {...(dom.status==='fulfilled' ? {currentState:dom.value} : {}),...(image.status==='fulfilled' ? image.value : {}),
                        status:'needsReview',recoverable:true,reason:error instanceof Error ? error.message : String(error),
                        hint:'Drawing retries could not resolve this target. Inspect the current page evidence, choose a fresh unique selector or measured region, and retry the drawing. Continue visual guidance on the same unfinished step; do not give up or replace it with text-only instructions. Respect access restrictions and cancellation.'+fallbackHint()};
                }
            },
        }),
        listControls: tool({
            description:'List the controls a user can operate on the page (buttons, links, tabs, menu items, fields) as refs like c12 with role, name and state, on-screen first. query searches names anywhere on the page, off-screen included. Pass a ref as the target {ref} of waitForUserAction or annotatePage instead of writing CSS. Refs stay valid while the page is loaded. The fastest way to find what to guide.',
            inputSchema:z.object({query:z.string().max(200).optional().describe('Words from the control name, e.g. "email" or "billing". Omit for every on-screen control.'),
                limit:z.number().int().min(1).max(80).default(40),tabId:z.number().int().positive().optional()}),
            execute:async input=>{
                const {quietMs:_quiet,sinceStep:_since,...listed}=await browserCall('guidance',{tabId:input.tabId ?? getTabId(),action:'controls',query:input.query,limit:input.limit});
                return listed;
            },
        }),
        waitForUserAction: tool({
            description:'Atomically draw one brief target tip and wait for user click/input/change/submit/focus, pointerup for drawing/dragging, or event state. Name the target with target {ref} from listControls or a previous step\'s controls (or {role,name} / {text}); use selector only when no control fits. completion {state:visible|absent|checked|selected|pressed|expanded} on the target itself, or with selector/ref/text for another element, proves success even if the action event is missed and skips an already-finished step before waiting. Choose a success condition, not button visibility. A completed step returns newControls (what the action opened) and controls, so the next step can start at once. expectedSelector requires a resulting change after action. annotationIds retains intentional drawings until action. Observation failures return needsReview with fresh DOM/screenshot. Missed actions trigger an early progress check after interaction pauses (checkAfterMs); checkInAllowed means check in about this step if completion is unproven, instead of silently waiting again. For a pointerup step on a canvas, show the gesture itself: path (2 points: an arrow from drag start to end) for lines, arrows and connectors; region with shape rectangle|ellipse for the area of a shape. With neither, a dashed area appears in the middle of the visible canvas (returned as guideArea), which suits only a first shape with nothing to align to. Fallback only after repeated selector failures: region alone (viewport CSS box measured from a screenshot) replaces selector; it draws there, then returns visualCheck with a fresh screenshot after a press inside the region or after the user interacts and pauses. Judge visualCheck from the screenshot. Never collect field values. Escape or Stop cancels.',
            inputSchema: browserSchemas.guidance.pick({tabId:true,completion:true,annotationIds:true,target:true,selector:true,region:true,instruction:true,event:true,expectedSelector:true,expectedState:true,timeoutMs:true,idleTimeoutMs:true}).extend({instruction:z.string().min(1).max(300),
                path:z.array(z.object({x:z.number().finite(),y:z.number().finite()})).min(2).max(500).optional()
                    .describe('With a canvas selector: the stroke to demonstrate, in viewport CSS points taken from takeMarkedScreenshot numbers (contour bboxes or grid labels), never from plain screenshot pixels. Two points draw an arrow from where the drag starts to where it ends (a line, arrow or connector); more draw a freehand path.'),
                shape:z.enum(['rectangle','ellipse']).default('rectangle').describe('With a canvas selector and region (or the default area): the outline to show for the shape the user draws.'),
                checkAfterMs:z.number().int().min(3000).max(60000).default(3000).describe('After this long watching the step, a pause following user interaction triggers a progress check if the expected action was not detected.')}),
            execute: async (input, options) => {
                const tabId=input.tabId ?? getTabId(), id=crypto.randomUUID();
                const signal=abortSignal ?? options.abortSignal;
                if (input.event==='state' && !input.expectedSelector && !input.completion) throw new Error('State waits require expectedSelector or completion');
                // With a selector, region only places the drawing area on that canvas; hits still come from the selector.
                const anchored=!!(input.selector || input.target);
                const region=anchored ? undefined : input.region;
                if (input.path && !anchored) throw new Error('path demonstrates a stroke on a canvas; pass the canvas selector with it');
                if (input.path && input.region) throw new Error('Use either path (a stroke) or region (a shape area), not both');
                if (region && observerFailures<FALLBACK_AFTER) throw new Error(`Coordinate fallback unlocks after ${FALLBACK_AFTER} failed selector-based guidance attempts (${observerFailures} so far). Inspect the page and try a fresh unique selector first.`);
                if (signal?.aborted) throw new DOMException('Aborted','AbortError');
                // Drawing steps get contour boxes, so the next shape or stroke can be placed from measured CSS numbers.
                const shot=input.event==='pointerup' ? {tabId,mode:'contours',maxMarks:20} : {tabId,mode:'plain'};
                const page=async()=>{try{const tab=await chrome.tabs.get(tabId);return {url:tab.url,title:tab.title};}catch{return {unavailable:true};}};
                const recover=async(reason: string, observation: any={},phase='interrupted')=>{
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    // An idle user or a navigation the user caused is not a selector failure, so it must not unlock coordinate fallback.
                    if(!region && !observation.idle && !['navigated','actedUnconfirmed'].includes(phase)) observerFailures++;
                    const checkInAllowed=!!observation.idle || phase==='interactionPause' || (phase==='timedOut' && observation.actionObserved===false);
                    await browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});
                    const [dom,image,listed]=await Promise.allSettled([
                        browserCall('accessibility',{tabId,mode:'dom',maxNodes:80}),
                        browserCall('perception',shot),
                        browserCall('guidance',{tabId,action:'controls',limit:30}),
                    ]);
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    return {...observation,status:'needsReview',recoverable:true,reason,observationPhase:phase,
                        ...(checkInAllowed ? {checkInAllowed:true} : {}),
                        actionObserved:observation.actionObserved ?? null,page:await page(),
                        instruction:input.instruction,completion:input.completion,
                        ...(dom.status==='fulfilled' ? {currentState:dom.value} : {inspectionIssue:String(dom.reason)}),
                        ...(listed.status==='fulfilled' && listed.value.controls ? {controls:listed.value.controls} : {}),
                        ...(image.status==='fulfilled' ? image.value : {}),
                        hint:(phase==='navigated' ? 'The user acted on the marked control and the page navigated, which ended observation. Verify the new page from the fresh DOM/screenshot below, then guide the next unfinished step. ' : '')+
                            (phase==='actedUnconfirmed' ? 'The user did the marked action, but the expected change never appeared after the page settled. Judge from the screenshot what it did instead (e.g. it toggled closed something already open, or the expected selector was wrong). If the goal of this step is met, continue; otherwise guide the correcting action. Do not wait for the same condition again. ' : '')+
                            (observation.idle ? 'No page activity was observed. ' : phase==='interactionPause' ? 'The user interacted with the page and paused, but the expected action was not detected. ' : '')+
                            (observation.actionObserved===false ?'No expected user action was detected. Keep guidance on this step; do not advance or ask whether a later task is finished. ' : observation.actionObserved===true ? 'The expected action was detected, but its outcome remains unverified. ' : 'Action observation is unavailable; do not claim the user acted or made progress. ')+
                            'Inspect the fresh DOM/screenshot against completed steps. Do not repeat finished actions or claim progress without evidence. '+
                            (checkInAllowed ? 'First judge the screenshot below: it is valid proof, and the only proof for canvas drawing. If it shows this step done, continue to the next step without asking. Only if neither the DOM nor the screenshot settles it, send one brief check-in about this current step and wait for the user\'s reply; use askUser when a response is needed. Do not silently start another wait or list later steps in chat. '
                                : 'Resume visual guidance at the first unfinished step with a ref from controls (or a current selector). Do not abandon highlighting because observation failed. After two recovery attempts without new evidence, ask whether the user needs help with this specific step. ')+(region ? '' : fallbackHint())};
                };
                // Region steps cannot inspect the DOM for success, so hand the model a fresh screenshot to judge.
                const visualCheck=async(trigger: 'regionAction'|'interactionPause', observation: any)=>{
                    await browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    const image=await browserCall('perception',shot).then(value=>value,error=>({inspectionIssue:String(error)}));
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    return {...observation,...image,status:'visualCheck',verification:'visual',trigger,actionObserved:trigger==='regionAction' ? true : null,
                        region,instruction:input.instruction,page:await page(),
                        hint:(trigger==='regionAction' ? 'The user pressed inside the marked region. ' : 'The user interacted with the page and paused, outside the marked region. ')+
                            'Nothing on the page proves the outcome. Judge from this screenshot whether the step is complete. If it is, continue to the next step; if not, call waitForUserAction again with the same or a re-measured region. Never claim progress the screenshot does not show.'};
                };
                // What the step opened (a menu, a dialog) is usually where the next step points. Handing it
                // over lets the model guide on without inspecting the page again.
                const nextControls=async()=>{
                    let listed: any;
                    for(let waited=0;;waited+=150) {
                        listed=await browserCall('guidance',{tabId,action:'controls',fresh:true,limit:30}).catch(()=>undefined);
                        // Let an opening menu finish rendering before listing it.
                        const settling=!!listed && ((listed.quietMs ?? Infinity)<200 || (listed.sinceStep ?? Infinity)<150);
                        if(!settling || waited>=1200) break;
                        await new Promise<void>(resolve=>setTimeout(resolve,150));
                    }
                    const {newControls,controls,moreControls}=listed ?? {};
                    return {...(newControls ? {newControls} : {}),...(controls ? {controls} : {}),...(moreControls ? {moreControls} : {})};
                };
                const finished=async(result: any)=>({...result,...await nextControls(),page:await page(),
                    hint:result.hint ?? 'Step done. newControls lists what the action opened and controls what else is on screen: guide the next step with one of their refs now. Inspect the page only when the next control is not listed or the result is not what this step expected.'});
                let started;
                try {started=await retryGuidance({...input,tabId,id,action:'start'},signal);}
                catch(error){
                    const reason=error instanceof Error ? error.message : String(error);
                    // A target that did not resolve names its candidates; choosing one needs no screenshot or DOM dump.
                    if(/Candidates: /.test(reason)) {
                        if(!region) observerFailures++;
                        return {status:'needsReview',recoverable:true,observationPhase:'notStarted',actionObserved:null,reason,instruction:input.instruction,
                            hint:'The target did not resolve to one control. Pick the intended ref from the candidates in reason and call waitForUserAction again with target {ref}. Use listControls with a query only if none fits.'+fallbackHint()};
                    }
                    return recover(reason,{},'notStarted');
                }
                if(started.status!=='waiting') {
                    if(region && started.status==='completed' && !started.alreadySatisfied) return visualCheck('regionAction',started);
                    if(!region && started.status==='completed') {observerFailures=0;return finished(started);}
                    return {...started,page:await page()};
                }
                const startUrl=(await page()).url;
                // A click that triggers a full page load destroys the in-page observer before it can report.
                const lost=async(result: any,acted: boolean)=>{
                    const moved=(url?: string)=>!!url && !!startUrl && url.split('#')[0]!==startUrl.split('#')[0];
                    // The poll can fail mid-unload, before the tab commits its new URL.
                    for(let i=0;i<8;i++) {
                        const tab=await chrome.tabs.get(tabId).catch(()=>undefined);
                        if(!tab || moved(tab.url) || moved(tab.pendingUrl) || tab.status!=='loading' || signal?.aborted) break;
                        await new Promise<void>(resolve=>setTimeout(resolve,250));
                    }
                    const navigated=moved((await page()).url);
                    if(navigated && (acted || result.actionObserved)) {
                        if(!region) observerFailures=0;
                        return recover(result.hint ?? 'The page navigated after the user acted.',{...result,actionObserved:true,navigatedFrom:startUrl},'navigated');
                    }
                    return recover(result.hint ?? result.status,{...result,...(acted ? {actionObserved:true} : {})});
                };
                const cancel=()=>{void browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});};
                signal?.addEventListener('abort',cancel,{once:true});
                let ready=started.ready===true;
                const startedAt=Date.now();
                let deadline=Date.now()+input.timeoutMs+(ready ? 1000 : 8000);
                let readyAt=ready ? Date.now() : undefined,interactions=0,lastInteractionAt=0,acted=false;
                try {
                    while (true) {
                        if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                        let result;
                        try{result=await browserCall('guidance',{tabId,id,action:'poll'});}
                        catch(error){return await lost({hint:error instanceof Error ? error.message : String(error)},acted);}
                        if(result.actionObserved) acted=true;
                        if(result.status!=='waiting') {
                            if(result.status==='lost') return await lost(result,acted);
                            if(result.status==='timeout') return await recover(result.hint ?? result.status,result,'timedOut');
                            if(result.status==='unconfirmed') return await recover(result.hint,result,'actedUnconfirmed');
                            if(region && result.status==='completed') return await visualCheck('regionAction',result);
                            if(!region && result.status==='completed') {observerFailures=0;return await finished(result);}
                            return {...result,page:await page(),hint:result.hint ?? 'Read the updated DOM or screenshot to verify the outcome before the next instruction.'};
                        }
                        // Drawing takes a few seconds at most; a step that never reports ready must still get progress checks.
                        if((result.ready===true || Date.now()-startedAt>=8000) && !ready){ready=true;readyAt=Date.now();deadline=readyAt+input.timeoutMs+1000;}
                        if((result.interactions ?? 0)>interactions){interactions=result.interactions;lastInteractionAt=Date.now();}
                        // Pauses between keystrokes are part of typing, not a missed action.
                        if(result.typing) deadline=Math.max(deadline,Date.now()+input.timeoutMs+1000);
                        if(readyAt!==undefined && !result.interactionActive && !result.typing && interactions>0 && Date.now()-readyAt>=input.checkAfterMs && Date.now()-lastInteractionAt>=800) {
                            if(region) return await visualCheck('interactionPause',result);
                            if(!acted && input.event!=='state') return await recover('Page activity was observed without the expected action.',result,'interactionPause');
                        }
                        if(Date.now()>=deadline) return await recover('The page stopped reporting progress.',result,'timedOut');
                        await new Promise<void>(resolve=>setTimeout(resolve,250));
                    }
                } finally {signal?.removeEventListener('abort',cancel); await browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});}
            },
        }),
        clickTarget: tool({
            description: 'Trusted click on target {ref} (from listControls or a changes report), {selector[,index]}, {role,name[,exact]}, {text[,exact]}, {mark,snapshotId}, or viewport CSS {x,y} as fallback. Scrolls into view, rejects ambiguity/occlusion, returns actual hit/focus/DOM/URL feedback and changes (new controls with refs, dialogs, messages). postScreenshot adds a crop.',
            inputSchema: toolSchemas.clickTarget,
            execute: async input => browserCall('gesture', {...input, action: 'click', tabId: input.tabId ?? getTabId()}),
            toModelOutput: ({output}: {output: any}) => gestureModelOutput(
                {ok: true, ...compactGestureOutput(output), ...(output.screenshot ? {screenshot: output.screenshot} : {})}, output.postAction),
        }),
        browserGesture: tool({
            description: 'Trusted gestures, batched. Each step: hover(target,duration) drag(from,to,steps,duration,humanize) scroll(target or deltaX/deltaY,smooth) type(text,perKeyDelay) press(chord e.g. Ctrl+Shift+K) pinch(target,factor) rotate(target,angle) selectRange(from,to) click(target). Targets as in clickTarget. Feedback waits 500ms per step by default; postScreenshot crops after the last step.',
            inputSchema: toolSchemas.browserGesture,
            execute: async ({gestures, postScreenshot, ...scope}, options) => {
                const tabId = scope.tabId ?? getTabId(), signal = abortSignal ?? options.abortSignal, results: any[] = [];
                for (const [index, step] of gestures.entries()) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    try {
                        const last = index === gestures.length - 1;
                        results.push(await browserCall('gesture', {...scope, ...step, tabId, postScreenshot: postScreenshot && last, baseline: index === 0, reportChanges: last}));
                    } catch (error) {
                        if (!results.length) throw error;
                        // Earlier steps already changed the page; report them so the model resumes rather than repeats.
                        return {error: error instanceof Error ? error.message : String(error), failedStep: index,
                            completed: compactGestureSteps(results), hint: 'Steps before failedStep already ran; do not repeat them.'};
                    }
                }
                const {screenshot, postAction, ...last} = results.at(-1);
                return {ok: true, steps: results.length, results: [...results.slice(0, -1), last],
                    ...(screenshot ? {screenshot, postAction} : {})};
            },
            // Results map to the gestures array by index, so steps carry no action or ok flag.
            toModelOutput: ({output}: {output: any}) => gestureModelOutput({ok: true, results: compactGestureSteps(output.results),
                ...(output.screenshot ? {screenshot: output.screenshot} : {})}, output.postAction),
        }),
        takeMarkedScreenshot: make('perception', 'Screenshot with marks and full selector/role/name/bbox legend; marks include only visible, non-occluded interactables, capped at 50. Click via clickTarget target {mark,snapshotId}. For canvas use mode grid (100 CSS px cells), then region C4 with snapshotId, scale 3 and gridSize 10 for precision. crosshair {x,y} previews a proposed point. Metadata reports CSS/device/image pixels, DPR, scroll, viewport, frame offsets and crop transforms. mode contours emits unverified visual shape marks (no OCR).'),
        browserTabs: make('tabs', "List/create/select/close tabs, wait for a popup by openerTabId, move/pin/unpin/mute/unmute (tabId or tabIds), note what a tab is for and what it showed, and finish the task. create opens url (or urls concurrently) in this task's tab group (group names it on the first create) and reuses a task tab already at that URL. Select or a single foreground create changes the target of ALL page tools for this run; background or multi-url create returns opened tabIds and leaves the target. list includes task: the task's own and consulted tabs with purposes and notes. Tabs that were already open stay as they are (close/move/pin/mute refuse them unless userRequested). finish closes the task's tabs except retained/keepTabIds ones, which leave the group, and returns the noted findings."),
        browserTabGroups: make('tabGroups', 'List tab groups with their tabIds; group tabIds into a new group (or an existing groupId) with optional title/color/collapsed; update a group\'s title/color/collapsed; ungroup tabIds; or move a group to an index/window.'),
        evaluateJavaScript: make('evaluate', 'Execute a raw async JS body (use return) with structured per-frame results/errors. Default ISOLATED uses the separate user-script world and requires Allow User Scripts. MAIN explicitly accesses page globals. Frame IDs come from extension APIs; CDP uses separate session/context IDs. Timeout limits the wait, not code side effects.'),
        persistentStore: make('store', 'Get/set/delete/list persistent JSON values by namespace and key. For set, pass value as a JSON-encoded string; it is decoded before storage. Do not store credentials.'),
        imageLibrary: tool({
            description: "Keep images in the browser under a name, to reuse on any site. save takes name and one source: url (http, blob or data), selector or ref of an img, canvas, video, svg or background-image element on the page (a generated image, say), attachment, or screenshot true (with selector to crop to it). The extension reads the bytes itself and returns a preview; never read an image out as base64 yourself. maxSize shrinks the longest side, format converts, replace overwrites a name. list shows what's saved; view shows one; rename and delete manage them; upload attaches one to the page, such as a chat message or form: method auto uses a file field, then pastes into a message box, then drops (selector narrows it; without one, the first file field or the box in use); copy puts one on the clipboard. Scripts and evaluateJavaScript read them with MH_getImage(name); see getSkill image_library.",
            inputSchema: imageToolSchema,
            execute: async ({ref, attachment, ...input}) => {
                const tabId = input.tabId || getTabId() || undefined;
                const selector = ref ? (await browserCall('guidance', {tabId, action: 'resolveRef', ref})).selector as string : input.selector;
                let dataUrl: string | undefined;
                if (attachment) {
                    const blob = await task?.findAttachment?.(attachment);
                    if (!blob) return {error: `No file named "${attachment}" was sent in this chat.`};
                    dataUrl = `data:${blob.type || 'application/octet-stream'};base64,${await blobToBase64(blob)}`;
                }
                return browserCall('images', {...input, tabId, selector, dataUrl});
            },
        }),
        siteRecipes: make('recipes', 'Save/get/list/delete reusable site recipes: name, origin, and ordered textual steps. Recipes are instructions to follow, not executable scripts.'),
        accessibilityTree: make('accessibility', 'Read a bounded accessibility view. DOM mode uses plain extension APIs and approximate names/roles in accessible open shadow roots. CDP mode returns the browser AX tree including a selected cross-origin session.'),
        clipboard: make('clipboard', 'Read or write clipboard text using an offscreen extension document.'),
        browserDownload: make('download', 'Start a download or query/cancel it using its downloadId.'),
        browserNotify: make('notify', 'Display a desktop notification with title and message.'),
        trustedInput: make('input', 'Raw CDP input fallback. Prefer clickTarget and browserGesture for semantic targets/composite actions. Coordinates always use the root main-frame viewport in CSS pixels, including iframe input. Returns event hit/focus/mutation/URL feedback. For clicks send mousePressed then mouseReleased; hover uses mouseMoved. Keyboard needs type and key/code/keyCode; touch uses points; drag uses from/to.'),
        networkCapture: make('network', 'Start/read/stop persistent CDP network capture including WebSocket frames, or read a response body by requestId and sessionId. Cursor and filter bound reads. Replay a captured requestId or explicit URL/method/headers/body in the selected page context with its cookies and CORS rules. Capture begins at start, not retroactively.'),
        deepDOM: make('dom', 'Inspect CDP frames/contexts, a flattened DOM that pierces closed shadow roots, query selectors across roots, describe a backendNodeId, or evaluate in a selected frame context. Use sessionId for out-of-process cross-origin frames and contextId for same-process frames. Query returns nodeIds; snapshot returns backendNodeIds. Detach releases the debugger.'),
    };
}
