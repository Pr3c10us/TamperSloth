import {tool} from 'ai';
import {z} from 'zod';
import {browserSchemas, toolSchemas, type BrowserOperation} from './browserSchemas';

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

export async function browserCall(operation: BrowserOperation, input: unknown) {
    const response = await chrome.runtime.sendMessage({type: 'BROWSER_CALL', operation, input});
    if (!response || response.error) throw new Error(response?.error ?? 'Browser service unavailable');
    return response;
}

export function browserImageOutput(output: any) {
    const {screenshot, ...details} = output;
    return {type: 'content' as const, value: [
        {type: 'file' as const, data: {type: 'data' as const, data: screenshot.split(',')[1]}, mediaType: screenshot.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'},
        ...(Object.keys(details).length ? [{type: 'text' as const, text: JSON.stringify(details)}] : []),
    ]};
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Model projection of gesture/clickTarget results. Duplicated fields are dropped
 * and, when nothing looks wrong, event/mutation lists become counts. Anything
 * suspicious keeps full detail; the UI and readToolResult keep the raw result. */
export function compactGestureOutput(output: any) {
    if (!output || typeof output !== 'object' || !output.feedback) return output;
    const {feedback, resolved, ...rest} = output;
    const {before, after, events = [], mutations, mutationCount, expectedTarget, tabURL, urlChanged, focusMoved,
        newDialogs, javascriptDialogs, ...otherFeedback} = feedback;
    const suspicious = feedback.observationLost || feedback.targetMatched === false
        || events.some((event: any) => event.trusted === false)
        || (['click', 'type', 'press'].includes(output.action ?? 'click') && !events.length);

    let slimResolved = resolved;
    if (resolved && typeof resolved === 'object') {
        const {localPoint, frameOffset, hit, metrics, ...kept} = resolved;
        const insideFrame = frameOffset && !same(frameOffset, {...frameOffset, x: 0, y: 0, scaleX: 1, scaleY: 1});
        slimResolved = {...kept,
            ...(hit && !same(hit, resolved.target) ? {hit} : {}),
            ...(metrics ? {metrics: (({url: _url, ...m}) => m)(metrics)} : {}),
            ...(insideFrame ? {localPoint, frameOffset} : {})};
    }
    const slimFeedback: Record<string, unknown> = {...otherFeedback, urlChanged, focusMoved, mutationCount,
        ...(tabURL && tabURL.before !== tabURL.after ? {tabURL} : {url: tabURL?.after ?? after?.url}),
        ...(focusMoved ? {focus: after?.focus} : {}),
        ...(newDialogs?.length ? {newDialogs} : {}),
        ...(javascriptDialogs?.length ? {javascriptDialogs} : {}),
        ...(expectedTarget && !same(expectedTarget, resolved?.target) ? {expectedTarget} : {})};
    if (suspicious) Object.assign(slimFeedback, {before, after, events, mutations});
    else Object.assign(slimFeedback, {eventTypes: events.map((event: any) => event.type),
        detail: 'Event/mutation details omitted; readToolResult(resultId) has the full result.'});
    return {...rest, ...(slimResolved !== undefined ? {resolved: slimResolved} : {}), feedback: slimFeedback};
}

const gestureModelOutput = (output: any) =>
    output.screenshot ? browserImageOutput(output) : {type: 'text' as const, value: JSON.stringify(output)};

export function createBrowserTools(getTabId: () => number, selectTab: (id: number) => void, abortSignal?: AbortSignal) {
    // Coordinate guidance cannot prove outcomes, so it unlocks only after selector-based guidance keeps failing.
    const FALLBACK_AFTER=2;
    let observerFailures=0;
    // Consecutive idle waits; the first re-waits with the overlay up, later ones may end the turn.
    let idleRounds=0;
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
        description, inputSchema: (operation === 'store' ? storeToolSchema : browserSchemas[operation]) as z.ZodType<Record<string, unknown>>,
        execute: async input => {
            const args = {...input} as Record<string, unknown>;
            if ('tabId' in browserSchemas[operation].shape && !args.tabId) args.tabId = getTabId();
            const result = await browserCall(operation, args);
            if (operation === 'tabs' && ['select', 'create'].includes(String(args.action)) && result.tabId) selectTab(result.tabId);
            return result;
        },
        ...(operation === 'perception' ? {toModelOutput: ({output}: {output: any}) => gestureModelOutput(output)} : {}),
    });
    return {
        annotatePage: tool({description:'Draw/remove/clear non-blocking on-page guidance: arrow, highlight, rectangle, ellipse, bracket, freehand or label. Anchor to a unique CSS selector (tracks layout/scroll), or viewport CSS box/points. The cursor draws the sketch strokes in the app lime accent; label text streams into its bubble. Drawing finishes before this call returns. Solid/dashed lines; lifetimeMs 0 persists. Clear when finished.',
            inputSchema:browserSchemas.guidance.omit({completion:true,annotationIds:true,instruction:true,event:true,expectedSelector:true,expectedState:true,timeoutMs:true,idleTimeoutMs:true,index:true,cue:true}).extend({action:z.enum(['draw','remove','clear'])}),
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
        waitForUserAction: tool({
            description:'Atomically draw one brief target tip and wait for user click/input/change/submit/focus, pointerup for drawing/dragging, or event state. completion {selector,state:visible|absent|checked|selected|pressed} proves success and skips an already-finished step before waiting. Choose a success condition, not button visibility. expectedSelector requires a resulting change after action. annotationIds retains intentional drawings until action. Observation failures return needsReview with fresh DOM/screenshot: inspect progress and resume at the first unfinished step, preserving visual guidance. Fallback only after repeated selector failures: region (viewport CSS box measured from a screenshot) replaces selector; it draws there, then returns visualCheck with a fresh screenshot after a press inside the region or after the user interacts and pauses (checkAfterMs). Judge visualCheck from the screenshot. Never collect field values. Escape or Stop cancels.',
            inputSchema: browserSchemas.guidance.pick({tabId:true,completion:true,annotationIds:true,selector:true,region:true,instruction:true,event:true,expectedSelector:true,expectedState:true,timeoutMs:true,idleTimeoutMs:true}).extend({instruction:z.string().min(1).max(300),
                checkAfterMs:z.number().int().min(3000).max(60000).default(10000).describe('Region fallback only: after this long, a pause following user interaction triggers a screenshot check.')}),
            execute: async (input, options) => {
                const tabId=input.tabId ?? getTabId(), id=crypto.randomUUID();
                const signal=abortSignal ?? options.abortSignal;
                if (input.event==='state' && !input.expectedSelector && !input.completion) throw new Error('State waits require expectedSelector or completion');
                const region=input.region;
                if (region && input.selector) throw new Error('Use either selector or region, not both');
                if (region && observerFailures<FALLBACK_AFTER) throw new Error(`Coordinate fallback unlocks after ${FALLBACK_AFTER} failed selector-based guidance attempts (${observerFailures} so far). Inspect the page and try a fresh unique selector first.`);
                if (signal?.aborted) throw new DOMException('Aborted','AbortError');
                const page=async()=>{try{const tab=await chrome.tabs.get(tabId);return {url:tab.url,title:tab.title};}catch{return {unavailable:true};}};
                const recover=async(reason: string, observation: any={},phase='interrupted')=>{
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    // An idle user or a navigation the user caused is not a selector failure, so it must not unlock coordinate fallback.
                    if(!region && !observation.idle && phase!=='navigated') observerFailures++;
                    idleRounds=observation.idle ? idleRounds+1 : 0;
                    const checkInAllowed=!!observation.idle && idleRounds>=2;
                    await browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});
                    const [dom,image]=await Promise.allSettled([
                        browserCall('accessibility',{tabId,mode:'dom',maxNodes:80}),
                        browserCall('perception',{tabId,mode:'plain'}),
                    ]);
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    return {...observation,status:'needsReview',recoverable:true,reason,observationPhase:phase,
                        ...(observation.idle ? {idleRounds,checkInAllowed} : {}),
                        actionObserved:observation.actionObserved ?? null,page:await page(),
                        instruction:input.instruction,completion:input.completion,
                        ...(dom.status==='fulfilled' ? {currentState:dom.value} : {inspectionIssue:String(dom.reason)}),
                        ...(image.status==='fulfilled' ? image.value : {}),
                        hint:(phase==='navigated' ? 'The user acted on the marked control and the page navigated, which ended observation. Verify the new page from the fresh DOM/screenshot below, then guide the next unfinished step. ' : '')+
                            (observation.idle ? (checkInAllowed
                                ? 'The user is still inactive. Send one short check-in about this current step only (where the control is, or offer help) and end the turn. Never list later steps in chat. '
                                : 'The user showed no page activity yet. In this same response, write at most one short line in chat about this current step, then call waitForUserAction again for the same step with idleTimeoutMs 45000 so the highlight stays up. Never list later steps in chat. ') : '')+
                            (observation.actionObserved===false ?'No expected user action was detected. Keep guidance on this step; do not advance or ask whether a later task is finished. ' : observation.actionObserved===true ? 'The expected action was detected, but its outcome remains unverified. ' : 'Action observation is unavailable; do not claim the user acted or made progress. ')+
                            'Inspect the fresh DOM/screenshot against completed steps. Resume visual guidance at the first unfinished step with current selectors. Do not repeat finished actions or abandon highlighting because observation failed. After two recovery attempts without new evidence, ask whether the user needs help with this specific step.'+(region ? '' : fallbackHint())};
                };
                // Region steps cannot inspect the DOM for success, so hand the model a fresh screenshot to judge.
                const visualCheck=async(trigger: 'regionAction'|'interactionPause', observation: any)=>{
                    await browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    const image=await browserCall('perception',{tabId,mode:'plain'}).then(value=>value,error=>({inspectionIssue:String(error)}));
                    if(signal?.aborted) throw new DOMException('Aborted','AbortError');
                    return {...observation,...image,status:'visualCheck',verification:'visual',trigger,actionObserved:trigger==='regionAction' ? true : null,
                        region,instruction:input.instruction,page:await page(),
                        hint:(trigger==='regionAction' ? 'The user pressed inside the marked region. ' : 'The user interacted with the page and paused, outside the marked region. ')+
                            'Nothing on the page proves the outcome. Judge from this screenshot whether the step is complete. If it is, continue to the next step; if not, call waitForUserAction again with the same or a re-measured region. Never claim progress the screenshot does not show.'};
                };
                let started;
                try {started=await retryGuidance({...input,tabId,id,action:'start'},signal);}
                catch(error){return recover(error instanceof Error ? error.message : String(error),{},'notStarted');}
                if(started.status!=='waiting') {
                    if(region && started.status==='completed' && !started.alreadySatisfied) return visualCheck('regionAction',started);
                    if(!region && started.status==='completed') {observerFailures=0;idleRounds=0;}
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
                let deadline=Date.now()+input.timeoutMs+(ready ? 1000 : 8000);
                const startedAt=Date.now();let interactions=0,lastInteractionAt=0,acted=false;
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
                            if(region && result.status==='completed') return await visualCheck('regionAction',result);
                            if(!region && result.status==='completed') {observerFailures=0;idleRounds=0;}
                            return {...result,page:await page(),hint:result.hint ?? 'Read the updated DOM or screenshot to verify the outcome before the next instruction.'};
                        }
                        if(result.ready===true && !ready){ready=true;deadline=Date.now()+input.timeoutMs+1000;}
                        if(region) {
                            if((result.interactions ?? 0)>interactions){interactions=result.interactions;lastInteractionAt=Date.now();}
                            if(interactions>0 && Date.now()-startedAt>=input.checkAfterMs && Date.now()-lastInteractionAt>=800) return await visualCheck('interactionPause',result);
                        }
                        if(Date.now()>=deadline) return await recover('The page stopped reporting progress.',result,'timedOut');
                        await new Promise<void>(resolve=>setTimeout(resolve,250));
                    }
                } finally {signal?.removeEventListener('abort',cancel); await browserCall('guidance',{tabId,id,action:'cancel'}).catch(()=>{});}
            },
        }),
        clickTarget: tool({
            description: 'Trusted click on target {selector[,index]}, {role,name[,exact]}, {text[,exact]}, {mark,snapshotId}, or viewport CSS {x,y} as fallback. Scrolls into view, rejects ambiguity/occlusion, returns actual hit/focus/DOM/URL feedback. postScreenshot adds a crop.',
            inputSchema: toolSchemas.clickTarget,
            execute: async input => browserCall('gesture', {...input, action: 'click', tabId: input.tabId ?? getTabId()}),
            toModelOutput: ({output}: {output: any}) => gestureModelOutput(compactGestureOutput(output)),
        }),
        browserGesture: tool({
            description: 'Trusted gestures, batched. Each step: hover(target,duration) drag(from,to,steps,duration,humanize) scroll(target or deltaX/deltaY,smooth) type(text,perKeyDelay) press(chord e.g. Ctrl+Shift+K) pinch(target,factor) rotate(target,angle) selectRange(from,to) click(target). Targets as in clickTarget. Feedback waits 500ms per step by default; postScreenshot crops after the last step.',
            inputSchema: toolSchemas.browserGesture,
            execute: async ({gestures, postScreenshot, ...scope}, options) => {
                const tabId = scope.tabId ?? getTabId(), signal = abortSignal ?? options.abortSignal, results: any[] = [];
                for (const [index, step] of gestures.entries()) {
                    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
                    try {
                        results.push(await browserCall('gesture', {...scope, ...step, tabId, postScreenshot: postScreenshot && index === gestures.length - 1}));
                    } catch (error) {
                        if (!results.length) throw error;
                        // Earlier steps already changed the page; report them so the model resumes rather than repeats.
                        return {error: error instanceof Error ? error.message : String(error), failedStep: index,
                            completed: results.map(compactGestureOutput), hint: 'Steps before failedStep already ran; do not repeat them.'};
                    }
                }
                const {screenshot, postAction, ...last} = results.at(-1);
                return {ok: true, steps: results.length, results: [...results.slice(0, -1), last],
                    ...(screenshot ? {screenshot, postAction} : {})};
            },
            toModelOutput: ({output}: {output: any}) => gestureModelOutput({...output,
                // Page metrics only matter after the final step.
                results: output.results.map((result: any, index: number) => {
                    const slim = compactGestureOutput(result);
                    if (index < output.results.length - 1 && slim.resolved) delete slim.resolved.metrics;
                    return slim;
                })}),
        }),
        takeMarkedScreenshot: make('perception', 'Screenshot with marks and full selector/role/name/bbox legend; marks include only visible, non-occluded interactables, capped at 50. Click via clickTarget target {mark,snapshotId}. For canvas use mode grid (100 CSS px cells), then region C4 with snapshotId, scale 3 and gridSize 10 for precision. crosshair {x,y} previews a proposed point. Metadata reports CSS/device/image pixels, DPR, scroll, viewport, frame offsets and crop transforms. mode contours emits unverified visual shape marks (no OCR).'),
        browserTabs: make('tabs', 'List/create/select/close tabs or wait for a popup by openerTabId. Select/create changes the target of ALL page tools for this run; waitPopup reports the latest live popup, then select it.'),
        evaluateJavaScript: make('evaluate', 'Execute a raw async JS body (use return) with structured per-frame results/errors. Default ISOLATED uses the separate user-script world and requires Allow User Scripts. MAIN explicitly accesses page globals. Frame IDs come from extension APIs; CDP uses separate session/context IDs. Timeout limits the wait, not code side effects.'),
        persistentStore: make('store', 'Get/set/delete/list persistent JSON values by namespace and key. For set, pass value as a JSON-encoded string; it is decoded before storage. Do not store credentials.'),
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
