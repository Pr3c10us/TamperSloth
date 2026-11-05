import {z} from 'zod';
const tabId = z.number().int().positive().optional();
const sessionId = z.string().max(200).optional();
const point = z.object({x: z.number().finite(), y: z.number().finite()});
export const elementTarget = z.union([
    z.object({ref: z.string().min(1).max(20)}),
    z.object({selector: z.string().min(1).max(1000), index: z.number().int().nonnegative().optional()}),
    z.object({role: z.string().min(1).max(100), name: z.string().min(1).max(300), exact: z.boolean().default(true), index: z.number().int().nonnegative().optional()}),
    z.object({text: z.string().min(1).max(300), exact: z.boolean().default(true), index: z.number().int().nonnegative().optional()}),
    z.object({mark: z.number().int().positive(), snapshotId: z.string().min(1).max(200)}),
    point,
]);

// Model-facing gesture schemas. Tool definitions are re-sent on every agent step,
// so these stay flat and skip limits/defaults; the browser service re-parses each
// call with browserSchemas.gesture, which applies defaults and enforces limits.
const toolTarget = z.object({ref: z.string().optional(), selector: z.string().optional(), role: z.string().optional(), name: z.string().optional(),
    text: z.string().optional(), exact: z.boolean().optional(), index: z.number().int().optional(),
    mark: z.number().int().optional(), snapshotId: z.string().optional(), x: z.number().optional(), y: z.number().optional()})
    .refine(target => elementTarget.safeParse(target).success, 'Target needs ref, selector, role+name, text, mark+snapshotId, or x+y');
const toolScope = {tabId: z.number().int().optional(), sessionId: z.string().optional(), frameId: z.string().optional(),
    contextId: z.number().int().optional(), feedbackMs: z.number().int().optional(), postScreenshot: z.boolean().optional()};
/** Large enough for a whole sketch, including tool-switch key presses, in one call. */
export const MAX_GESTURE_STEPS = 60;
export const gestureStep = z.object({
    action: z.enum(['click', 'hover', 'drag', 'scroll', 'type', 'press', 'pinch', 'rotate', 'selectRange']),
    target: toolTarget.optional(), from: toolTarget.optional(), to: toolTarget.optional(), text: z.string().optional(), chord: z.string().optional(),
    button: z.enum(['left', 'right', 'middle']).optional(), clickCount: z.number().int().optional(),
    deltaX: z.number().optional(), deltaY: z.number().optional(), smooth: z.boolean().optional(),
    duration: z.number().int().optional(), steps: z.number().int().optional(), humanize: z.boolean().optional(),
    perKeyDelay: z.number().int().optional(), factor: z.number().optional(), angle: z.number().optional()});
export const toolSchemas = {
    clickTarget: z.object({...toolScope, target: toolTarget, button: z.enum(['left', 'right', 'middle']).optional(), clickCount: z.number().int().optional()}),
    browserGesture: z.object({...toolScope, gestures: z.array(gestureStep).min(1).max(MAX_GESTURE_STEPS)
        .describe(`Run in order; stops at the first failure. Up to ${MAX_GESTURE_STEPS} steps: batch every stroke of a drawing in one call, splitting only beyond that.`)}),
};

/** A control named the way a person would see it: a ref from listControls, role and name, or visible text. */
export const guideTarget = z.object({ref:z.string().min(1).max(20).optional(), role:z.string().min(1).max(60).optional(),
    name:z.string().min(1).max(300).optional(), text:z.string().min(1).max(300).optional(),
    exact:z.boolean().optional(), index:z.number().int().nonnegative().optional()})
    .refine(target=>!!(target.ref || target.name || target.text),'Target needs ref, role+name, or text');

