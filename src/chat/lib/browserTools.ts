import {tool} from 'ai';
import {z} from 'zod';
import {browserSchemas, type BrowserOperation} from './browserSchemas';

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

export function createBrowserTools(getTabId: () => number, selectTab: (id: number) => void) {
    const make = <K extends BrowserOperation,>(operation: K, description: string) => tool({
        description, inputSchema: (operation === 'store' ? storeToolSchema : browserSchemas[operation]) as z.ZodType<Record<string, unknown>>,
        execute: async input => {
            const args = {...input} as Record<string, unknown>;
            if ('tabId' in browserSchemas[operation].shape && !args.tabId) args.tabId = getTabId();
            const result = await browserCall(operation, args);
            if (operation === 'tabs' && ['select', 'create'].includes(String(args.action)) && result.tabId) selectTab(result.tabId);
            return result;
        },
        ...(['perception', 'gesture'].includes(operation) ? {toModelOutput: ({output}: {output: any}) => output.screenshot ? browserImageOutput(output) : {type: 'text' as const, value: JSON.stringify(output)}} : {}),
    });
    return {
        clickTarget: make('gesture', 'Trusted element-anchored click. Use target {selector}, {role,name}, {text}, or {mark,snapshotId}; no pixel arithmetic. Scrolls into view, rejects ambiguity/occlusion, resolves again after hover, then returns actual hit/focus/DOM/URL/dialog feedback. Default action click. Coordinates {x,y} are viewport CSS fallback.'),
        browserGesture: make('gesture', 'Composite trusted gestures: hover(target,duration), drag(from,to,steps,duration,humanize), scroll(target or delta,smooth), type(text,perKeyDelay), press(chord such as Ctrl+Shift+K), pinch(target,factor), rotate(target,angle), selectRange(from,to). Element targets accept selector, role+name, text, or mark+snapshotId. Feedback defaults to 500ms; postScreenshot adds a crop.'),
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
