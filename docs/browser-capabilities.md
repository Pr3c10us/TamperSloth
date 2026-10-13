# Browser capabilities: phases 1 and 2

Build with `npm run build`, then load or reload the generated `extension` directory at `chrome://extensions`. Chrome 138+ is required. Enable **Allow User Scripts** in the extension details for saved scripts and raw JavaScript. Downloads, notifications, clipboard and offscreen permissions are included in the manifest. CDP actions use the debugger permission and Chrome displays its debugging indicator.

The agent can enable the following tool groups with `enableTools`. Tools also activate from matching request terms.

| Group | Tools | Behavior |
| --- | --- | --- |
| `browser` | `browserTabs` | List, create, select, close and track popups by opener. Selecting or creating a tab changes every page tool's target for that run. Popup metadata survives service worker restarts in session storage. |
| `browser` | `evaluateJavaScript` | Raw async function body, structured JSON returns, per-frame errors, timeout and explicit MAIN-world opt-in. |
| `browser` | `persistentStore`, `siteRecipes` | Namespaced JSON values and reusable site instructions in local extension storage. Recipes do not execute automatically. |
| `browser` | `accessibilityTree` | DOM-derived roles and names with plain scripting APIs, or Chrome's AX tree with CDP. |
| `system` | `clipboard`, `browserDownload`, `browserNotify` | Clipboard text via an offscreen document, download start/status/cancel, desktop notifications. |
| `input` | `trustedInput`, `deepDOM` | CDP mouse, keyboard, text insertion, touch and pointer/HTML drag; frame and shadow DOM inspection. |
| `input` | `clickTarget`, `browserGesture` | Element targets, marked targets, composite gestures, and action feedback. |
| `visual`, `input` | `takeMarkedScreenshot` | Set-of-Mark legend, grid overlays, region zoom, crosshairs and contour candidates. |
| `network` | `networkCapture`, `deepDOM` | Persistent capture, HTTP events, WebSocket frames, bounded response bodies, captured or explicit request replay. |

## Browser controls

Saved scripts run on matching pages according to each script's active or paused setting. Browser control messages are accepted only from the extension UI; user-script messages use their separate channel. The chat's Stop button cancels the current response without disabling saved scripts.

Network capture can be stopped per tab to detach the debugger and release held input. Raw JavaScript's timeout limits waiting for an asynchronous result; it does not preempt an infinite synchronous loop or prevent later side effects. Reload a page to remove existing user-script effects.

## Frames, worlds and bounded results

`evaluateJavaScript` accepts an async body such as `return {title: document.title};`. The default `ISOLATED` option maps to Chrome's separate `USER_SCRIPT` world because ordinary extension isolated worlds disallow raw eval under extension CSP. `MAIN` accesses page globals. Values use JSON serialization; bigint is represented as `{type: "bigint", value: "…"}`, undefined becomes null with a valueType, and cyclic values produce structured errors. Returns are limited to 1 MB.

DOM accessibility mode approximates accessible names and implicit roles, skips hidden elements, and visits open shadow roots. It is not the browser's computed accessibility tree. CDP mode provides that tree; use `frameId` from `deepDOM` for a same-process frame or `sessionId` for an out-of-process frame.

Use `deepDOM` with `action: "frames"` to obtain CDP frame IDs, child session IDs and execution context IDs. Child iframe targets auto-attach recursively. For out-of-process frames pass `sessionId`; for same-process frame evaluation pass `contextId`. These identifiers differ from extension `frameIds` used by plain scripting. DOM snapshots pierce closed shadow roots; selector queries search each document and shadow root and return node IDs. Snapshots expose backend node IDs for `describe`. Results explicitly report truncation.

Trusted input uses viewport CSS pixels. A click is a `mousePressed` followed by `mouseReleased`; a hover is `mouseMoved`. Keyboard actions accept CDP event types, key, code and virtual key code; text insertion uses `action: "text"`. Touch start/move require points, while end/cancel require an empty array. Drag interpolates a pressed pointer and handles intercepted HTML drag data when Chrome emits it.

## Semantic targeting and visual precision

Prefer `clickTarget` to raw coordinates:

```json
{"target":{"role":"button","name":"Send"}}
```

Selectors, exact visible text, role plus computed AX name, and screenshot mark IDs are supported. Multiple matches require a narrower target or explicit zero-based index. Targets outside the viewport scroll into view. Disabled, detached and occluded targets fail before input. The target is resolved again after hover because menus can move elements. Closed-root selectors use CDP; role targeting uses Chrome's AX tree.

`takeMarkedScreenshot` defaults to visible interactable elements with at most 50 marks. The legend includes `{id, selector, role, name, bbox, center, source, hitTest}`. Inline handlers, cursor hints and bounded CDP listener inspection help discover controls. Marks remain anchored to their DOM element; changed names, expired snapshots and wrong-frame references are rejected. Screenshots and their legend are sent together as image and text model content, and can be recovered together from the result archive. The chat displays the tool's status without a screenshot preview or targeting-details disclosure.

```json
{"target":{"mark":14,"snapshotId":"<from screenshot>"}}
```

For a canvas, capture a coarse grid and then zoom a labeled cell with a finer grid:

```json
{"mode":"grid","gridSize":100}
{"mode":"grid","snapshotId":"<coarse snapshot>","region":"C4","scale":3,"gridSize":10}
```

