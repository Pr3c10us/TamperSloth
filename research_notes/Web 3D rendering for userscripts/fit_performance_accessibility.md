# When 3D fits a web experience, and its performance, accessibility and fallback requirements (as of November 2026)

Evidence grades used on every finding:
- **[Measured]**: controlled experiment or field data with a stated method.
- **[Structured]**: standards, specifications, official documentation, platform telemetry, or structured usability research without published effect sizes.
- **[Vendor]**: claim by a party that sells 3D, AR or ads, usually without a method.
- **[Rule of thumb]**: convention, forum post or blog.

**[Changes]** marks a finding likely to go out of date. Items called inference are mine, not the sources'.

Source reading limits: several findings rest on abstracts, search-index excerpts or a summarising fetch tool, and this is noted where it matters. Full texts were not read for the Journal of Marketing, Li et al., Zacks et al. or Wiederich papers.

## When does 3D help, and where does it hurt?

### Takeaway
The evidence supports 3D when the content is a real physical or spatial object whose form the user needs to understand, especially when purchase uncertainty is high. It does not support 3D for abstract data, navigation, forms or task-focused tools. The large conversion figures are vendor claims with no published method. The best peer-reviewed field evidence found describes the overall sales effect of AR as small and concentrated in specific conditions.

### Cited Findings