export const browserSchemas = {
    guidance: z.object({tabId, action:z.enum(['draw','remove','clear','start','poll','cancel','cue','controls','changes','resolveRef']),
        index:z.number().int().nonnegative().default(0), cue:z.enum(['click','type','scroll','hover']).default('hover'),
        // cue: remember the page as it is, so the following changes call reports what the action did.
        baseline:z.boolean().default(false), ref:z.string().min(1).max(20).optional(),
        id:z.string().min(1).max(100).optional(), selector:z.string().min(1).max(1000).optional(), target:guideTarget.optional(),
        query:z.string().max(200).optional(), limit:z.number().int().min(1).max(80).default(40), fresh:z.boolean().default(false),
        path:z.array(point).min(2).max(500).optional(), shape:z.enum(['rectangle','ellipse']).default('rectangle'),
        kind:z.enum(['arrow','highlight','rectangle','ellipse','bracket','freehand','label']).default('highlight'),
        box:point.extend({width:z.number().nonnegative(),height:z.number().nonnegative()}).optional(),
        points:z.array(point).min(2).max(500).optional(), label:z.string().max(300).optional(), labelPosition:point.optional(),
        color:z.enum(['lime','moss','amber','sky','rose']).default('lime').describe('All guide drawings use the app lime accent. Other values are accepted for legacy calls.'), lineStyle:z.enum(['solid','dashed']).default('dashed'),
        lineWidth:z.number().min(1).max(8).default(2.5), lifetimeMs:z.number().int().min(0).max(120000).default(0),
        annotationIds:z.array(z.string().min(1).max(100)).max(30).default([]),
        region:point.extend({width:z.number().positive(),height:z.number().positive()}).optional().describe('Viewport CSS box measured from a screenshot. Alone: coordinate fallback used instead of selector. With a canvas selector: where on that canvas to mark the drawing area.'),
        completion:z.object({selector:z.string().min(1).max(1000).optional(), ref:z.string().min(1).max(20).optional(), text:z.string().min(1).max(300).optional(),
            state:z.enum(['visible','absent','checked','selected','pressed','expanded'])}).optional()
            .describe('Success condition. With no selector, ref or text it applies to the step target itself, e.g. {state:"expanded"} for a menu button or {state:"pressed"} for a tool.'),
        instruction:z.string().min(1).max(300).optional(), event:z.enum(['click','input','change','submit','focusin','pointerup','state']).default('click'),
        expectedSelector:z.string().min(1).max(1000).optional(), expectedState:z.enum(['visible','absent','checked']).default('visible'),
        timeoutMs:z.number().int().min(1000).max(120000).default(20000).describe('Maximum time to observe the step. Increase only for a known slow page change.'),
        idleTimeoutMs:z.number().int().min(3000).max(60000).default(10000).describe('Check in when the user shows no page activity for this long; do not silently repeat the wait.')}),
    perception: z.object({tabId, sessionId, frameId: z.string().max(200).optional(), contextId: z.number().int().positive().optional(),
        mode: z.enum(['marks', 'grid', 'plain', 'contours']).default('marks'), maxMarks: z.number().int().min(1).max(50).default(50),
        region: z.union([z.string().regex(/^[A-Z]+[1-9][0-9]*$/), point.extend({width: z.number().positive(), height: z.number().positive()})]).optional(),
        snapshotId: z.string().max(200).optional(), scale: z.number().min(1).max(6).default(1),
        gridSize: z.number().int().min(5).max(500).default(100), crosshair: point.optional()}),
    gesture: z.object({tabId, sessionId, frameId: z.string().max(200).optional(), contextId: z.number().int().positive().optional(),
        action: z.enum(['click', 'hover', 'drag', 'scroll', 'type', 'press', 'pinch', 'rotate', 'selectRange']).default('click'),
        target: elementTarget.optional(), from: elementTarget.optional(), to: elementTarget.optional(),
        text: z.string().max(100000).optional(), chord: z.string().max(100).optional(),
        button: z.enum(['left', 'right', 'middle']).default('left'), clickCount: z.number().int().min(1).max(2).default(1),
        deltaX: z.number().finite().default(0), deltaY: z.number().finite().default(0), smooth: z.boolean().default(false),
        duration: z.number().int().min(0).max(5000).default(300), steps: z.number().int().min(2).max(100).default(12), humanize: z.boolean().default(false),
        perKeyDelay: z.number().int().min(0).max(500).default(0), factor: z.number().min(0.1).max(10).default(1.5), angle: z.number().min(-360).max(360).default(90),
        feedbackMs: z.number().int().min(0).max(1000).default(500), postScreenshot: z.boolean().default(false),
        // Set by browserGesture so a batch is measured from its first step and reported after its last.
        baseline: z.boolean().default(true), reportChanges: z.boolean().default(true)}),
    tabs: z.object({action: z.enum(['list', 'create', 'select', 'close', 'waitPopup', 'move', 'pin', 'unpin', 'mute', 'unmute', 'note', 'finish']), tabId,
        tabIds: z.array(z.number().int().positive()).min(1).max(100).optional().describe('move/pin/unpin/mute/unmute/close several tabs at once instead of tabId.'),
        url: z.url().optional(), urls: z.array(z.url()).min(1).max(10).optional().describe('create: open several pages at once; they load concurrently in the background.'),
        group: z.string().min(1).max(40).optional().describe('create: short descriptive title of this task\'s tab group, e.g. "Laptop Comparison". Required for the task\'s first create; later tabs join the same group.'),
        purpose: z.string().max(200).optional().describe('create/note: why the task uses this tab, e.g. "Dribbble portfolio shots".'),
        note: z.string().max(500).optional().describe('note: a finding from this tab to keep with its source.'),
        retain: z.boolean().optional().describe('note: true keeps the tab open (outside the group) at finish, e.g. it holds a final result or unsaved user work.'),
        keepTabIds: z.array(z.number().int().positive()).max(100).optional().describe('finish: task tabs to keep open besides retained ones.'),
        userRequested: z.boolean().optional().describe('Only when the user explicitly asked to change tabs or groups they already had open.'),
        openerTabId: z.number().int().positive().optional(), timeoutMs: z.number().int().min(100).max(30000).default(5000),
        background: z.boolean().default(false).describe('create only: open without focusing it and without retargeting page tools. Pass its tabId to page tools, or select it later.'),
        index: z.number().int().min(-1).optional().describe('move: position in the window; -1 is the end.'),
        windowId: z.number().int().nonnegative().optional().describe('move: destination window; defaults to the current one.'),
        // Filled in by the tool wrapper, never by the model.
        conversationId: z.string().max(200).optional(), originTabId: z.number().int().positive().optional(), originBlank: z.boolean().optional()}),
    tabGroups: z.object({action: z.enum(['list', 'group', 'update', 'ungroup', 'move']),
        userRequested: z.boolean().optional().describe('Only when the user explicitly asked to change tabs or groups they already had open.'),
        conversationId: z.string().max(200).optional(),
        tabIds: z.array(z.number().int().positive()).min(1).max(100).optional(),
        groupId: z.number().int().nonnegative().optional().describe('group: add tabs to this existing group instead of creating one. update/move: the group to change.'),
        title: z.string().max(100).optional(), color: z.enum(['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange']).optional(),
        collapsed: z.boolean().optional(), index: z.number().int().min(-1).optional().describe('move: tab index the group starts at; -1 is the end.'),
        windowId: z.number().int().nonnegative().optional().describe('move: destination window.')}),
    // Run lifecycle only; not model tools.
    taskStatus: z.object({conversationId: z.string().min(1).max(200), status: z.enum(['working', 'waiting'])}),
    task: z.object({conversationId: z.string().min(1).max(200)}),
    evaluate: z.object({tabId, code: z.string().min(1).max(100000), world: z.enum(['ISOLATED', 'MAIN']).default('ISOLATED'),
        frameIds: z.array(z.number().int().nonnegative()).min(1).max(50).optional(), timeoutMs: z.number().int().min(100).max(30000).default(10000)}),
    store: z.object({action: z.enum(['get', 'set', 'delete', 'list']), namespace: z.string().min(1).max(200), key: z.string().min(1).max(200).optional(), value: z.json().optional()}),
    recipes: z.object({action: z.enum(['list', 'get', 'save', 'delete']), id: z.string().min(1).max(200).optional(),
        recipe: z.object({name: z.string().min(1).max(200), origin: z.url(), steps: z.array(z.string().max(10000)).min(1).max(100)}).optional()}),
    accessibility: z.object({tabId, mode: z.enum(['dom', 'cdp']).default('dom'), frameIds: z.array(z.number().int().nonnegative()).min(1).max(50).optional(), sessionId,
        frameId: z.string().max(200).optional(),
        maxNodes: z.number().int().min(1).max(1000).default(250)}),
    images: z.object({tabId, action: z.enum(['save', 'list', 'view', 'delete', 'rename', 'upload', 'copy']),
        method: z.enum(['auto', 'file', 'paste', 'drop']).default('auto').describe('upload: how to hand it over. auto uses a file field, then pastes into a message box, then drops.'),
        name: z.string().min(1).max(100).optional(), newName: z.string().min(1).max(100).optional(),
        url: z.string().min(1).max(20000).optional(), selector: z.string().min(1).max(1000).optional(), index: z.number().int().nonnegative().default(0),
        screenshot: z.boolean().optional(), description: z.string().max(500).optional(), replace: z.boolean().optional(),
        maxSize: z.number().int().min(16).max(8192).optional(), format: z.enum(['png', 'jpeg', 'webp']).optional(),
        // An attachment the panel already holds; never model input (it would be the image as text).
        dataUrl: z.string().startsWith('data:').max(90000000).optional()}),
    clipboard: z.object({action: z.enum(['read', 'write']), text: z.string().max(1000000).optional()}),
    download: z.object({action: z.enum(['start', 'status', 'cancel']), url: z.url().optional(), filename: z.string().max(250).optional(), downloadId: z.number().int().nonnegative().optional()}),
    notify: z.object({title: z.string().min(1).max(200), message: z.string().min(1).max(2000)}),
    input: z.object({tabId, sessionId, action: z.enum(['mouse', 'key', 'text', 'touch', 'drag']),
        feedbackMs: z.number().int().min(0).max(1000).default(500),
        type: z.string().max(30).optional(), x: z.number().finite().optional(), y: z.number().finite().optional(),
        button: z.enum(['none', 'left', 'right', 'middle']).default('left'), buttons: z.number().int().min(0).max(31).optional(),
        clickCount: z.number().int().min(0).max(3).default(1), modifiers: z.number().int().min(0).max(15).default(0),
        deltaX: z.number().finite().default(0), deltaY: z.number().finite().default(0),
        key: z.string().max(100).optional(), code: z.string().max(100).optional(), keyCode: z.number().int().min(0).max(255).optional(),
        text: z.string().max(100000).optional(), points: z.array(point.extend({id: z.number().int().nonnegative().optional()})).max(10).optional(),
        from: point.optional(), to: point.optional(), steps: z.number().int().min(2).max(100).default(10)}),
    network: z.object({tabId, sessionId, action: z.enum(['start', 'read', 'body', 'replay', 'stop']),
        after: z.number().int().nonnegative().default(0), filter: z.string().max(200).default(''), clear: z.boolean().default(false),
        requestId: z.string().max(200).optional(), url: z.url().optional(), method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']).optional(),
        headers: z.record(z.string(), z.string()).optional(), body: z.string().max(1000000).optional(), contextId: z.number().int().positive().optional()}),
    dom: z.object({tabId, sessionId, action: z.enum(['frames', 'snapshot', 'query', 'describe', 'evaluate', 'detach']),
        selector: z.string().min(1).max(1000).optional(), backendNodeId: z.number().int().positive().optional(),
        expression: z.string().min(1).max(100000).optional(), contextId: z.number().int().positive().optional(),
        maxNodes: z.number().int().min(1).max(1000).default(250)}),
};
export type BrowserOperation = keyof typeof browserSchemas;