Labels start at A1 within the current crop, while burned-in numeric axis labels always use root viewport CSS coordinates. A region can also be an explicit `{x,y,width,height}` rectangle. `crosshair: {x,y}` draws a proposed point without clicking. Stale grid snapshots fail if URL, viewport, zoom or scroll changed. Excessively dense grids and images over 16 million pixels are rejected.

All screenshots include actual source/output pixel dimensions. Metadata includes DPR, layout and visual viewport, scroll offsets, visible CSS region, crop, scale, and CSS-to-image transforms. Convert image coordinates to root CSS with `x = cssRegion.x + imageX / imagePixelsPerCSSPixel.x`, and the corresponding y formula. Iframe offsets and axis-aligned CSS scales compose through ancestor frame owners, including child CDP sessions; trusted input is sent to the root main-frame viewport. Rotated/skewed frame owners fail explicitly.

Plain, marked, grid, contour and post-action screenshots share a freshness guard. Captures in the same window serialize tab activation through verification; the agent runtime also sequences screenshots behind earlier page mutations, navigation and tab selection while independent reads remain parallel. After activation, capture waits for document loading (up to 3 seconds), then at least two animation frames and a task yield, 120 ms of DOM/scroll quiet, fonts and finite animations (up to 1.5 seconds). Document identity, DOM revision, URL, viewport/scroll/zoom and the active target are checked before and after capture. Raced images are discarded and rebuilt, including their marks, within the same tool call, with at most three attempts; only the final image reaches the model. Plain screenshots also check iframe document identities/revisions, and visible-tab captures are spaced globally to respect Chrome's two-per-second quota. Failed freshness measurement returns an error rather than an unchecked image.

`metadata.freshness` reports completion time, elapsed milliseconds, attempt count and `settled`. A bounded wait on an active page can report `settled: false`; this does not establish completion of delayed API data or business actions. Canvas/video frames and infinite CSS animations can change without DOM mutations, so the guard cannot certify pixel stability for those surfaces. Use a specific UI condition when the task requires a final application state. These capture checks reduce model-side retakes without promising atomic browser snapshots.

Input feedback includes captured trusted events and actual hit descriptions, focus before/after, bounded DOM mutation summaries, URL changes and dialogs, observed for 500 ms by default. Navigation can destroy the observation context; feedback then says `observationLost`. `postScreenshot: true` adds a cropped post-action view. Feedback describes what happened; it does not guarantee the application's intended business action succeeded. The model sees a compact projection per step: the element used, a navigated URL, moved focus, changed scroll, new dialogs and the mutation count, plus flags when the click landed on a different element, no input events fired or events were untrusted. Points, boxes, metrics and event lists stay in the raw result, available through `readToolResult`.

`browserGesture` takes an ordered `gestures` batch (up to 60 steps) and stops at the first failure, reporting the steps that already ran. Batching consecutive steps such as the strokes of a drawing avoids a model round trip, and a full re-send of the context, per step. Each step supports click, hover with duration, Bézier drag with optional jitter, smooth incremental wheel scrolling, text insertion with per-character delay, parsed keyboard chords, pinch, rotate and text-range pointer selection. Held keys, mouse buttons and touch points are released on a best-effort basis even when a gesture fails. Text insertion emits browser text input, rather than pretending every character is a physical key. Range selection uses rendered text edges and requires both endpoints in the same targeted frame and viewport.

`mode: "contours"` detects bounded image edge components and produces synthetic mark candidates for canvas/image regions. These marks are explicitly unverified, expire after 30 seconds, and require an unchanged viewport/URL/scroll/zoom. This is lightweight contour detection, without OCR, learned object detection or framework adapters. Inspect candidates before using them.

Capture starts when `networkCapture` is started, without retroactive coverage. Each tab shares one owned debugger connection with console and input tools. The buffer holds 500 events, each bounded to 24 KB; oversized payloads are marked truncated. Read with `after` cursor and `filter`, and use the event's `sessionId` with its `requestId` to retrieve a body. Request replay can use a captured request ID, or explicit URL/method/headers/body. Replay runs page fetch with cookies and normal CORS restrictions, strips browser-managed headers and reports JavaScript exceptions. It does not reproduce streaming bodies, multipart uploads or browser-managed transport details exactly. Chrome restricted pages, DevTools conflicts and enterprise restrictions may reject debugger attachment; those failures are returned to the agent.

## Validation

`npm test` exercises production TypeScript with mocked Chrome APIs: stop/restart persistence, concurrent audit writes, legacy tool blocking, tab retargeting, popup discovery, raw JS values/errors/timeouts, storage/recipes, shared debugger ownership, bounded WebSocket capture, cross-origin sessions, shadow-root queries, trusted input, replay, clipboard/download/notification routing and permissions. Targeting tests also cover semantic ambiguity/occlusion, mark expiry, actual-event feedback, pixel transforms, nested iframe offsets, grid zoom, image/legend projection, contour boxes, chord sequences and touch cleanup. `npm run build` checks TypeScript and generates both the service worker and offscreen clipboard document.

Browser-platform behavior still needs a live unpacked-extension smoke test: open a popup, copy/paste text, download a file, hover/drag on an interactive page, inspect a cross-origin iframe and a closed shadow root, capture a WebSocket exchange, and stop network capture. Mocked tests do not establish Chrome's event trust, clipboard availability or platform-specific drag behavior.

API references: [Chrome debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) and [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts).