**Product viewers and conversion: peer-reviewed**
- **[Measured]** Tan, Chandukala and Reddy (Journal of Marketing, 2022) used data from an international cosmetics retailer. AR use on its mobile app went with higher sales for less popular brands, narrower-appeal products and more expensive products. — [Kellogg summary](https://www.kellogg.northwestern.edu/academics-research/research/detail/2022/augmented-reality-in-retail-and-its-impact-on-sales/)
- **[Measured]** The same study's overall effect is described as small. It is stronger for customers new to the online channel or category, and strongest when product uncertainty is high. This is AR on one retailer's app, not an in-page 3D viewer. — [AMA summary](https://www.ama.org/2021/04/20/augmented-reality-in-retail-and-its-impact-on-sales-2/)
- **[Measured, abstract only]** Li, Daugherty and Biocca's line of work reports that 3D product visualisation can influence brand attitude and purchase intention for geometric and mechanical products. — [The Role of Virtual Experience in Consumer Learning](https://researchwith.njit.edu/en/publications/the-role-of-virtual-experience-in-consumer-learning/); [Impact of 3-D Advertising, 2002](https://researchwith.njit.edu/en/publications/impact-of-3-d-advertising-on-product-knowledge-brand-attitude-and/)
- **[Measured, weak venue or unconfirmed peer review]** Smaller experiments report higher purchase intention with 3D than with 2D or standard presentation. — [Iowa State digital press article](https://iastatedigitalpress.com/itaa/article/8386/galley/8320/view); [JIDB article](https://accesson.kr/jidb/v.8/5/15/36909)
- **[Measured, contrary]** Chistyakov et al. (2018, n=39) found a 2D e-commerce interface significantly better than a stereoscopic 3D one on efficiency, satisfaction and overall usability. This tested stereoscopic UI, not a product model viewer, so it transfers only partly. — [Profesional de la información](https://revista.profesionaldelainformacion.com/index.php/EPI/article/view/63964)

**Product viewers and conversion: behavioural and vendor**
- **[Structured]** Baymard's large-scale UX testing found 83% of users did not try a 360-view feature where it was available, and 59% consistently skipped product videos. It calls these visuals "a supplement, and not a replacement" for images. A subset valued the sense of the product they gave. Sample size and dates are not stated, and 360 views are adjacent to WebGL viewers, not the same thing. — [Baymard](https://baymard.com/ecommerce-design-examples/video-and-360-views)
- **[Vendor]** Shopify's May 2022 changelog claims a "94% conversion lift, on average" for merchants who add 3D content. No method is given on that page. — [Shopify changelog](https://changelog.shopify.com/posts/shop-adds-3d-and-augmented-reality-ar-previews)
- **[Vendor]** Secondary pages restate the 94% with differing wording and metrics. One independent roundup warns that AR statistics in pitch decks often drift far from their sources. — [Neural4D](https://blog.neural4d.com/image-to-3d/shopify-3d-model-5-step-guide-to-boost-ar-sales-2026/); [Martech Zone](https://martech.zone/shopify-ar-augmented-reality-for-ecommerce/); [UFO3D roundup](https://ufo3d.com/?p=11198)
- **[Vendor]** Vertebrae's case study reports a 52% conversion increase and a 42% revenue-per-visit lift for one hat seller. Shopify Plus's Rebecca Minkoff case reports up to 65% higher purchase rates in its listing title. Both are single self-selected customer stories. — [Vertebrae via casestudies.com](https://www.casestudies.com/company/vertebrae/case-study/increases-consumer-confidence-with-3d-ar); [Shopify Plus via casestudies.com](https://www.casestudies.com/company/shopify-plus/case-study/in-going-3d-rebecca-minkoffs-customers-became-nearly-30-more-likely-to-buy)
- **[Vendor]** Google reports Swirl 3D ad engagement of 8x for Nissan against automotive rich-media benchmarks. The metric is engagement, not sales. Other reported figures are 6x (Purina, versus 2D ads) and 4x (Adidas, versus rich media). — [Google blog](https://blog.google/products/marketingplatform/360/create-3d-immersive-ad-experiences-display-video-360/); [PostFunnel](https://postfunnel.com/googles-3d-swirl-goes-global/amp)

**Spatial and data visualisation**
- **[Structured]** Munzner's rule "no unjustified 3D": 3D is legitimate for true 3D spatial data and needs very careful justification for abstract data. Planar position is a stronger channel than depth, occlusion hides data, and perspective distorts it. She presents these as guidelines, not absolute rules. — [Munzner VAD rules](https://cs.ubc.ca/~tmm/talks/vad/VAD-rules.pdf)
- **[Measured]** Hughes (2001, n=57) found accuracy about 10% higher for 2D than 3D bar charts, and a larger just-noticeable difference for 3D. — [University of Galway record](https://research.universityofgalway.ie/en/publications/just-noticeable-differences-in-2d-and-3d-bar-charts-a-psychophysi-3/)
- **[Measured, via a critic's summary]** Zacks et al. (1998): more errors with 3D bars in a direct matching task. In a memory-based variant, the 2D versus 3D difference disappeared. — [Stephen Few, 2016](https://www.perceptualedge.com/blog/?p=2362)
- **Conflict:** Kosara argues 3D bar charts are "not that harmful" and that blanket claims outrun the research. Few disputes his reading of Zacks. — [Kosara](https://eagereyes.org/blog/2016/3d-bar-charts-considered-not-that-harmful); [Few](https://www.perceptualedge.com/blog/?p=2362)
- **[Measured, excerpt only]** Svalina et al. (2024) reported 3D and 2D bar charts equally understandable at a specific gap depth. — [DOAJ record](https://doaj.org/article/79285484691c45638546203624ca9392)
- **[Measured, excerpt only]** Wiederich and VanderPlas (2024) note that advice against 3D rests largely on fixed 2D projections, so interactive or physical 3D is less well tested. — [Search-indexed record](https://vufind-test.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-a1851-363259580aa64daa8add7e58cbaad2efa8fc0999ddaaffe254b512da355d4b313/Details)
- **[Measured, excerpt only]** Levy et al. (CHI 1996) argue that earlier findings of little accuracy cost from added dimensions have alternative interpretations, and they study how 3D depth cues affect viewers' impressions and preferences. — [CHI 96 paper](https://www.chi1996.chistatic.hosting.acm.org/proceedings/papers/Levy/lev_txt.html)

**Interface usability**
- **[Structured, dated 1998]** Nielsen: abstract information spaces and website navigation suit 3D poorly. Acceptable cases are physical objects that must be understood in solid form (surgery, mechanical design, molecules, booth layout) and entertainment or some education. He also warns that 2D schematics or video can beat 3D for some physical tasks such as repair help. Its hardware and download objections are old, but the navigation and input arguments remain relevant. Quote: "Most abstract information spaces work poorly in 3D because they are non-physical." — [NN/g](https://www.nngroup.com/articles/2d-is-better-than-3d/)
- **[Measured]** Cockburn and McKenzie: 2D and 3D document interfaces showed no significant spatial-memory difference, though participants subjectively preferred 3D in the 2001 study. In 2002, users found higher-dimension interfaces more cluttered and less efficient. — [CHI 2001](https://www.cs.kent.edu/~jmaletic/cs63903/papers/Cockburn01.pdf); [CHI 2002](https://courses.washington.edu/hcde511/a14/readings/cockburn-chi02.pdf); [2004 journal paper](https://www.bohrium.com/paper-details/evaluating-spatial-memory-in-two-and-three-dimensions/812365478621085697-2519)
- **[Structured]** NN/g's 2023 usability study of scrolljacking found it disoriented most participants, particularly frustrating task-focused users. Problems grew with length, direction changes, reading text during the effect, and mobile. It is defensible only when it adds real information, is short, keeps vertical direction, avoids critical text, and sits below the fold. Quote: "scrolljacking leads to more user pain than benefits." — [NN/g](https://www.nngroup.com/articles/scrolljacking-101/)
- **[Structured]** A 2025 Acta Graphica paper tested 3D on a marketing agency site using the UEQ questionnaire, but the abstract reports no sample size or results. It cannot support a hero-visual claim as read. — [Hrčak](https://hrcak.srce.hr/en/342487)

**Core Web Vitals**
- **[Structured]** LCP-eligible elements are images, SVG images, video, CSS background images and block text. Canvas is not in the list, though the page does not discuss canvas explicitly. Good is 2.5 s or less at p75. — [web.dev LCP](https://web.dev/articles/lcp)
- **[Structured]** INP good is 200 ms or less, poor above 500 ms, at p75. Long main-thread tasks raise input delay. Scrolling, hovering and zooming are not counted as interactions. — [web.dev INP](https://web.dev/articles/inp)
- **[Rule of thumb]** A developer blog warns that a Three.js bundle parsed before hero text paints can delay LCP, and advises dynamically importing the scene. This is argued, not benchmarked. — [Hon Tran](https://www.hontran.dev/blog/core-web-vitals-for-animation-heavy-sites)

### Inferences
- Vendor conversion figures are probably inflated by selection: merchants who invest in 3D differ from others, and users who open a viewer are already engaged. No source found controls for this.
- A defensible reading: expect modest average lifts, higher for unfamiliar, expensive or geometry-dependent products, and low viewer engagement overall, so 3D should sit beside images rather than replace them.
- Hero visuals have **no direct evidence of benefit** in what I found. Treat them as brand or mood choices that must pay their performance cost, not as conversion features.

**Signals for a three-way decision (all inference, built from the sources above):**

| Decision | Request signals | Page signals |
|---|---|---|
| **Use 3D** | Names a physical object, model, product viewer, globe, map, molecule, floor plan, game or toy; uses "rotate", "spin", "explore", "look around" | Product page where shape or fit matters; a .glb, .gltf or .usdz link or a real coordinate dataset is available; an existing viewer to enhance |
| **Do not use 3D** | "Make this chart 3D"; "make it pop" on a data page; asks for readability, speed, density or productivity | Dashboards, tables, forms, checkout, admin tools, text-heavy articles, docs; data with no spatial dimension; `prefers-reduced-motion: reduce` for any decorative effect; `saveData` on; software renderer; no WebGL |
| **Ask the user** | "Make it cooler" or "add some wow" with no object; 3D chart request where 3D might be justified by true spatial data | Marketing or landing page with no model asset; decorative background behind readable text; low-end signals on a feature the user explicitly wants; CSP likely to block loading a library |

Explicit user requests can override blocks on preference grounds, such as "make this chart 3D" on the user's own page. Then the tool should say what is lost (readability) and keep a 2D data table reachable. Inference.

### Gaps
- Tufte's own text on chartjunk and 3D was not retrieved. Munzner and Few stand in for that position, and this report should not attribute specific Tufte wording.
- Siegrist (1996) was found only as a [citation](https://dblp1.uni-trier.de/rec/journals/behaviourIT/Siegrist96.html). Direct pie-chart evidence is thin.
- Numeric effect sizes for Tan et al. were not available in the summaries read. Check [the DOI](https://doi.org/10.1177/0022242921995449) before quoting any percentage.
- I found no controlled study of WebGL hero visuals on conversion or engagement, and no measured before-and-after LCP or INP for a WebGL hero.
- No study directly tested 3D in dashboards, forms or admin tools. The "hurts" verdict is extrapolated from data-perception, navigation and scrolljacking research.
- I found no recent NN/g article specifically on WebGL viewers.

## What does 3D cost: support, device limits, battery, load and memory?

### Takeaway
WebGL2 reach is very high in opt-in survey data, but the real figure is disputed because that sample skews high-end, and Chrome has been removing software fallback on desktop. WebGPU cannot yet be the only path. Battery and thermal costs are real but poorly measured, and I found no published phone data.

### Cited Findings
- **[Structured, Changes]** Web3DSurvey, read 4 November 2026 with no sample date shown: WebGL 98.24%, WebGL2 98.05%, WebGPU 83.39%. — [Web3DSurvey](https://web3dsurvey.com/)

| API | Windows | Mac | Linux | Android | iOS | ChromeOS |
|---|---|---|---|---|---|---|
| WebGL | 99% | 98% | 89% | 99% | 99% | 100% |
| WebGL2 | 99% | 98% | 89% | 99% | 99% | 100% |
| WebGPU | 88% | 91% | 19% | 74% | 86% | 93% |

- **Conflict:** in the Chromium thread, Rick Byers estimated software WebGL at about 0.5% of page loads (2.7% of contexts, with WebGL on about 20% of loads). Ashley Gullen argued the true figure may be 4 to 5% worldwide, and 10% or more in some markets, because Web3DSurvey skews to high-end developer devices. The thread leaves this unresolved. — [blink-dev intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)
- **[Structured, Changes]** Chrome is removing automatic SwiftShader fallback for WebGL on desktop, because of security risk and poor experience. It does not apply to mobile. When it applies, context creation fails instead of falling back. — [blink-dev intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)
- **Conflict on version:** the February 2025 intent estimated Chrome 137. Chromium's docs say failure starts in M139. I did not confirm current behaviour in the latest stable Chrome. — [Chromium SwiftShader docs](https://chromium.googlesource.com/chromium/src/+/205191a32c9db91062c5342e901b2da2d67a49e5/docs/gpu/swiftshader.md)
- **[Structured, Changes]** A temporary Windows enterprise policy, EnableUnsafeSwiftShader, exists from version 139, so some managed machines may still run software WebGL. — [Samsung Browser policy doc](https://developer.samsung.com/browser/policy/enable-unsafe-swift-shader.html)
- **[Structured, Changes]** WebGPU baselines: Chrome and Edge 113; Chrome Android 121 (Android 12 or later, Qualcomm or ARM GPUs); Firefox 141 on Windows; Firefox 145 on Apple Silicon with macOS Tahoe; Safari 26. Firefox for Android is reported as not shipping as of mid-2026, from a weaker source. Lower-quality sites give conflicting versions. — [web.dev](https://web.dev/blog/webgpu-supported-major-browsers); [Abratabia](https://abratabia.com/mobile-browser-performance/webgpu-on-mobile.php)
- **[Rule of thumb]** Power: one blog measured an M1 MacBook with powermetrics at roughly 200 to 2000 mW for WebGL, depending on shader complexity and canvas size. It is one desktop device. — [Torchbox](https://torchbox.com/blog/how-much-power-do-web-assets-use)
- **[Rule of thumb]** A three.js forum user reported Safari warning about significant energy use with about 200 meshes at 50 to 60 fps after a few minutes. Anecdotal. — [three.js forum](https://discourse.threejs.org/t/high-energy-consumption/22909)
- **[Structured]** rAF callbacks generally match display refresh rate, including 120 Hz and 144 Hz, so continuous loops can run more than twice as often on those displays. — [MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- **[Structured]** WebGL has no portable way to query available video memory, and running out can cause `webglcontextlost`. MDN advises conservative budgeting, and estimating use yourself. — [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **[Structured]** Chromium drops the oldest context when a page has too many, with a console warning. Firefox's message cites 16 live contexts per principal. WebKit has similar oldest-lost behaviour, with no number found. — [Chromium source](https://chromium.googlesource.com/chromium/blink/+/master/Source/modules/webgl/WebGLRenderingContextBase.cpp); [FingerprintJS PR](https://github.com/fingerprintjs/fingerprintjs/pull/484); [WebKit test](https://webkit.googlesource.com/WebKit/+/master/LayoutTests/webgl/many-contexts-expected.txt)
- **[Structured]** model-viewer defaults `powerPreference` to high-performance, a speed-over-power choice, and exposes a `render-scale` event with the reason `GPU throttling`, meaning the mature library treats throttling as a normal runtime condition. — [model-viewer docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)

### Inferences
- Do not take 98% as guaranteed. Plan for at least a low single-digit failure rate on desktop, more on old Windows machines and Linux.
- A userscript shares the page's context budget: the host page may already use WebGL, and every extra context pushes toward eviction of something the host owns. One script should never create more than one context per feature, and should prefer zero until needed.
- Fill rate is likely the first cost on phones, as buffer pixels scale with the square of DPR: a 3× phone draws 9 times the pixels per CSS pixel, compared with 4 times at a 2× cap.

### Gaps
- I found no published measurement of WebGL battery drain or sustained thermal throttling curves on phones. Forum and desktop anecdotes are the best available.
- I found no official iOS Safari WebGL memory limit or context cap. A secondary source claiming lower limits on mobile was [unsourced](https://bugnet.io/blog/how-to-fix-too-many-active-webgl-contexts-oldest-context-will-be-lost).
- Current global WebGL failure rate is disputed, with no independent measurement.

## What budgets should apply?

### Takeaway
Only asset budgets have authoritative published numbers, and they converge on about 100k triangles, 2K textures and 5 to 10 MB. FPS, draw-call and JS budgets are conventions. No official budget exists for a 3D element embedded in someone else's page, so those numbers below are proposed, not sourced.

### Cited Findings

| Budget | Value | Source | Grade |
|---|---|---|---|
| Triangles | 100k recommended limit, 30k to 50k ideal | [Google Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer) | Structured |
| Triangles | 100k or less | [Khronos guidelines quoted on three.js forum](https://discourse.threejs.org/t/maximum-3d-model-size-to-load/46077/7) (official page's summary was [incomplete](https://raw.githubusercontent.com/KhronosGroup/3DC-Asset-Creation/main/asset-creation-guidelines/RealtimeAssetCreationGuidelines.md)) | Structured, secondhand |
| Triangles | About 100k, one 2048 texture set, 10 s animation (2018) | [Apple forum on USDZ sizes](https://developer.apple.com/forums/thread/693867); [Sketchfab](https://help.sketchfab.com/en/articles/16152669-gltf-glb-and-usdz) | Rule of thumb; described as guidance, not a limit |
| File size | Ideally under 5 MB | [Khronos via forum](https://discourse.threejs.org/t/maximum-3d-model-size-to-load/46077/7); [Asset Auditor default 5120 KB](https://www.npmjs.com/package/@khronosgroup/gltf-asset-auditor) | Structured |
| File size | 10 MB recommended, validator error above 15 MB | [Google Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer) | Structured |
| Textures | 2048×2048 max recommended | [Google Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer) | Structured |
| Textures | 1K or 2K for base colour, ORM and emissive; 2K for normals | [Khronos via forum](https://discourse.threejs.org/t/maximum-3d-model-size-to-load/46077/7) | Structured, secondhand |
| Max texture size | 4096 is the value effectively all systems support | [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | Structured |
| Materials | 10 recommended, 2 of them alpha | [Google Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer) | Structured |
| Draw calls | Under 50 excellent on mobile, 50 to 100 acceptable, 100 to 200 may drop frames | [Mobile Ready tool docs](https://superhivemarket.com/products/mobile-ready/docs) | Rule of thumb |
| Draw calls, triangles | Under 200 calls and 500k triangles on mobile; under 500 and 2M on desktop | [3Lens guide](https://3lens.vercel.app/guide/features/performance) | Rule of thumb |
| Draw calls | Under about 100 to 150 for 60 fps on mid-range | [Hon Tran](https://www.hontran.dev/blog/three-js-performance-optimization) | Rule of thumb |
| LCP | 2.5 s or less at p75 (applies to page, not canvas) | [web.dev](https://web.dev/articles/lcp) | Structured |
| INP | 200 ms or less at p75 | [web.dev](https://web.dev/articles/inp) | Structured |
| Pixel ratio | Cap at 2 | [Unofficial blog](https://salivity.github.io/three.js/article/three-js-mobile-performance-limit-device-pixel-ratio); [React Doctor rule](https://www.react.doctor/docs/rules/react-doctor/three-cap-device-pixel-ratio) | Rule of thumb |

- **Conflict on draw calls:** a forum commenter argues the time each call takes matters, not the count. This undercuts any fixed number; use `renderer.info` and measure on real devices. — [three.js forum](https://discourse.threejs.org/t/material-draw-calls-reducer/29211)
- **[Rule of thumb]** One write-up reports going from 387 to 42 draw calls and about 10 to 30 fps on mobile. A single paywalled case. — [JavaScript in Plain English](https://javascript.plainenglish.io/how-we-optimized-our-three-js-application-to-run-on-mobile-devices-4a3bc9e572f4)
- **[Structured]** Mipmaps add about 33% memory, and depth or stencil memory is rounded up to 4 bytes per pixel. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **[Rule of thumb, old]** JS size: importing Three.js added about 560 KiB in one webpack report. A custom workaround reached 338 KB, or 92.5 KB gzipped. Tree shaking is described as limited. A blog uses 400 KB illustratively. — [three.js forum](https://discourse.threejs.org/t/three-js-file-size-when-importing-via-npm-and-bundling-with-webpack/8904); [Hon Tran](https://www.hontran.dev/blog/core-web-vitals-for-animation-heavy-sites)

### Inferences
Texture memory is calculable from MDN's figures: 2048×2048 RGBA8 is 16 MiB, about 21 MiB with mips. 1024×1024 is about 5.3 MiB with mips. A 390×844 canvas at DPR 2 needs about 5 MiB for colour and depth each, multiplied further by antialiasing.

**Proposed budget for a 3D element added to a live page (my inference, not published; validate on a mid-range Android phone):**

| Metric | Decorative or hero | Interactive viewer or scene |
|---|---|---|
| Frame rate | 30 fps minimum; idle at 0 fps when static | 30 fps minimum on mobile, 60 target on desktop |
| Draw calls, mobile | Under 50 | Under 100 |
| Triangles, mobile | Under 50k | Under 100k |
| Textures | 1K, ideally compressed; total under 32 MiB | 2K max; total under 64 to 128 MiB |
| Asset download | Under 1 MB | Under 5 MB, hard stop at 10 to 15 MB |
| Pixel ratio | Max 1.5 | Max 2 |
| Added main-thread blocking | No single task over 50 ms after first paint (the 50 ms long-task boundary is from memory; verify) | Same; compile asynchronously |
| JS | Lazy-loaded only, never in first paint | Same |
| Time to first frame | Poster instantly; scene within about 2 to 3 s or stay on poster | Poster with visible progress |

### Gaps
- Current Three.js and model-viewer minified and gzipped sizes were not obtained, as Bundlephobia returned 429. Three.js's own [CI size workflow](https://www.github.com/mrdoob/three.js/blob/ac1d2cfd49d795f654a200166d04323a4f987f53/.github/workflows/read-size.yml) or a local bundle analysis should settle this.
- The official Khronos Publishing Targets page was unreachable (404); numbers are quoted secondhand plus validator defaults.
- No official source gives an FPS, draw-call or time-to-first-render budget for embedded web 3D.
- Apple's current numbers are less specific than the 2018 guidance. I did not review its [WWDC24 session](https://developer.apple.com/videos/play/wwdc2024/10186/?time=65) in detail.
- Sketchfab or Unity Web published numeric budgets beyond the above were not found.

## Which practices are required when shipping?

### Takeaway
Lazy-load behind a poster, render only when something is changing and visible, cap resolution, compile shaders asynchronously, handle context loss, and tear down fully on removal. Official docs back disposal, context loss and async compile. Off-screen pausing and render-on-demand are standard practice, but I found no measured data on their savings.

### Cited Findings
- **[Structured]** Loading: model-viewer's default `loading="auto"` equals lazy: it loads when near the viewport, with a poster until reveal. — [model-viewer docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)
- **[Rule of thumb]** The LCP image should be eager, preloaded and `fetchpriority="high"`, never lazy-loaded. No source addresses WebGL posters directly. — [Marfeel](https://www.marfeel.com/docs/site-technology/cwv-sitetech/lcp-cls-and-inp-optimization-quick-wins)
- **[Structured]** Shader stalls: `renderer.compileAsync()` uses `KHR_parallel_shader_compile`, and resolves when the scene can render without stalling on compilation. — [three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- **[Structured]** Check `LINK_STATUS` rather than compile status, compile before linking, and avoid blocking calls such as `getError` and `readPixels` on the main thread. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **[Structured]** Off-screen and hidden: rAF is paused in most browsers in background tabs and hidden iframes for performance and battery. Use timestamps so animation speed does not depend on refresh rate. — [MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- **[Rule of thumb]** Wasted frames, fill rate and draw calls, not raw triangles, usually explain slow scenes. — [Hon Tran](https://www.hontran.dev/blog/three-js-performance-optimization)
- **[Structured]** DPR: the three.js manual treats a pixel-ratio multiplier cautiously for heavy apps because of GPU cost. — [three.js Responsive Design](https://threejs.org/manual/en/responsive)
- **[Rule of thumb]** The `setPixelRatio(devicePixelRatio)` pattern can create a buffer much larger than the physical screen under fractional scaling. Reapply any cap on resize, because zoom changes DPR. — [three.js forum](https://discourse.threejs.org/t/hidpi-fractional-scaling-performance-pitfalls-and-best-practices/87114); [iOS low-FPS thread](https://discourse.threejs.org/t/low-fps-on-ios-mobile-with-pixel-ration-set-as-window-devicepixelratio/4963)
- **[Structured]** Sizing: `ResizeObserver` with `device-pixel-content-box` avoids moiré at non-integer ratios. Resize in the rAF loop, not in the observer, since resizing clears the canvas. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **[Structured]** Adaptive quality: model-viewer's `minimumRenderScale` defaults to 0.5, with dynamic scaling and a `render-scale` event. MDN advises offering user quality settings. — [model-viewer docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json); [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **[Structured]** Disposal: three.js does not release GPU entities automatically. Geometry, materials, textures and render targets each need `dispose()`. Disposing a material does not dispose its textures, since they may be shared. Internal resources tied to `envMap`, `scene.background` or `scene.environment` are not reachable by traversal. `renderer.info` shows what remains. (Read from a search-index excerpt; direct fetch of the page returned 404.) — [three.js manual](https://threejs.org/manual/en/how-to-dispose-of-objects.html)
- **[Structured]** `renderer.dispose()` frees the renderer's GPU resources. `forceContextLoss()` and `forceContextRestore()` are documented as *simulating* loss via `WEBGL_lose_context`. — [three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- **[Structured]** Eagerly lose contexts with `WEBGL_lose_context` when done with the canvas, but do not add an `unload` handler for it. Delete objects eagerly. Handle `webglcontextlost`. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)
- **[Structured]** `webglcontextlost` fires on loss, does not bubble, and can be simulated with `loseContext()`. — [MDN event page](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)
- **[Structured]** Three.js `info.memory` and `info.render` expose geometries, textures, calls and triangles for checks. — [three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)

### Inferences
Required lifecycle for a userscript, built from the above:
1. Render a static poster or nothing first. Dynamically import the renderer only after an intent or visibility trigger.
2. Run an `IntersectionObserver` and a `visibilitychange` listener; stop the loop when off-screen or hidden. A visible tab does not stop rAF for an off-screen canvas, so the MDN pause alone is not enough.
3. Render on demand for static scenes: draw on control change, resize or animation, not on every rAF.
4. Cap DPR at 2 or below, and reduce when frame time stays high, with hysteresis to avoid oscillation.
5. On `webglcontextlost`: call `preventDefault()`, stop the loop and show the poster. On restored: rebuild, and after repeated losses stay on the poster. Test using `forceContextLoss`.
6. Teardown on element removal, SPA route change and script disable: stop loop, disconnect observers, remove listeners, dispose all resources, close bitmaps, `renderer.dispose()`, `forceContextLoss()`, remove the canvas, drop references. Verify using `renderer.info.memory`.
7. SPA detection is needed since no unload occurs on route change: `MutationObserver` on the host element plus history or `navigation` events. Verify after 10 mount and unmount cycles that context and memory counts are stable.

### Gaps
- The official three.js render-on-demand and cleanup manual pages could not be fetched (404 at every URL tried), so render-on-demand has no official citation here. Find the current URL before citing the manual for it.
- `preventDefault()` being required to allow restoration is from general WebGL knowledge, as the fetched MDN page does not state it. Verify against the [WebGL spec](https://registry.khronos.org/webgl/specs/latest/1.0/). The spec was not fetched.
- `skeleton.dispose()` and `ImageBitmap.close()` were not confirmed from an official page fetched here.
- No measured data was found on battery or frame savings from pausing or on-demand rendering.

## What accessibility requirements apply?

### Takeaway
Autoplaying 3D must be pausable (Level A) and should honour reduced motion. Canvas needs a text alternative or a decorative role. Orbit and pinch controls need keyboard and single-pointer alternatives. Scroll and focus must never be captured without a way out. model-viewer is a useful precedent, not proof of conformance.

### Cited Findings

| Criterion | Level | What it means for 3D | Source |
|---|---|---|---|
| 1.1.1 Non-text Content | A | Text alternative of equal purpose. Sensory content needs at least a descriptive label; decorative content must be ignorable by assistive tech | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) |
| 2.1.2 No Keyboard Trap | A | If focus enters, keyboard alone must get out. Non-standard exits must be explained. Embedded content is covered | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html) |
| 2.2.2 Pause, Stop, Hide | A | Motion that starts automatically, lasts over 5 s and runs beside other content needs a pause, stop or hide control. Starting on scroll into view or hover counts as automatic | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) |
| 2.3.3 Animation from Interactions | AAA | Interaction-triggered motion can be disabled unless essential. Calls out vestibular effects and parallax | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) |
| 2.5.1 Pointer Gestures | A | Multipoint or path gestures need a single-pointer alternative. Pinch zoom needs, for example, plus and minus buttons | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) |
| 2.5.7 Dragging Movements | AA | Dragging needs a single-pointer non-drag alternative. The page does not mention orbit controls directly, but grab-and-rotate fits its definition; preset-view or rotate buttons would meet it | [W3C](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) |

- **[Structured]** WCAG's sufficient techniques for 2.3.3 include C39 (CSS) and SCR40 (JS) with `prefers-reduced-motion`. — [W3C](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
- **[Structured]** Vestibular triggers include parallax, zoom effects and large scroll-linked motion, with symptoms of dizziness, nausea and migraine. Listen to `matchMedia` changes in JS animations. — [web.dev](https://web.dev/articles/prefers-reduced-motion)
- **[Structured, Changes]** `prefers-reduced-transparency` is non-Baseline, labelled limited availability and experimental by MDN. Treat as progressive enhancement. It is triggered by Windows, macOS and iOS settings. — [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency)
- **[Structured]** Canvas accessibility: fallback text or an image goes inside `<canvas>`, with `</canvas>` required. Use `role="presentation"` only for purely decorative canvases. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage)
- **[Structured]** model-viewer precedent: `alt` text for screen readers; `a11y` JSON for orientation announcements (front, back, left, right, upper, lower) and prompt text; `interaction-prompt`; `touch-action="pan-y"` by default, keeping vertical page scrolling; `disable-zoom`, which stops capturing wheel and pinch so they scroll or zoom the page; `auto-rotate` with a 3 s delay by default. Arrow keys appear in the default prompt text. — [model-viewer docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)
- **[Structured, historical]** A 2019 issue reports VoiceOver and NVDA reading its labels, and VoiceOver sometimes reporting the canvas as busy. — [GitHub issue 464](https://github.com/google/model-viewer/issues/464)
- **[Rule of thumb]** A third-party mirror shows arrow-key orbit plus `role="img"`, `aria-label` and `tabIndex=0` in examples, which are not confirmed defaults. — [Tessl mirror](https://tessl.io/registry/tessl/npm-google--model-viewer/files/docs/accessibility.md)
- **[Structured]** NN/g's scrolljacking findings are the usability counterpart to scroll traps. — [NN/g](https://www.nngroup.com/articles/scrolljacking-101/)

### Inferences
- Required baseline:
  - Under `prefers-reduced-motion: reduce`, no autoplay, auto-rotate, parallax or camera moves. Show a static frame or poster, and leave user-driven rotation available without inertia.
  - Visible pause control for any autoplay beyond 5 s. Simple, safe default: stop at 5 s.
  - Informative canvas: `role="img"`, `aria-label`, plus fallback content. Decorative: `aria-hidden` or `role="presentation"` and non-focusable. Canvas with controls: `tabindex="0"`, visible focus, a documented keyboard map and real `<button>`s.
  - Do not capture wheel by default. Enable zoom only after click or focus, or use buttons. Use `touch-action: pan-y` so a touch cannot trap vertical scroll.
  - Tab must always leave. Reserve Esc for exit in immersive modes and announce it.
  - Never place 3D motion directly behind body text, and raise overlay opacity under reduced transparency.
- Decorative 3D that adds no information should be dropped under reduced motion, not just frozen, if it would use resources for a still image.
- An accessible 3D element should never hold information only inside the canvas. Prices, specs and data must exist in DOM text.

### Gaps
- I could not confirm whether model-viewer checks `prefers-reduced-motion` on its own, and should not claim it does.
- Exact keyboard mapping and default ARIA attributes for model-viewer were not confirmed from the official docs data.
- No study was found measuring vestibular reactions specifically to WebGL scenes, or a prevalence figure from the sources read; web.dev gives no prevalence stat.
- No formal WCAG guidance specific to WebGL or 3D was found. Application to orbit controls is an interpretation.

## How should fallback and device detection work?

### Takeaway
Treat the static poster and DOM content as the base layer, and upgrade to 3D only after every check passes. Detection signals are incomplete by browser, so a missing signal means "unknown", not "capable". On context failure, stay on the poster rather than showing an error where the page was fine before.

### Cited Findings
- **[Structured]** Chrome's guidance: test and handle context creation failure, then fall back to Canvas2D or a message, and use `failIfMajorPerformanceCaveat` to avoid slow software paths. — [blink-dev intent](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)
- **[Structured]** `getContext()` returns `null` for unsupported identifiers, and `failIfMajorPerformanceCaveat` governs whether a context is created when performance would be low or no hardware GPU exists. Check for null. — [MDN getContext](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)
- **[Structured]** three.js exposes `failIfMajorPerformanceCaveat` (default false) and `powerPreference` (default `default`). — [three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
- **[Structured]** `WEBGL_debug_renderer_info` gives unmasked vendor and renderer strings, is widely available since 2017 and is intended for edge-case optimisation or debugging. It may be limited by privacy settings, and is disabled in Firefox with `privacy.resistFingerprinting`. MDN points to `failIfMajorPerformanceCaveat` and capability checks as alternatives. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_renderer_info)
- **[Structured]** `hardwareConcurrency` is widely available, returns logical processors, and may report fewer than present. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency)
- **[Structured, Changes]** `deviceMemory` has limited availability, is secure-context only, is rounded to a power of two and clamped with browser-defined bounds that may change, and is not specified in any standard per MDN. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)
- **[Structured, Changes]** `NetworkInformation.saveData` is limited availability. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData)
- **[Structured]** CSP blocks fire `securitypolicyviolation`, which reaches `document` and `window` rather than the element, so listen at top level. — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/securitypolicyviolation_event)
- **[Structured]** model-viewer's `poster` shows until the model is ready. Its default poster is white, which shows why a real image is worth providing. Scene Viewer's `S.browser_fallback_url` is a precedent for declared fallbacks. — [model-viewer docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json); [Google Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer)

### Inferences

**Detection and response (inference, built from the above):**

| Case | How to detect | What to show |
|---|---|---|
| WebGL or WebGL2 missing | `getContext("webgl2")` null, then try `webgl` if the feature allows | Poster image plus text, no error |
| Software renderer | Context with `failIfMajorPerformanceCaveat: true` is null while a plain request succeeds; or renderer string matches `/swiftshader\|llvmpipe\|software\|basic render/i` (strings other than SwiftShader are from my knowledge, verify) | Poster by default; user may opt in |
| Masked renderer info | Extension null or generic string | Unknown; rely on caveat flag plus a runtime frame probe |
| Library blocked | Dynamic import rejects, or `onerror`, or CSP event with script-src | Poster; log reason |
| Eval or worker blocked by CSP | `securitypolicyviolation` with script-src or worker-src; decoder init fails (Draco or Basis use WASM or workers) | Retry with uncompressed asset if available; otherwise poster |
| Asset blocked or failed | Loader error callback, non-OK fetch, CSP event with connect-src or img-src, timeout around 10 s | Poster; offer retry |
| Context lost and not restored | `webglcontextlost` with no restored in a few seconds, or repeated loss | Poster; do not retry in a loop |
| Low-end | `saveData` true; `deviceMemory` 2 or under where exposed; `hardwareConcurrency` 4 or under; frame time probe, for example over 33 ms sustained for 2 s | Lower quality, or poster with a "load 3D" click |
| Reduced motion | `matchMedia('(prefers-reduced-motion: reduce)')`, listening for change | Static frame, no autoplay |

- Runtime probe should outrank static signals: device thresholds above are my guesses and not published cut-offs. On Safari and Firefox some signals will likely be absent, so a frame-time check is the portable test.
- Show-on-fail order: the poster must exist before the 3D attempt, so a failure causes no layout shift and no visible error. Reserve the box using `aspect-ratio`.
- A poster of the model can double as the LCP candidate, as an image is LCP-eligible and canvas is not listed. Do not lazy-load it when above the fold.
- Where a userscript has no poster asset, capturing a canvas frame after first successful render and caching it would give later visits an instant poster. This needs testing, particularly with `preserveDrawingBuffer` behaviour.
- For purely decorative page effects, `powerPreference: "low-power"` is the appropriate hint, while `high-performance` suits only a user-requested viewer. It is a hint the browser may ignore.

### Gaps
- Per-browser `deviceMemory`, `saveData` and `prefers-reduced-transparency` support was not captured, since compatibility tables did not load. Check [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory) or caniuse.
- How Safari and Firefox currently report renderer strings, and any masking, was not verified.
- No published, validated low-end device thresholds were found.
- How `failIfMajorPerformanceCaveat` behaves across browsers was not tested. MDN's wording implies a null return but does not state it.
- Whether a userscript's CSP exposure differs by injection mode (page world versus isolated) was outside this scope and should be taken from other research notes or tested.
