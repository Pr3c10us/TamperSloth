# Redesigning a live page from a browser agent: constraints, techniques and reuse

Evidence labels used in these notes:
- **Cited Findings** are from the linked source. "(search summary)" means I saw the source only through a search result summary, not a full read. Treat those as weaker.
- **Own test** means I ran it myself on 2026-11-02. Method is under question 2.
- **Inferences** are my reasoning and are not sourced.
- TamperSloth facts come from a read-only look at `extension/src/chat/lib/prompt.ts`, `skills.ts` and `toolRuntime.ts`. I read no other repo files, so capabilities elsewhere in the extension are unknown to me.

## Which agents, extensions and tools do AI redesign of live pages, and how well does it work?

### Takeaway
The field splits into three groups: in-place overlays that inject CSS and JS (ClickRemix, Stylebot's agent CLI, AI Style Upgrade), page-capture tools that generate a new codebase (Shuffle, Figr, Redesignr), and visual editors that write back to source (Cursor, Onlook, React Grab). Only the first group has TamperSloth's constraints, and I found no independent evidence of how well any of them work.

### Cited Findings

**In-place overlays (closest to TamperSloth)**
- ClickRemix turns a plain-language request into CSS and JS injected over the page, with live preview, editable generated code and a target mode that pins a change to one element. Saved styles are per domain in Chrome sync storage and can be toggled off. It is in beta, charges one credit per generated change, and discloses no failure modes or site compatibility limits — [ClickRemix](https://clickremix.com/)
- Stylebot has no described built-in AI model. Its CLI lets a coding agent open a tab, inspect page structure, apply a CSS file and take a screenshot. It also keeps per-site profiles and a restorable version history — [Stylebot](https://stylebot.dev/)
- AI Style Upgrade ships a stylesheet and a small script at the start of `<body>`, so rollback means deleting two lines. It keeps markup, class names and ids unchanged, and leaves alone any property controlled by the site's own JS or inline styles. The assistant only sees a cleaned snapshot with styles and scripts removed and text masked. The author's article reports no test results — [DEV, vendor-authored](https://dev.to/eldad_zamler/restyling-a-legacy-website-without-touching-its-html-or-breaking-its-js-1gjg)
- Stylus manages userstyles (fork of Stylish) and installs from userstyles.org or `.user.css` URLs. My search found no AI tool that generates Stylus userstyles — [Stylus](https://github.com/openstyles/stylus)
- Arc Boosts offered CSS and JS editors per site. Arc's help article says sharing and the legacy builder are deprecated, and one review lists Arc as discontinued. My direct fetch of the help page returned 403, and none of what I saw describes an AI Boost generator — [Arc help, search summary](https://resources.arc.net/hc/en-us/articles/19212718608151-Boosts-Customize-Any-Website); [review, search summary](https://kvibber.com/reviews/software/arc/)
- Dark Reader is not AI, but it is the most mature restyler I read. It still needs per-site fixes such as INVERT, CSS, IGNORE INLINE STYLE and IGNORE IMAGE ANALYSIS — [Dark Reader CONTRIBUTING](https://raw.githubusercontent.com/darkreader/darkreader/main/CONTRIBUTING.md)

**Page capture that generates a new site (a different category)**
- Shuffle's extension works on logged-in, staging and localhost pages. It shows several AI concepts side by side and exports to frameworks such as Next.js, Laravel and WordPress. It does not explain the capture method or state limits — [Shuffle](https://shuffle.dev/blog/2026/04/ai-website-redesign-browser-extension/)
- Figr captures live HTML to generate prototypes, and Redesignr redesigns private pages from the active session, mainly by generating new HTML — [Figr, search summary](https://figr.design/blog/ai-website-redesign-tool); [Redesignr, search summary](https://redesignr.ai/extension)

**DevTools-based agent tooling**
- Chrome DevTools MCP now exposes `get_css_styles` (matched rules, inline styles, inherited styles, custom properties), `evaluate_script`, `take_screenshot`, `take_snapshot` (accessibility tree with uids), `emulate` (viewport and color scheme), `resize_page`, `lighthouse_audit` (accessibility, SEO, best practices, agentic browsing, but not performance) and performance traces — [tool reference](https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/docs/tool-reference.md)
- Conflict: a community project says the official server lacks CSS rules and computed style — [chrome-inspector-mcp, search summary](https://github.com/devtoolcss/chrome-inspector-mcp). The current tool reference above contradicts this for CSS rules. It does not explicitly mention computed styles.
- Chrome's own stated design use is layout debugging on a live page (such as overflow) and verifying a generated fix in the browser, not redesign — [Chrome blog](https://developer.chrome.com/blog/chrome-devtools-mcp)

**Visual editors for coding agents (depend on source access)**
- Cursor's visual editor offers drag and drop, React prop inspection, style controls and point-and-prompt, then the agent locates the components and updates the code — [Cursor](https://cursor.com/blog/browser-visual-editor)
- Onlook instruments code to map elements back to their source location and targets React/Next.js with Tailwind — [Onlook fork, search summary](https://github.com/Programmer-ZX/onlook)
- React Grab captures file name, React component and HTML for a selected element, and only loads in development mode — [React Grab, search summary](https://github.com/burrr-ai/react-grab)

**Screenshot loops and others**
- Playwright `toHaveScreenshot` compares against a stored baseline using pixelmatch, with `threshold` (default 0.2), `maxDiffPixels` and `stylePath` to hide volatile elements. Baselines must come from the same environment — [Playwright](https://playwright.dev/docs/test-snapshots)
- Claude Code's docs tell users to ask for evidence such as a browser screenshot next to the mockup, not just a claim of success — [Claude Code best practices](https://code.claude.com/docs/en/best-practices)
- Maxun is a web data extraction platform, not a redesign tool — [Maxun](https://github.com/getmaxun/maxun)

### Inferences
- The source-mapping step that makes Cursor, Onlook and React Grab work cannot exist on a third-party production page. Point-and-prompt selection is reusable. Write-back is not.
- Redesign-by-export tools avoid every constraint below by leaving the page. Their output says nothing about whether in-place restyling works.
- **Worth reusing in TamperSloth:**
  - Dark Reader's observer and node-position patterns (question 2).
  - WXT's three injection modes as a decision frame (question 3).
  - Dembrandt's extraction approach and CSS Overview's report categories (question 4).
  - axe-core as a bundled extension asset (question 5).
  - Stylebot's version history and profiles.
  - AI Style Upgrade's rule of leaving JS-controlled properties alone.
- Check licences before lifting any code. I did not verify them, apart from a search summary calling Dembrandt MIT.
- TamperSloth already matches the agent-loop shape: script, execute, screenshot, confirm scope, save, reload, verify (`skills.ts` lines 24-32). Its gap is design knowledge, not plumbing.

### Gaps
- I found no independent benchmark, success rate or failure study for any AI live-page restyler. Claims come from vendors. "How well does it work" is unanswered beyond their silence on failures.
- Agentation returned no search results, so I could not assess it.
- I saw Onlook and React Grab through repos that may be forks, not their main project pages.

## What makes restyling a third-party page technically hard?

### Takeaway
Most of the difficulty is that the page keeps running: its CSS outranks yours in specific, knowable ways, its framework can overwrite or crash on your DOM edits, its class names change between builds, and modal dialogs beat any z-index. CSS-only changes in a world exempt from page CSP avoid most of it, while fonts, images and DOM changes remain the risky parts.

### Own test method
Chromium 152 (Claude desktop browser pane), on example.com, with JS evaluated in the page's main world. I added CSP through a script-inserted meta tag: `style-src 'none'; font-src 'none'; img-src 'none'`. I recorded `securitypolicyviolation` events. This shows main-world behaviour in one engine. It does not test the USER_SCRIPT world or other browsers.

### Cited Findings

**Cascade, specificity and !important**
- Unlayered normal styles beat all layered normal styles regardless of specificity. For `!important` the order reverses: layered beats unlayered, and the first declared layer wins — [MDN @layer](https://developer.mozilla.org/en-US/docs/Web/CSS/@layer)
- Important inline styles beat every other author declaration, including layered `!important`. Only important user styles, important user-agent styles or transitions override them. Keyframe animations rank above normal declarations but below `!important`, and transitions rank above everything — [MDN cascade](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Cascade/Introduction)
- `chrome.scripting.insertCSS` accepts a runtime `css` string and an `origin` of `AUTHOR` (default) or `USER`. `removeCSS` only works if `css`, `files` and `origin` match exactly — [Chrome scripting](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- Dark Reader's CSS site fixes require `!important` on each property — [Dark Reader CONTRIBUTING](https://raw.githubusercontent.com/darkreader/darkreader/main/CONTRIBUTING.md)

**The page's own shadow DOM**
- Page CSS does not reach shadow nodes and `querySelectorAll` does not find them. Closed mode is not a strong barrier, since browser extensions can evade it — [MDN shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- Dark Reader walks shadow hosts with a TreeWalker, inserts override style nodes at the start of each shadow root, and handles `adoptedStyleSheets` on both documents and shadow roots — [Dark Reader dom.ts](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/utils/dom.ts); [dynamic-theme](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/index.ts)

**Framework re-renders and hydration**
- React says changing DOM nodes it manages "can lead to inconsistent visual results or crashes". Parts React has no reason to update are safe — [React docs](https://react.dev/learn/manipulating-the-dom-with-refs)
- Extensions modifying the DOM are a reported cause of hydration mismatches — [React issue, search summary](https://github.com/facebook/react/issues/22833); [Substack case, search summary](https://natalieoldroyd.substack.com/p/my-website-wasnt-brokenjust-hydrated). These are community reports, not official React statements.
- Userscript authors report sites re-rendering over their changes, and advise matching the whole site and watching DOM or URL changes rather than running once on load. `characterData: true` is needed to catch text-node updates — [Greasy Fork thread, search summary](https://greasyfork.org/ko/discussions/development/247083)
- Next.js concatenates production CSS into many minified, code-split files, and global stylesheets are not removed during route navigation — [Next.js CSS](https://nextjs.org/docs/app/getting-started/css)

**MutationObserver patterns (from Dark Reader's code, read through a fetch summary)**
- `watchForNodePosition` observes the injected node's parent, reinserts the node if the page moves or removes it, and calls `takeRecords()` to discard its own mutation. After 10 attempts in 10 seconds it pauses for 2 seconds, which stops it fighting the page forever — [dom.ts](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/utils/dom.ts)
- `createOptimizedTreeObserver` keeps one shared observer per root and classifies changes into additions, moves and deletions, filtering children of changed elements. Batches over 1000 mutations or added nodes go to a separate `onHugeMutations` path — [dom.ts](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/utils/dom.ts)
- Dark Reader also defers dynamic work while the page is hidden, and watches inline style changes on `documentElement` that contain `--` — [dynamic-theme](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/index.ts)
- A Greasy Fork library ties observer teardown to an AbortSignal — [Greasy Fork, search summary](https://greasyfork.org/bg/scripts/488160-make-mutation-observer/code)

**Hashed and unstable class names**
- CSS Modules generate unique class names — [Next.js CSS](https://nextjs.org/docs/app/getting-started/css)
- A Stylus user notes Angular `_ngcontent` attributes are generated and can change when the app updates, so selectors should avoid them — [Google AI forum, search summary](https://discuss.ai.google.dev/t/how-to-style-google-ai-studios-user-interface-with-stylus/111183)
- Playwright calls class-based selection fragile because a design change can alter the class, and prefers roles and user-facing attributes — [Playwright best practices](https://playwright.dev/docs/best-practices)

**CSP**
- The USER_SCRIPT world is the default and is "exempt from the page's CSP". `configureWorld` sets its own `csp` (defaulting to the ISOLATED world's policy), plus `messaging` and, from Chrome 133, `worldId` — [Chrome userScripts](https://developer.chrome.com/docs/extensions/reference/api/userScripts)
- Isolated-world scripts follow the extension's policy, which blocks `eval()` and external scripts. Main-world scripts are subject to the page's CSP. Fonts and images referenced by manifest-declared CSS must be web-accessible resources — [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- TamperSloth's skills state the same split: the USER_SCRIPT sandbox can change the DOM, cannot reach page globals or framework state, and is exempt from page CSP (`skills.ts` line 36). Raw `evaluateJavaScript` defaults to that world (`prompt.ts` line 17).
- `font-src` governs `@font-face` loads and falls back to `default-src` — [MDN font-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/font-src)
- Userscript managers offer `GM_addElement` specifically to get around strict CSP on inline code and style — [Violentmonkey](https://violentmonkey.github.io/api/gm/)
- **Own test, under the strict CSP in the main world:**
  - Blocked: `<style>` elements in the document and in a shadow root (`style-src-elem`), `setAttribute('style', ...)` (`style-src-attr`), a `FontFace` load (`font-src`), and an image (`img-src`).
  - Not blocked: `element.style.x`, `style.cssText`, and `adoptedStyleSheets` on both the document and a shadow root.
- Conflict: MDN's example lists setting `cssText` as blocked, while a note on the same page says no browser blocks `cssText` setters or `insertRule` — [MDN style-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/style-src). My test agrees with the note.
- Safari reportedly clears a `<style>` inside shadow DOM on strict-CSP pages, and `@font-face` reportedly must be injected into the host document — [WebKit bug, search summary](https://bugs.webkit.org/show_bug.cgi?id=291734)

**Stacking, z-index and the top layer**
- Many properties create stacking contexts, including `transform`, `filter`, `opacity` below 1, `position: fixed` or `sticky`, `container-type` and `contain: paint`. A nested `z-index` cannot escape its parent context — [MDN stacking context](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Positioned_layout/Stacking_context)
- The top layer holds fullscreen elements, modal dialogs, shown popovers and customizable select pickers — [MDN top layer](https://developer.mozilla.org/en-US/docs/Glossary/Top_layer)
- `showModal()` makes everything else in the document inert — [MDN showModal](https://developer.mozilla.org/en-US/docs/Web/API/HTMLDialogElement/showModal)
- Clicking outside light-dismisses open `auto` and `hint` popovers. `showModal()` and `requestFullscreen()` on other elements also dismiss `auto` popovers — [MDN popover](https://developer.mozilla.org/en-US/docs/Web/API/Popover_API/Using)
- **Own test:**
  - An overlay at `z-index: 2147483647` lost the hit test to a modal dialog at the same point.
  - Outside the dialog's box, hit testing also returned the dialog, not the overlay.
  - A button inside the overlay could not take focus while the modal was open.
  - A `popover="manual"` shown after the modal, outside the dialog, was also not hit-testable, so entering the top layer does not escape modal inertness.
  - A `position: fixed` child of a transformed ancestor sat at the ancestor's offset, not the viewport's.
  - A synthetic `.click()` on an outside element did not light-dismiss an `auto` popover. This one ran while the pane was hidden, at a 0x0 viewport.

**Dark mode and responsive states**
- Dembrandt's dark mode needs an explicit flag and is not auto-detected, and its default viewport is 1920x1080 — [Dembrandt](https://github.com/dembrandt/dembrandt)
- Dark Reader has a dedicated observer for WordPress dark-mode class changes, plus an observer for a `darkreader-lock` meta tag — [dynamic-theme](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/index.ts)

### Inferences
- **Theme toggles are site-specific:** Dark Reader's WordPress-specific observer suggests no single signal reveals a site's dark mode, so test the site's own toggle as well as `prefers-color-scheme`.
- **Winning the cascade:** an unlayered injected sheet with a sensible selector beats the page's layered normal rules, so try that first. `insertCSS` with `origin: "USER"` plus `!important` should beat every author rule, including important inline styles. Without `!important`, a user-origin rule loses to any normal author rule. This follows from MDN's ordering, but I did not test it. Whether TamperSloth has the `scripting` permission is outside the files I read.
- **Page layers:** an injected layer cannot reliably win an `!important` contest, because first-declared wins and the page's declarations usually come first.
- **Transitions:** they outrank `!important`, so a site's existing `transition: all` will animate injected overrides on first paint and on theme change. Expect visible flashes unless a script also handles them.
- **CSS before DOM:** CSS rules survive re-renders, because re-rendered nodes pick up the same rules if the selector still matches. DOM edits need observers and carry React's crash risk. A live redesign skill should exhaust CSS-only changes before touching structure.
- **Selector strategy without CSS roles:** prefer semantic tags, `[role]`, `[aria-label]`, `[data-testid]` and `:has()`, then partial class matches such as `[class*="Button_primary"]` on CSS Modules prefixes. Another option: a script finds elements by role or text and stamps a `data-*` attribute that CSS targets, re-stamping through an observer. Avoid stamping before hydration. None of this was tested across sites.
- **Observer loop guard:** Dark Reader's combination of `takeRecords()`, a retry cap and a cooldown is a better template than the common advice to disconnect and reconnect around writes, because it also bounds fights with the page.
- **Modals:** a persistent injected control must either be re-parented into the open `<dialog>` or accept being unusable while a site modal is open. Injected UI should avoid `showModal()` itself, since that makes the host page inert and closes the site's `auto` popovers.
- **Real input differs from scripted input:** agents that test with synthetic clicks can miss light-dismiss breakage that a real user hits. Trusted input should be used for verification.
- **Flash of the old design:** `skills.ts` line 30 recommends `document_idle` for UI additions. A restyle saved that way would show the old design first. Splitting it into CSS at `document_start` and DOM work at idle should fix this. AI Style Upgrade's non-deferred placement targets the same problem.
- **Tool routing gap:** `initialToolGroups` (`toolRuntime.ts` line 63) enables the visual group for "screenshot", "layout", "appearance", "restyle" and "dark mode", but not "redesign", "design", "theme" or "style". A request to redesign a page does not auto-enable visual tools from that line.

### Gaps
- I did not test whether USER_SCRIPT's CSP exemption also covers fonts and images referenced from injected CSS. Chrome's docs do not break this down, and it decides whether webfonts and images are usable at all.
- I did not test whether a page's `adoptedStyleSheets` are visible or writable from USER_SCRIPT. Dark Reader needs `unwrap()` in Firefox, which suggests per-world differences.
- React's reconciliation of foreign nodes is documented only as a warning. Detailed behaviour of Vue, Angular and Svelte was not researched.
- Authoritative sources on hydration wiping extension changes are thin. Official React docs cover manual DOM edits, not extensions specifically.
- The MDN `prefers-color-scheme` and `color-scheme` pages were not read.

## What is established practice for injected overlays and components?

### Takeaway
Shadow DOM is the default for tool-like UI and an iframe is the choice for full isolation, but Shadow DOM isolates less than people assume: rem units, inherited properties, host-element rules and layout clipping all still leak. For UI meant to look native, deliberately letting inheritance and custom properties through is a feature.

### Cited Findings
- WXT defines three modes: Integrated (page CSS applies, no isolation), Shadow Root (isolated styles, event isolation opt-in through `isolateEvents`, still in page context) and IFrame (styles and events isolated, not in page context, requires a web-accessible HTML page) — [WXT](https://wxt.dev/guide/key-concepts/content-script-ui.html)
- `all: initial` "doesn't reset the `<html>` element's font size", so rem-based UI such as Tailwind can change scale across sites — [WXT](https://wxt.dev/guide/key-concepts/content-script-ui.html)
- Inheritable properties such as color, font and line-height cross the shadow boundary unless `all: initial` is set first in `:host`. A component can read page-set custom properties with `var(--x, fallback)`. "Outside styles always win over styles defined in shadow DOM" applies to the host element — [web.dev](https://web.dev/articles/shadowdom-v1)
- Standard UI events such as click, focus, input and keyboard events cross the boundary and are retargeted. `document.activeElement` reports the host, and `shadowRoot.activeElement` gives the real focus in open mode. `delegatesFocus` changes click-to-focus behaviour — [web.dev](https://web.dev/articles/shadowdom-v1)
- `lang` and `dir` inherit from the host — [MDN shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- **Own test:** with root font size at 10px, `1rem` inside a shadow root measured 10px. A custom property set on `<html>` resolved inside the shadow tree, and inherited `color` crossed it.
- `all: initial` also resets `display` to inline, which can collapse layout. Shadow DOM does not isolate the containing block, so an ancestor's `overflow: hidden` can clip a popover. A theme rule matching the light-DOM host hid a widget, fixed with an inline `!important` on the host. A `<link>` inside a shadow root caused a visible unstyled flash on every load — [Things Shadow DOM does not isolate, search summary](https://dev.to/michael-yousrie/things-shadow-dom-does-not-isolate-3jj3); [Embeddable widget postmortem, search summary](https://dev.to/omar_bni_f6856a8bb0e021e9/everything-that-broke-while-shipping-an-embeddable-ai-widget-5h4g); [SmartSize styling resilience, search summary](https://help-center.smartsize.io/developers/styling-resilience/)
- Constructable stylesheets are parsed once and shared across trees — [MDN shadow DOM](https://developer.mozilla.org/en-US/docs/Web/API/Web_components/Using_shadow_DOM)
- Clean removal is treated as a feature: Dark Reader's teardown stops watchers, removes named nodes and runs registered cleaners — [dynamic-theme](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/index.ts)
- TamperSloth forbids custom SVG, canvas or CSS overlays for walkthrough guidance, because a shared renderer handles them (`prompt.ts` line 32). That rule covers guidance only, not user-requested UI.

### Inferences
Suggested decision rule for TamperSloth:

| Goal | Mount | Notes |
|---|---|---|
| Restyle existing elements | No component, just a stylesheet | Attach to document plus each relevant shadow root |
| Native-looking addition (filter chip, row badge) | Shadow root without `all: initial` on type and color | Inherits page font and color, reads `var(--site-token, fallback)`, sized in px or em |
| Tool UI that must look the same everywhere (panel, toolbar) | Shadow root with `all: initial`, restored `display` | Inline `!important` on host for `display` and position, px or em only |
| Untrusted or heavy UI | Iframe | Loses page context, and needs a web-accessible page. Page `frame-src` was not checked |

- Mount points should sit outside framework-managed subtrees, such as `<body>` or `<html>` children positioned over the target, and track the anchor. React's safe zone is nodes it has no reason to update. Injecting inside a list item is the riskiest choice.
- Prefer `adoptedStyleSheets` for injected component styles: my test shows it survives strict CSP in the main world, so the same code works in either world. `<style>` depends on the USER_SCRIPT exemption.
- Stop key events at the shadow host in input-heavy UI, otherwise site shortcuts can fire while a user types into an injected field. This is why `isolateEvents` exists, though WXT's docs do not state that reason directly.
- Tag every injected node and every stamped attribute with a run or script id so rollback is mechanical. A saved script should carry its own removal path.

### Gaps
- No primary source compared Shadow DOM and iframe costs (memory, focus handling, CSP `frame-src`) for extension UI.
- Several Shadow DOM pitfalls come from individual developer postmortems seen only in search summaries. They match my own test where I ran one, but the rest are unverified.

## How can an agent read an existing page's design system at runtime?

### Takeaway
Computed styles are the reliable base because they work whatever the CSS source, and they are what existing extractors use. Custom properties are enumerable in current Chromium, but stylesheet rules can be blocked for cross-origin CSS, so media queries and hover rules are the hard part. No build or external tool is needed for a useful extraction script.

### Cited Findings
- Dembrandt renders with Playwright and reads computed styles from the DOM, then derives color roles with evidence, grouped typography and spacing patterns. It exports to W3C DTCG format through `--dtcg`, and `--crawl` merges pages — [Dembrandt](https://github.com/dembrandt/dembrandt)
- Dembrandt's stated limits: hydration wait of 8s plus 4s stabilization, some dynamic content may be missed, hover and focus states come from a sample of real interactions, dark mode is not auto-detected, and canvas or WebGL pages cannot be analyzed — [Dembrandt](https://github.com/dembrandt/dembrandt)
- TokenScout clusters colors perceptually using CIELAB ΔE76, reduces type and spacing scales and exports DTCG tokens. Rendered-page crawling is described as a next step, so this is an early project — [TokenScout, search summary](https://www.hunted.space/product/tokenscout)
- Chrome's CSS Overview panel reports colors grouped by type, low-contrast text, fonts grouped by size, weight and line height, unused declarations, and media queries by occurrence — [Chrome DevTools](https://developer.chrome.com/docs/devtools/css-overview)
- DevTools MCP's `get_css_styles` returns matched rules, inline styles, inherited styles and custom properties for an element uid — [tool reference](https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/docs/tool-reference.md)
- `cssRules` throws a SecurityError when a sheet's origin-clean flag is unset, and the flag is only set for CORS-same-origin responses — [CSSOM](https://www.w3.org/TR/cssom-1/)
- `computedStyleMap()` returns typed computed values rather than resolved values, so a percentage stays a percentage, and it is not Baseline — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/computedStyleMap)
- **Own test (Chromium 152):** both `[...getComputedStyle(el)]` and `computedStyleMap().keys()` listed custom properties, including ones inherited onto a descendant. `getPropertyValue('--x')` returned the value.
- Dark Reader feeds rules from adopted sheets into a variables store, and re-matches variables when inline styles on `documentElement` change and contain `--` — [dynamic-theme](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/index.ts)

### Inferences
Practical recipe for a self-contained script in the USER_SCRIPT world, with no dependencies:
1. Sample visible elements by category: `body`, `h1`-`h3`, `a`, `button`, `input`, `nav`, `header`, plus card-like repeated structures.
2. Record color, background, font family, size, weight, line height, radius, shadow, padding and gap. Weight frequency by visible area, since rare colors usually aren't brand tokens.
3. Enumerate custom properties on `:root` and `body`, keep those that resolve to colors, lengths or font stacks, and look for framework prefixes such as `--tw-`, `--bs-`, `--mdc-` and `--chakra-`. The prefix list is my own knowledge, unverified here.
4. Merge near-duplicate colors in a perceptual space, as TokenScout does.
5. Read `cssRules` in try/catch. Where blocked, either fetch the sheet from the extension's background context or treat breakpoints as unknown and test at several widths. The background fetch is untested.
6. Repeat at a narrow viewport and in the site's dark mode, and drive one real hover and focus for interactive states.
7. Return a compact token summary so the agent writes `var(--site-x, fallback)` instead of hardcoded values when the site has variables.

- The CDP `CSS` domain should avoid the cross-origin limit, as DevTools does. TamperSloth already has CDP features (`prompt.ts` line 16), but I did not confirm that a style-reading tool exists, and I could not read the CDP docs (the fetch returned only a redirect notice).
- `skills.ts` line 25 says "inspect styles only if adding UI". A redesign workflow should make style inspection mandatory.

### Gaps
- No source measures extraction accuracy for any of these tools.
- Custom property enumeration was only tested in Chromium 152. Firefox and Safari were not checked, and I have no spec citation that it is required behaviour.
- Pages with no custom properties and utility classes only were not tried.

## What must be preserved on a live redesign, and how do you verify it?

### Takeaway
Preserve working controls, content, focus and contrast, and verify with a before-and-after comparison rather than an absolute pass. Automated tools catch only part of the problem, and the host page may already fail its own checks. Pixel diffs need rethinking when every pixel is meant to change.

### Cited Findings
- axe-core can "find on average 57% of WCAG issues automatically". It covers WCAG 2.0 to 2.2 at A, AA and AAA, must be included in each page or iframe under test, and reports uncertain cases as `incomplete` for manual review — [axe-core](https://github.com/dequelabs/axe-core)
- WCAG 2.2 thresholds that a restyle can break — [WCAG quick reference](https://www.w3.org/WAI/WCAG22/quickref/?versions=2.2&levels=aa):
  - Contrast 1.4.3: 4.5:1 for text, 3:1 for large text.
  - Non-text contrast 1.4.11: 3:1.
  - Resize 1.4.4: text to 200% without loss.
  - Reflow 1.4.10: 320 CSS px wide without two-dimensional scrolling.
  - Text spacing 1.4.12: line height 1.5x, paragraph spacing 2x, letter spacing 0.12x, word spacing 0.16x.
  - Focus order 2.4.3 and focus visible 2.4.7.
  - Focus not obscured 2.4.11: not entirely hidden by author-created content.
  - Target size 2.5.8: 24 by 24 CSS px, with exceptions.
  - Name, role, value 4.1.2.
- A pre-launch checklist from one restyler covers menus, forms, checkout, third-party widgets, real breakpoints, accessibility and images. It warns that overriding `display` can break script-driven behaviour and that markup changes break scripts that find elements by class, id or structure. These are stated risks, not measured results — [DEV, vendor-authored](https://dev.to/eldad_zamler/restyling-a-legacy-website-without-touching-its-html-or-breaking-its-js-1gjg)
- Playwright visual comparison is environment-sensitive (OS, browser version, settings, hardware, headless mode), and `stylePath` can hide volatile regions — [Playwright](https://playwright.dev/docs/test-snapshots)
- `captureVisibleTab` is limited to 2 calls per second, is described as expensive, and captures only the visible area — [Chrome tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)
- DevTools MCP offers `lighthouse_audit` for accessibility without performance, `performance_start_trace` for performance, and `emulate` for viewport and color scheme — [tool reference](https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/docs/tool-reference.md)
- Dark Reader routes huge mutation batches to a separate path and defers work on hidden pages — [dom.ts](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/utils/dom.ts); [dynamic-theme](https://raw.githubusercontent.com/darkreader/darkreader/main/src/inject/dynamic-theme/index.ts)
- TamperSloth's workflow already requires verifying with DOM checks or screenshots, confirming URL scope, reloading after save, and not claiming success from a save acknowledgement (`skills.ts` lines 27-31).
- **Own test:** in the hidden browser pane the viewport measured 0x0 and `elementFromPoint` returned null until I set an emulated size. That is pane-specific, not Chrome behaviour in general, but hit tests in a non-visible tab can be meaningless.

### Inferences
Proposed verification loop for a redesign, all before-and-after:

| Check | Method | Pass condition |
|---|---|---|
| Content intact | Compare visible text before and after | No text lost or hidden unless requested |
| Controls work | Control list before and after (`listControls`), then exercise key ones with trusted input | Same names and roles, same outcomes |
| Accessibility | axe-core baseline, then re-run | No new violations. Don't blame the redesign for existing ones |
| Contrast | Computed foreground and background on sampled text, including over images (often `incomplete` in axe) | 4.5:1 and 3:1 |
| Focus | Tab through before and after, screenshot focus states | Same order, indicator visible, not hidden by injected sticky elements |
| Target size | Bounding boxes of controls after shrink or restyle | At least 24 by 24 CSS px |
| Layout | Screenshots at about 1440, 768, 390 and 320 wide, plus 200% zoom | No clipped content or horizontal scroll |
| States | Hover, open menus, modals, popovers, error and loading states | Styled, reachable and above page content |
| Theme | Site dark mode and light mode | Tokens still resolve, no unreadable text |
| Persistence | Reload, SPA route change, re-render trigger, list load-more | Changes reapply with no flash and no observer storm |
| Reversal | Toggle off | Page returns to baseline exactly |

- Pixel diffing inverts in a redesign. Use it on regions that must not change (a checkout form when only the header is in scope), not on the whole page. Screenshots still suit agent judgement. They just can't produce a pass or fail.
- The rate limit favours few, purposeful shots. Multi-viewport capture requires CDP emulation rather than resizing a user's real window, so the user's view isn't disturbed. A separate task tab would help, in line with `prompt.ts` line 18.
- Observer cost matters, judging by Dark Reader's special handling of huge batches and hidden pages, so a storm check belongs in the persistence test.
- Focus changes are a likely blind spot. axe checks static states, and a redesign that sets `outline: none` or reorders with CSS `order` causes focus problems automation may not flag.
- Limit the host's risk: don't override `display` on elements scripts toggle, and never restyle hidden states by assuming they stay hidden.

### Gaps
- I found no published checklist specific to AI live-page redesign. The only one comes from a vendor, and the loop above is my own synthesis.
- I found no measured performance overhead for injected restyles or observers.
- axe-core's behaviour in a USER_SCRIPT world, and whether the extension can bundle it, was not tested. Its licence was not checked.
- CDP emulation details could not be confirmed from the protocol docs because the fetch returned a redirect notice. DevTools MCP's `emulate` is the indirect evidence that this works.

## Which common design skill advice assumes a code project and needs adapting?

### Takeaway
Advice about stacks, packages, fonts and generated assets stops applying, and advice about inventing a visual identity needs reversing because the site already has one. Principles on hierarchy, restraint, motion, accessibility and self-critique still apply, but they have to be expressed as overrides on a DOM the agent doesn't control.

### Cited Findings
- Tailwind in a project means a package install, a PostCSS plugin and a global CSS import, and Next.js then concatenates and code-splits CSS at build — [Next.js CSS](https://nextjs.org/docs/app/getting-started/css)
- Anthropic's frontend-design skill is less stack-bound than expected: it says it covers new or existing UI and names no framework or build tool. It does assume you pick a palette (4 to 6 base colors) and one or two typefaces from the subject, open with a hero, write copy, add one orchestrated motion moment and one bold element, then self-critique by screenshot — [frontend-design skill](https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md)
- A TamperSloth script must be one self-contained named function with no imports, and has an isolated instance per page load (`skills.ts` line 36).
- Isolated-world content scripts cannot load external scripts by default — [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- Page CSP can block fonts and images. Own test confirmed both in the main world — [MDN font-src](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/font-src)
- A style layer does not add features or restructure content — [DEV, vendor-authored](https://dev.to/eldad_zamler/restyling-a-legacy-website-without-touching-its-html-or-breaking-its-js-1gjg)

### Inferences

| Code-project advice | Status on a live page | Replacement for TamperSloth |
|---|---|---|
| Choose a framework or component library | Gone | No stack choice. Output is CSS plus minimal vanilla DOM |
| Use Tailwind or utility classes | Gone | Utilities aren't available unless the site ships them, and sites purge unused ones. Write scoped CSS. If the site uses Tailwind or Bootstrap, read its variables |
| `npm install` a library (Motion, shadcn, icons) | Gone | Write it by hand. Inline SVG for icons, CSS or Web Animations API for motion |
| Edit or refactor components | Gone | Override styles. Add elements only outside framework-managed subtrees. Never restructure unless the user asks |
| `next/font`, self-hosted or Google Fonts | Mostly gone | First prefer fonts the site already loads, then system stacks. Attempt a webfont only after checking that it loaded, and keep a fallback |
| Generated hero images | Mostly gone | No asset pipeline. Prefer CSS gradients and inline SVG, which need no fetch. Reuse the site's own images. Test any external image against `img-src` |
| Pick a palette and typefaces from the subject | Reversed | Extract the site's tokens first. Change them only when the user wants a new look, then remap roles rather than invent values per element |
| Open with a strong hero, reorder sections | Limited | Use CSS `order`, grid and `display` only where this keeps focus order (WCAG 2.4.3). A landing-page recipe doesn't fit an inbox or dashboard |
| Write specific copy | Limited | Preserve site text. It is dynamic and may be localized, and changing it needs user intent. Injected labels are the agent's only copy |
| Semantic HTML from the start | Changed | Can't rewrite markup. Attribute patches risk being overwritten on re-render. Measure the delta against the baseline |
| Mobile first, define your breakpoints | Changed | Breakpoints already exist. Read or discover them and attach overrides to the same widths |
| Specificity hygiene, avoid `!important` | Reversed | `!important` is normal and expected here (Dark Reader requires it). Use it deliberately, and note that it reverses layer order |
| Dev server and hot reload | Replaced | Execute, screenshot, adjust loop in the tab. Each run must be idempotent and clean up the last attempt |
| Git commit, tests in CI, versioning | Replaced | Saved script with URL scope, in-script self-check, a version history like Stylebot's, and a way to switch it off |
| Done when shipped | Changed | The site ships changes under you. A saved redesign needs to fail safe when selectors stop matching, leaving the original page usable |
| Fixed test content | Changed | Real content is unknown length and possibly logged-in or user-private. Test on long lists, empty states and other routes |

**Still applies with little change:** hierarchy, restraint, one bold move, visible focus, reduced motion, contrast, consistency, avoiding generic AI patterns, self-critique from a rendered screenshot.

**New advice a code-project skill never mentions:**
- Stay in scope (user's request, this URL pattern).
- Don't break what the site owner's scripts rely on.
- Keep the change reversible, and tag what you inject.
- Treat page text as untrusted (`prompt.ts` line 40).
- Check which of a site's states exist before styling them.
- Tell the user the change is local to their browser and not a change to the site.

### Gaps
- I read one design skill for this comparison, on purpose, since general design skills are covered by other researchers. The table's left column reflects common advice from my own knowledge and that skill, not a survey.
- Whether base64-embedded fonts or images get past `font-src` and `img-src` from USER_SCRIPT is untested. MDN lists source expressions per directive, so `data:` is only allowed if the policy names it.
- Legal and terms-of-service aspects of restyling third-party sites were out of scope and not researched.
