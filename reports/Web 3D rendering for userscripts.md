# Build page 3D in code, load sparingly

TamperSloth should add 3D only when the content is a real physical or spatial object whose form the user needs to understand, or when the user explicitly asks for it. The evidence does not support 3D for data, navigation, forms or tools, and I found none showing that decorative hero visuals pay off. **The recommended primary stack is Three.js r187 (MIT) on the classic `WebGLRenderer`, running in the USER_SCRIPT world and fetched as text from pinned jsDelivr `+esm` URLs through a small `new Function` linker**, because `import()`, `<script src>`, `blob:` and `data:` are all refused under TamperSloth's world CSP. That stack rendered on a strict-CSP page in a probe. **The lightweight fallback is raw WebGL2 with no library**, the only option with no load path that can fail. Quality comes mostly from cheap choices: composed primitives with rounded edges in one committed style, a 1.2 KB `RoomEnvironment`, Neutral tone mapping, default-framebuffer MSAA and a static ground shadow, with no post-processing composer. Load assets only where code cannot compete (photographic materials, rigged characters), using CC0 files pinned by commit or tag, and treat open 3D generation as an opt-in extra at most. Three limits matter most. The loading probes ran on Chrome 141 with software GL and outside TamperSloth itself, every "visual gain" score is judgement, and the largest open question is not technical: an agent choosing CDN code on its own initiative is a grey area under Chrome Web Store policy. Bundling Three in the extension removes that question but departs from the load-by-URL brief, so the owner should decide it before the playbook names any URL.

**How to read the evidence.** **[Tested]** means first-hand work on 2026-11-04: curl fetches and header checks, a throwaway MV3 extension using `chrome.userScripts.execute` with TamperSloth's CSP strings on Chrome for Testing 141 (headless, SwiftShader), and one GPU timing benchmark on Chrome 152. **[Repo]** means read from TamperSloth's code. **[Source]** means stated by a linked doc, source file or paper and not re-run. **[Vendor]** and **[Anecdote]** mark weaker sources. **[Inference]** means reasoning or judgement. The section "What was tested and what was not" states the limits in one place.

## 3D helps when form is the content, and the conversion numbers are mostly marketing

The best peer-reviewed field evidence is modest. Tan, Chandukala and Reddy's cosmetics-retail study found AR use went with higher sales for less popular brands, narrower-appeal and more expensive products ([Kellogg summary](https://www.kellogg.northwestern.edu/academics-research/research/detail/2022/augmented-reality-in-retail-and-its-impact-on-sales/)). **Its overall effect is described as small**, and strongest where product uncertainty is high ([AMA summary](https://www.ama.org/2021/04/20/augmented-reality-in-retail-and-its-impact-on-sales-2/)). That study covers AR in one retailer's app rather than an in-page viewer, and only summaries were read. Behaviour points the same way: Baymard found **83% of users did not try an available 360-view feature** and calls such visuals a supplement, not a replacement, for images ([Baymard](https://baymard.com/ecommerce-design-examples/video-and-360-views)). The famous figures are vendor claims without a published method, including Shopify's "94% conversion lift" ([Shopify changelog](https://changelog.shopify.com/posts/shop-adds-3d-and-augmented-reality-ar-previews)) and single case studies such as Vertebrae's 52% ([casestudies.com](https://www.casestudies.com/company/vertebrae/case-study/increases-consumer-confidence-with-3d-ar)). Selection probably inflates them, since merchants who invest in 3D differ from others and users who open a viewer are already engaged [Inference].

For data, the rule is Munzner's "no unjustified 3D": depth is a weaker channel than planar position, occlusion hides data, and perspective distorts it ([Munzner](https://cs.ubc.ca/~tmm/talks/vad/VAD-rules.pdf)). Hughes measured about 10% better accuracy for 2D bar charts over 3D at n=57 ([Galway record](https://research.universityofgalway.ie/en/publications/just-noticeable-differences-in-2d-and-3d-bar-charts-a-psychophysi-3/)). The harm is contested at the margin: Kosara argues blanket claims outrun the research ([Kosara](https://eagereyes.org/blog/2016/3d-bar-charts-considered-not-that-harmful)), Few disputes his reading ([Few](https://www.perceptualedge.com/blog/?p=2362)), and advice against 3D rests largely on fixed 2D projections rather than interactive 3D ([record, excerpt only](https://vufind-test.katalog.k.utb.cz/SummonRecord/FETCH-LOGICAL-a1851-363259580aa64daa8add7e58cbaad2efa8fc0999ddaaffe254b512da355d4b313/Details)). Nielsen's 1998 argument that abstract information spaces suit 3D poorly is dated on hardware but still sound on navigation, and it names the legitimate cases: surgery, mechanical design, molecules, booth layout, entertainment ([NN/g](https://www.nngroup.com/articles/2d-is-better-than-3d/)). NN/g's 2023 testing found scrolljacking disoriented most participants, which rules out scroll-capturing 3D heroes on task pages ([NN/g](https://www.nngroup.com/articles/scrolljacking-101/)). **I found no controlled study of WebGL hero visuals on conversion or engagement, and no study of 3D in dashboards, forms or admin tools**, so those verdicts are extrapolations.

The signal table below is my construction from those sources [Inference]. An explicit user request can override a preference-based block on their own page, provided the tool says what is lost and keeps a 2D table reachable.

| Decision | Request signals | Page signals |
|---|---|---|
| **Use 3D** | Names a physical object, model, viewer, globe, map, molecule, floor plan, game or toy; "rotate", "spin", "explore" | Product page where shape or fit matters; a `.glb` or real coordinate dataset exists; an existing viewer to enhance |
| **Do not use 3D** | "Make this chart 3D", "make it pop" on a data page; asks for readability, speed, density | Dashboards, tables, forms, checkout, admin tools, docs, long articles; data with no spatial dimension; reduced motion for decoration; `saveData`; software renderer; no WebGL |
| **Ask the user** | "Add some wow" with no object; a 3D chart that true spatial data might justify | Landing page with no model asset; decoration behind readable text; low-end signals on a wanted feature |

Before WebGL, there is a cheaper tier. CSS transforms and opacity can run on the compositor alone ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)), so flat tilt, flip and depth layers need no library and keep DOM text selectable. Scroll-driven CSS reaches about 88% of users ([caniuse](https://caniuse.com/mdn-css_properties_animation-timeline_scroll)). Canvas 2D covers particles, noise and charts without depth. Choose WebGL only for real lighting, reflections, meshes, arbitrary geometry or many depth-sorted objects [Inference]. No direct measurement compares CSS 3D with WebGL for equivalent effects.

## Three r187 on WebGLRenderer wins, because everything else costs more or fails to load

The comparison below uses versions and licenses from the npm registry ([three](https://registry.npmjs.org/three/latest)). Sizes and CORS are [Tested] against the linked files; all returned `Access-Control-Allow-Origin: *`. "Strict render" is the probe on a page with `default-src 'none'; script-src 'self'` and matching directives. Timings are indicative only, since they include network and software GL.

| Framework | Version, license | No-build file | Raw / gzip bytes | Strict render in USER_SCRIPT |
|---|---|---|---|---|
| **Three.js** | 0.187.0, MIT | [`three@0.187.0/+esm`](https://cdn.jsdelivr.net/npm/three@0.187.0/+esm) | 753,603 / 190,746 | Yes via linker; core plus addons 3.7 s first run, 0.9 s second |
| Three + 6 addons | same | Orbit, GLTF, RoomEnvironment, HDR, EffectComposer, RoundedBox | about 216 KB gzip total | Yes |
| Three WebGPU build | same | [`three.webgpu.js/+esm`](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js/+esm) | 1,126,924 / 307,272 | Loaded, fell back to WebGL2 (no adapter) |
| OGL | 1.0.11, Unlicense | [`ogl@1.0.11/+esm`](https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm) | 133,629 / 39,358 | Yes via linker, 0.5 s |
| PlayCanvas | 2.23.3, MIT | [`playcanvas.min.js`](https://cdn.jsdelivr.net/npm/playcanvas@2.23.3/build/playcanvas.min.js) | 2,554,078 / 655,585 | Yes, 3.2 s |
| Babylon.js | 9.33.2, Apache-2.0 | [`babylon.js`](https://cdn.jsdelivr.net/npm/babylonjs@9.33.2/babylon.js) | 8,851,580 / 1,911,484 | Yes, 7.1 s |
| `<model-viewer>` | 4.4.0, Apache-2.0 | [UMD build](https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer-umd.min.js) | 1,072,040 / 288,717 | **Fails: `customElements` is null** |
| A-Frame | 1.8.0, MIT | [`aframe-master.min.js`](https://cdn.jsdelivr.net/npm/aframe@1.8.0/dist/aframe-master.min.js) | 1,323,403 / 348,461 | Not tested; expected to fail for the same reason [Inference] |
| Filament | 1.53.4, Apache-2.0 | [`filament.js`](https://cdn.jsdelivr.net/npm/filament@1.53.4/filament.js) + wasm | 3,781,288 / 2,015,989 | Not tested; WASM is blocked on strict pages |
| regl | 2.1.1, MIT | [`regl.min.js`](https://cdn.jsdelivr.net/npm/regl@2.1.1/dist/regl.min.js) | 86,652 / 28,436 | Not tested |
| twgl | 7.0.0, MIT | [`twgl-full.min.js`](https://cdn.jsdelivr.net/npm/twgl.js@7.0.0/dist/7.x/twgl-full.min.js) | 106,052 / 29,348 | Not tested |
| Raw WebGL2 | browser API | none | 0 | Context works in a closed shadow root |

Three wins on the combination of size, feature set and what LLMs write by default [Inference]. It has PBR, image-based lighting and post-processing at 191 KB gzip, a tenth of Babylon. Babylon is the credible alternative if API stability outweighs size, since its docs promise no public breaks between minor versions ([Babylon docs](https://doc.babylonjs.com/setup/frameworkPackages/frameworkVers)), but 1.9 MB per injection is hard to justify for page decoration. **WebGPU/TSL is not the default in Three.** The plain `three` entry has no `WebGPURenderer` [Tested], and the manual still recommends `WebGLRenderer` for pure WebGL 2 apps while calling the WebGPU renderer experimental. `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` and `EffectComposer` are also unsupported there ([manual](https://threejs.org/manual/pages/webgpurenderer.html)). So the code an LLM writes by habit works on one renderer and fails on the other. TSL functions also changed in each of the r185, r186 and r187 migration entries ([guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). Real WebGPU rendering is untested here, because the probe had no adapter.

Raw WebGL2 is the fallback rather than OGL because a library fallback fails the same way Three does when the CDN or `fetch` is unavailable, and OGL has no non-ESM build, so it needs the same linker anyway [Inference]. OGL (Unlicense) remains the runner-up when a scene graph is worth 39 KB of network, but its README expects you to write your own shaders ([README](https://raw.githubusercontent.com/oframe/ogl/master/README.md)). regl and twgl have non-ESM builds that could suit `@require`, which is untested.

### USER_SCRIPT refuses code loading but allows fetching text

This behaviour is first-hand, and Chrome documents none of it; the [userScripts docs](https://developer.chrome.com/docs/extensions/reference/api/userScripts) cover only `csp`, `worldId` and `execute`. TamperSloth's default and `tsw_<id>` worlds use `script-src 'self' 'unsafe-eval' 'unsafe-inline'` ([Repo] `extension/src/background/index.ts:84,319`). I found no Tampermonkey or Violentmonkey documentation of this exact case.

| Operation [Tested] | USER_SCRIPT, TamperSloth CSP, lax or strict page | MAIN, lax page | MAIN, strict page |
|---|---|---|---|
| `import('https://cdn...')`, `import(blob:)`, `import(data:)` | **Refused, even with no page CSP** | Works | Refused |
| `<script src="https://...">` or `blob:` | **Refused** | Works | Refused |
| Inline `<script>` text | **Runs, but in MAIN world** | Runs | Does not run |
| `eval`, `new Function` | Works | Works | Refused |
| `fetch()` cross-origin with CORS | Works, sent with the **page's** origin | Works | Refused |
| `fetch()` without CORS headers | Fails | Fails | Refused |
| `<img crossorigin>` with CORS | Works | Works | Refused |
| `import('chrome-extension://<id>/war.js')` | Works | Works | Works |
| `WebAssembly.compile`, `new Worker(blob:)` | Works on lax, **fails on strict** | Works | Refused |
| `customElements` | **`null`** | Registry | Registry |

The linker follows directly from this table: fetch the pinned `+esm` file, rewrite its `import` and `export` statements with regexes, resolve dependencies recursively through one shared registry, and run the result with `new Function`. It loaded Three plus seven addons, OGL, the WebGPU build and TSL, and rendered a rounded PBR box with RoomEnvironment through EffectComposer in a closed shadow root on the strict page [Tested]. The working code is in `C:\Users\owopr\Documents\TamperSloth\research_notes\Web 3D rendering for userscripts\frameworks_and_loading.md`. Its `globalThis` cache adaptation was not separately run. It is regex-tuned to jsDelivr's current minified output, so treat it as a stopgap and pin versions [Inference]. Addon `+esm` files import `/npm/three@0.187.0/+esm`, so one graph shares one Three instance [Tested].

Several traps bite naive code, all [Tested] unless marked. **`three.module.min.js` imports the unminified `three.core.js`, so loading it pulls about 379 KB gzip rather than the 89 KB it appears to be**; unpkg's copy returns 404. `?bundle` addons on esm.sh inline their own Three (a 280 KB `OrbitControls`), which creates multiple instances. No current non-ESM build exists: [`three.min.js`](https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.min.js) ended at r160, addons went ESM-only after r147, and since r186 [`three.cjs`](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.cjs) is a 631-byte stub saying "three is ESM-only going forward". Syntax errors inside `execute` return `result: null` with no error reported. **Three's own [`llms.txt`](https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/llms.txt) tells LLMs to use an import map, which fails here**: a world cannot resolve bare specifiers through one, and in MAIN on a strict page the inline map is refused.

Saved scripts need extra care. A script with no GM grant and no `@inject-into content` or `@sandbox DOM` runs in MAIN under the page's CSP ([Repo] `extension/src/scripts/userscript.ts:215-218`), where the whole strict column above applies. `@require` cannot consume ESM, and ESM syntax kills the script at parse time without an execution report ([Repo] `userscriptRuntime.ts:155,185-187`). The route that does parse is r147 through `@require` [Tested], 40 releases stale with old color and light APIs. `@resource` plus the linker pins bytes at install, but inlines about 1 MB of base64 on every matching page ([Repo] `userscriptRuntime.ts:178`). A cleaner design is an IIFE of Three plus chosen addons built at extension build time and injected with `js:[{file}, {code}]`. File injection worked with a tiny file, and WAR `import()` worked even from MAIN on a strict page [Tested]. The real bundle was not built [Inference].

### Workers, WASM, contexts and cleanup are the remaining hazards

Staying in USER_SCRIPT also avoids library clashes: with a host `window.THREE` set, USER_SCRIPT saw nothing, while MAIN logged the multiple-instances warning [Tested]. What remains is sharper. **Draco, KTX2 and worker-based text are effectively unavailable on strict pages**, because WASM and blob Workers fail, and adding `'wasm-unsafe-eval'` to the world CSP did not help [Tested]. The actual decoders were not run. A textured GLB and a 1K HDR did load on the strict page, so uncompressed assets work [Tested]. **The context limit spans worlds and can break the host page**: creating 24 contexts on a page with one host context left 16 alive and lost the host's. Twenty Three renderers disposed with `dispose()` alone also lost the host context, while `dispose()` plus `forceContextLoss()` kept it alive [Tested]. Chromium's source caps active contexts at 16 ([source](https://chromium.googlesource.com/chromium/blink/+/master/Source/modules/webgl/WebGLRenderingContextBase.cpp)), but that source is old and Stack Overflow disagrees on scope ([thread](https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/59140439/allowing-more-webgl-contexts)). An image without CORS taints the canvas and `texImage2D` throws `SecurityError`, and world isolation does not lift this [Tested]. Fetching host images through `GM_xmlhttpRequest` should work but is untested, and it sends cookies unless `anonymous: true` ([Repo] `userscriptBridge.ts:82`).

## Code-built models should start from parts, and no benchmark ranks the techniques

**No study compares these techniques against each other**, so the quality ceilings below are judgement. The measured evidence covers Three.js output generally, and it is sobering in a specific way: code runs, but content falls short. P3D-Bench's GPT-5.5 reached validity 1.000 on Three.js from images, with a semantic judge near 0.8 and a geometric judge near 0.35 ([P3D-Bench](https://arxiv.org/html/2606.11152v1)). WorldBench attributes **48.0% of lost points to unimplemented features** and another 32.4% to code never seen in a capture ([WorldBench](https://arxiv.org/html/2610.10622v1)). WorldCoder-Bench's best behavioural coverage was 27.8%, though its hidden state contracts mean this should not be quoted as "28% of Three.js works" ([WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)). These are mostly author-reported preprints with figures read through a summarising tool, so spot-check any number before quoting it publicly.

| Technique | Good for | Ceiling [Inference] | Characteristic failures | API source |
|---|---|---|---|---|
| Primitives and groups | Furniture, robots, vehicles, stylised characters | High in a committed style, low for realism | Floating parts, wrong pivots, no shared scale | Most reliable default [Inference] |
| `RoundedBoxGeometry`, bevels | Removing the default-primitive look | Small effort, large gain under environment light | Radius wrong for scale | [source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/geometries/RoundedBoxGeometry.js) |
| Extrude, lathe, SVG | Logos, panels, gears; bottles, wheels | High for hard-surface and symmetric forms | Default bevel grows the outline; bevels unsupported along `extrudePath`; stale `createShapes` | [Extrude](https://threejs.org/docs/pages/ExtrudeGeometry.html), [SVGLoader](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/loaders/SVGLoader.js) |
| Noise-displaced geometry | Terrain, rocks, blobs | High for terrain, poor for specific objects | Stale normals, single-octave lumps, sphere seams | Not read in source |
| Instancing | Forests, crowds, debris | Multiplies perceived richness cheaply | Missing `needsUpdate`, culling pop from a stale bounding sphere, uniform grids | [InstancedMesh](https://threejs.org/docs/pages/InstancedMesh.html) |
| Particles | Galaxies, dust, sampled shapes | Very high for atmospheric work | Square points, additive blowout | Not read in source |
| GLSL shaders | Water, gradients, procedural surfaces | Very high; often the largest gain per line | Missing tone-mapping and color-space chunks, unseen compile errors | [r152 notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791) |
| SDF raymarching | One hero object, blends | Very high visually, weak scene integration | Too many steps on weak GPUs, no depth integration | Not read in source |
| Text | Titles, signage | Strong as hero; troika best for crisp small text | Huge default size; troika fetches fonts from CDNs and its worker can be CSP-blocked, with `useWorker: false` the documented fix | [TextGeometry](https://threejs.org/docs/pages/TextGeometry.html), [troika](https://raw.githubusercontent.com/protectwise/troika/main/packages/troika-three-text/README.md) |
| Subdivision | Soft bodies from a cage | Medium to high for organic forms, loses hard edges | Triangle explosion, UV tearing, cracks without `mergeVertices` | [three-subdivide](https://github.com/stevinz/three-subdivide) |

Primitives rank first because each part can be verified and fixed separately [Inference]. Quality per line comes more from environment lighting and shaders than from more geometry [Inference]. P3D-Bench's Three.js topology penalty (0.828 against 1.000 on OpenSCAD) reflects a CAD view of solids and matters little for a scene that only has to render [Inference].

**Style is the cheapest way to look intentional, but no user study backs the ranking below**; it is judgement supported by API facts. Mixing material families is a plausible cause of the "crude" look, and that remains a hypothesis to test.

| Rank | Style | Why it hides primitive modelling | Exposes | Source for API facts |
|---|---|---|---|---|
| 1 | Abstract (shader, particles, SDF) | No reference to fail against | Weak composition and motion | Judgement |
| 2 | Clay / matcap | Lighting cannot go wrong, unified surface | Bad proportions; receives no shadows | [Matcap docs](https://threejs.org/docs/pages/MeshMatcapMaterial.html) |
| 3 | Low-poly, flat shaded | Facets become the style | Uniform default primitives | [Forum anecdote](https://discourse.threejs.org/t/how-to-create-a-scene-like-this/51835.md) |
| 4 | Toon | Removes surface detail demands | Silhouette; `gradientMap` needs `NearestFilter` and `NoColorSpace` | [Toon docs](https://threejs.org/docs/pages/MeshToonMaterial.html) |
| 5 | Glass, iridescent | Simple forms look expensive | Needs an environment; highest per-pixel cost | [Physical docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) |
| Last | Photoreal PBR | Hides nothing | Edges, textures, scale, contact | Judgement |

### Reference images are harder than numbers, and better looking helps most

The closest realistic guide comes from 3DHarnessBench, which rebuilds 100 targets as Blender Python rather than Three.js: **Opus 5 scored Uni3D 0.725 single-view with three refine rounds, 0.871 with agent-controlled viewpoints, and 0.927 with unrestricted Blender access** ([3DHarnessBench](https://arxiv.org/html/2609.06535)). A user with one photograph has no target asset, so 0.725 is the honest anchor, and transfer to Three.js is unmeasured [Inference]. The same paper's ablations point at what to spend effort on: camera pose cues cut Chamfer distance from 0.0199 to 0.0077, and part measurements cut Opus 5's from 0.0150 to 0.0084. More tools do not help every model, though: moving from multi-view to active visual changed Uni3D by +16.4% for Opus 5 and -16.5% for MiniMax M3. P3D-Bench shows images are harder than explicit parameters: GPT-5.5 on OpenSCAD scored Geo 0.567 and Judge 0.592 from images, against 0.715 and 0.850 from parametric text ([P3D-Bench](https://arxiv.org/html/2606.11152v1)). CADCodeVerify's self-questioning loop adds a modest automatic gain, 7.30% lower point-cloud distance ([paper](https://arxiv.org/html/2410.05340v2)).

The closest published workflow is img2threejs (Apache-2.0): classify the subject, inventory identity-defining details, write a spec, build through gated passes, and judge each pass on a reference-versus-render sheet. It publishes no fidelity benchmarks and says it is strongest on hard surfaces ([img2threejs](https://github.com/img2threejs/img2threejs)). Its 20.3k stars show interest rather than quality. Combined with the ablations, the evidence favours these elements: matching the camera first, writing measurements before code, a limit of about three refinement rounds, and restyling or declining organic and photoreal subjects [Inference]. The round limit comes from the benchmark's fixed-view harness, plus one practitioner's rule of switching strategy after three identical failures ([DEV Community](https://dev.to/aleksandr_kossarev_e23623/ai-orchestrated-3d-asset-pipeline-from-jpeg-to-game-ready-glb-without-touching-blender-1akf)). Silhouette extraction, proportion analysis and lighting estimation have no published evaluation as steps in LLM image-to-Three.js work, and I found no head-to-head test of Claude against GPT on this task.

**Verification must use both code and pixels, because each fails alone.** In WorldBench, code and frames disagreed on 32% of items, a code-only judge credited 79% against 53% for look-only, and four of five deliberately removed features were still credited ([WorldBench](https://arxiv.org/html/2610.10622v1)). In WorldCoder-Bench, screenshot-plus-vision scoring was essentially uncorrelated with behavioural verification (Kendall tau-b -0.068) ([WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)). Reading a WebGL canvas needs a fresh render in the same tick or `preserveDrawingBuffer`, which is general knowledge not tested here. Whether TamperSloth's own screenshot path captures a canvas in a closed shadow root was not tested.

### Description-to-code rests on part decomposition with thin causal proof

Decomposition is close to universal in recent systems: ShapeCraft ([search summary only](https://arxiv.org/pdf/2510.17603)), SceneCraft's relational constraints with a reported 45.1% CLIP gain over BlenderGPT on synthetic queries ([SceneCraft](https://proceedings.mlr.press/v235/hu24g.html)), and Procedura's assembly graph with placement solved from typed mates ([Procedura](https://arxiv.org/abs/2608.26238)). Procedura claims to beat prior agents, but its abstract gives no numbers. **I found no ablation that removes decomposition and measures the change.** The nearest evidence is that GPT-5.5's PartMatchF1 is about 0.5 ([P3D-Bench](https://arxiv.org/html/2606.11152v1)), so part recovery itself is weak, and that the largest WorldBench loss is simply unbuilt content. A vanilla Three.js version needs no training: one factory function per part, named groups with pivots at joints, a shared unit scale, placement computed from parent bounds, and a written inventory checked against the running scene graph [Inference]. Expanding a vague brief into explicit parameters before coding is suggested by the parametric-text advantage, though that comparison crosses input types.

Most stale-API errors are silent, which makes them more dangerous than crashes. The table lists the common ones. The migration facts are [Source] ([guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)), while "LLMs do this" is judgement, because no empirical study measures which errors they make most.

| Stale pattern | Correct at r187 | Since | Failure |
|---|---|---|---|
| Metal with no environment map | `scene.environment` from PMREM ([docs](https://threejs.org/docs/pages/MeshStandardMaterial.html)) | Always | Near-black, silent |
| Default `NoToneMapping` | Set one ([docs](https://threejs.org/docs/pages/WebGLRenderer.html)) | Always | Clipped highlights, silent |
| `outputEncoding`, `sRGBEncoding`, no `map.colorSpace` | `outputColorSpace`, `SRGBColorSpace` ([notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791)) | r152 | Washed out, silent |
| Pre-r155 light values, `useLegacyLights` | Multiply by PI; point and spot use candela ([notes](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)) | r155 | Too dark, silent |
| `antialias: true` under a composer | Pass a target with `samples` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/EffectComposer.js)) | Current | Jagged, silent |
| `new OutputPass(args)`, `GammaCorrectionShader` | `OutputPass()` reads the renderer | r155 | Args ignored |
| `RGBELoader` | `HDRLoader`; old file is a [268-byte deprecated wrapper](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/loaders/RGBELoader.js) | r180 | Warning |
| `PCFSoftShadowMap` | `PCFShadowMap` | r182 to r186 | Warning, falls back |
| `THREE.Clock` | `THREE.Timer` with `update()` | r183 | Deprecated |
| `new RoomEnvironment(renderer)` | No constructor args ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/environments/RoomEnvironment.js)) | r187 read | Args ignored |
| `pos.lerp(t, 0.1)` per frame | `MathUtils.damp` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.js)) | Always | Speed varies with refresh |

One research note said `RGBELoader.js` is absent from the r187 package, and another said it exists. **I re-checked during synthesis: it returns 200 at 268 bytes on both jsDelivr and unpkg and appears in the [file list](https://data.jsdelivr.com/v1/packages/npm/three@0.187.0).** It warns rather than 404s, and `HDRLoader` stays the right name. The sources also disagree on the `PCFSoftShadowMap` version (r182 in the guide, r186 in the [constant's comment](https://cdn.jsdelivr.net/npm/three@0.187.0/src/constants.js)), but the action is the same.

## Three asset sources work by URL, and generation is too fragile to depend on

Header checks on 2026-11-04 found only three families that really work as keyless, CORS-open runtime URLs. These were curl and `urllib` checks from one machine rather than browser fetches, except where noted. A commit SHA on jsDelivr is the only pin here that cannot move [Inference]. Poly Haven's `venice_sunset_1k.hdr` is 1,440,400 B on [its own host](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr) and 1,397,783 B in [the three.js copy](https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr), so the same filename can hold different bytes [Tested].

| Provider | License | Keyless, CORS-open URL [Tested] | Cache and stability [Tested] |
|---|---|---|---|
| Poly Haven `dl.polyhaven.org` | [CC0](https://polyhaven.com/license) | Yes, ACAO `*` | 4 h; mutable paths |
| jsDelivr `gh/KhronosGroup/glTF-Sample-Assets@<sha>` | Per model, in `metadata.json` | Yes | Immutable, 1 year |
| jsDelivr `gh/mrdoob/three.js@<tag>` | **Varies per file** | Yes (`npm/three/.../textures` is 404) | Immutable, 1 year |
| `raw.githubusercontent.com/<repo>/<sha>` | As repo | Yes | 5 min; [unauthenticated limits updated 2025](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/) |
| Poly Pizza `static.poly.pizza/<uuid>.glb` | Per model; CC0 and CC-BY seen | Yes; [API needs key](https://poly.pizza/docs/press), 401 | 7 days; no documented guarantee |
| ambientCG | [CC0](https://docs.ambientcg.com/license) | First hop has no ACAO; hashed mirror returns a ZIP | Undocumented hash; needs an unzip library |
| Kenney | [CC0](https://kenney.nl/support) | **No file URL found**; 403 to default curl | Not usable at runtime |
| Quaternius | [CC0 per site](https://quaternius.com/) | **No**; packs point to Google Drive and Patreon | Not usable at runtime |
| Sketchfab | CC0 filter | Search works; [download 401](https://api.sketchfab.com/v3/search?type=models&license=cc0&downloadable=true&count=1) | Key required for files |
| PMNDRS Market, Smithsonian API | n/a | 404 and 403 | Dead, and key required |

The starter kit below passed those header checks. The GLBs were read for `extensionsRequired` and need no decoder. **None of these models has been rendered**, and the only assets actually loaded in a probe were a `BoxTextured` GLB from a branch URL with no license recorded (a test file, not a recommendation) and `venice_sunset_1k.hdr` at tag r187 [Tested]. Scale, orientation and style fit remain unverified.

| Asset | Size | License | Use |
|---|---|---|---|
| [RobotExpressive.glb](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb) | 463,988 raw, 125,388 br; 14 animations, no images | [CC0 1.0](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/RobotExpressive/README.md) | Best rigged default |
| [Poly Pizza Adventurer](https://static.poly.pizza/bbe369ee-a686-42c7-adad-14356f5f2f15.glb) | 1,944,116 | [CC0 1.0 per page](https://poly.pizza/m/5EGWBMpuXq) | Character; structure not read |
| [venice_sunset_1k.hdr](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/equirectangular/venice_sunset_1k.hdr) | 1,397,783 raw, 963,946 br | CC0 by provenance only [Inference] | Pinned HDRI |
| [studio_small_09_1k.hdr](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr) | 1,615,248 | [CC0](https://polyhaven.com/license) | Product HDRI, unpinned |
| Poly Haven `brick_wall_001` 1k [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diffuse_1k.jpg), [normal](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_nor_gl_1k.jpg), [ARM](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_arm_1k.jpg) | 993,044 total | [CC0](https://polyhaven.com/license) | Photographic material, no unzip |
| [Avocado.glb](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Avocado/glTF-Binary/Avocado.glb), [Lantern.glb](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Lantern/glTF-Binary/Lantern.glb) | 8.1 MB, 9.6 MB | [CC0](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Avocado/metadata.json) | Over the 5 MB target |
| [DamagedHelmet.glb](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb) | 3,773,916 raw | [CC-BY 4.0](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/DamagedHelmet/metadata.json), credit required | PBR showcase only with visible credit |

License traps are easy to miss because **most GLBs carry no license inside the file**: `asset.copyright` was absent on seven of the tested Khronos models [Tested]. The classic Duck is SCEA Shared Source rather than CC0 ([metadata source](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Box/metadata.json) shows the per-model scheme). Three's own examples mix CC0, ["CC Attribution"](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/webgl_animation_keyframes.html) and [Mixamo-credited](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/webgl_animation_skinning_blending.html) files, and Horse, Parrot, Flamingo and coffeemat have no confirmed license. These should be excluded from any default set [Inference]. No provider's terms address hotlinking, so "not prohibited" is the strongest available claim, and jsDelivr's [terms](https://raw.githubusercontent.com/jsdelivr/jsdelivr/master/Terms%20of%20Use.md) ban general media hosting and offer no availability guarantee. Poly Haven asks live-API projects to credit "Powered by Poly Haven" ([README](https://raw.githubusercontent.com/Poly-Haven/Public-API/master/README.md)), and its terms prohibit scraping and data mining without permission ([license](https://polyhaven.com/license)).

The build-or-load choice follows from these sizes [Inference]. Build logos, icons, charts, text and simple forms in code, since they must match exactly and cost kilobytes (my estimate, unmeasured). Load photographic surfaces at about 1 MB, and characters and animated rigs because rigging in code is impractical. Environment lighting is the one real conflict in the notes: one note ranks a 1K HDRI as "big visual gain", while the other scores it at +1 over `RoomEnvironment` for about 1,600 KB. I side with the second by default and accept the first only for a metal or glass hero that needs real reflections. Both positions are judgement, because neither was visually compared. Each load must be treated as optional. The observed failures include wrong assumed paths, dead hosts, CORS-less redirect hops, a connection reset on jsDelivr and same-name files changing [Tested]. So the code-built version should render first, the asset should swap in on success, and an HTML error page must not reach a binary parser (check `glTF` magic bytes) [Inference].

### Browser-usable generation works once and fails as a dependency

One anonymous job on [hysts/Shap-E](https://hysts-shap-e.hf.space) returned a real 1,169,056-byte GLB in **2.2 seconds** with CORS open [Tested]. Quality was not assessed, and this was one sample on the simplest model. But **6 of 20 probed Space entries were in an error state, including Stability's own TripoSR and the original Microsoft TRELLIS** ([TripoSR record](https://huggingface.co/api/spaces/stabilityai/TripoSR)). One error row is the same host listed twice. These are third-party demos across three Gradio major versions with no service guarantee, and multi-step flows such as [TRELLIS.2](https://huggingface.co/api/spaces/microsoft/TRELLIS.2) are session-bound rather than stateless [Tested]. Anonymous users get **2 minutes of ZeroGPU a day** with low queue priority, and default GPU duration is 60 s ([HF docs](https://huggingface.co/docs/hub/spaces-zerogpu)). A search summary gave different figures, so these have changed before. Output sits under a `/tmp/gradio/` path, which suggests it is temporary [Inference]. `Client.duplicate` bills the user's account when GPUs are used, which breaks the no-paid constraint ([Gradio](https://www.gradio.app/guides/getting-started-with-the-js-client)). `@gradio/client` (2.7.2, ISC, [npm](https://registry.npmjs.org/@gradio/client/latest)) was not run in a browser or through the linker.

Licenses need reading beyond the Space card. **Hunyuan3D-2's license excludes the EU, UK and South Korea, needs a separate license above 1 million monthly active users, and prohibits using outputs to improve other AI models** ([LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2/main/LICENSE)). Cards list MIT for TRELLIS, Shap-E and LGM, and Apache-2.0 for InstantMesh, but those describe the demo rather than output rights. In-browser generation is ruled out under the brief. transformers.js (Apache-2.0 per [npm](https://registry.npmjs.org/@huggingface/transformers/latest), read during synthesis) lists no image-to-3D task ([docs](https://huggingface.co/docs/transformers.js/en/index)). TripoSR ONNX on onnxruntime-web (MIT per [npm](https://registry.npmjs.org/onnxruntime-web/latest)) means a **483,785,728-byte weights file** ([model tree](https://huggingface.co/api/models/cgb/triposr-onnx-webgpu/tree/main)), which is a local model install in practice [Inference]. TripoSplat's 6.47 GB bundle is further out ([model page](https://huggingface.co/Yosun/TripoSplat-WebGPU/)). If offered at all, generation should be a user-pressed action over a code-built or CC0 fallback, never a required part of a page. Sending a user's reference image to a third-party Space is also a data-sharing act the user should see [Inference].

## The biggest visual gains cost under 2 KB and under a millisecond

Costs below come from one benchmark: `EXT_disjoint_timer_query_webgl2` on three r187 in Chrome 152 with ANGLE D3D11 on an **RTX 4070 Laptop**, at 3840x2160, on a 73k-triangle scene with 6 draw calls, using minimum per-pass medians [Tested]. GPU clocks made readings bimodal, so error is about ±0.1 to 0.2 ms, and **no integrated GPU or phone was measured**. "Weak GPU" is my ms-per-megapixel multiplied by 10 to 30 for a 1 MP canvas, an order-of-magnitude estimate derived from a phone bloom paper ([Tarigan](https://etasr.com/index.php/ETASR/article/download/19101/6940)) and Intel's [XeGTAO](https://github.com/GameTechDev/XeGTAO) numbers. It understates render-target switches on tile GPUs. **Every gain score is judgement; no source measures perceived beauty.**

| Rank | Technique | KB [Tested] | RTX ms at 4K [Tested] | Weak GPU ms at 1 MP [Inference] | Gain /10 [Inference] | Per KB | Per ms |
|---|---|---|---|---|---|---|---|
| 1 | Correct color pipeline | 0 | 0 | 0 | 10 | Best | Best |
| 2 | DPR cap (1.5 small or decorative, 2 max) | 0 | Negative | Saves 2x to 4x | Protects | Best | Best |
| 3 | Tone mapper | 0 | +0.1 | 0.1–0.4 | 8 | Best | Excellent |
| 4 | RoomEnvironment + PMREM | 1.2 | +0.1, plus 100–200 ms once | 0.1–0.4 | 10 | Excellent | Excellent |
| 5 | Material tuning | 0 | 0 | 0 | 7 | Best | Best |
| 6 | Baked or blob shadow plane | Under 0.5 (own code, estimate) | +0.08 | 0.1–0.3 | 7 | Excellent | Excellent |
| 7 | Default-framebuffer MSAA, no composer | 0 | +0.22 | 0.3–0.8 | 7 | Best | Very good |
| 8 | Contact shadow, rendered once | 1–2 (estimate) | 0 static; +0.17 per frame | 2–5 if per frame | 8 | Very good | Excellent if static |
| 9 | Clearcoat on glossy products | 0 | +0.06 | 0.1–0.2 | 5 | Best | Very good |
| 10 | PCF directional shadow 1024 | 0 | +0.22 plus caster redraw | 2–7 | 6 | Best | Fair |
| 11 | VSM shadow | 0 | +0.22 | 2–7 | 5 | Best | Fair |
| 12 | Accumulated soft shadow, static | 2–4 (estimate, unbuilt) | Spread over frames, then 0 | Then 0 | 9 | Good | Excellent settled |
| 13 | Composer + bloom | 9.4 | +0.78 | 0.6–2 | 5 | Fair | Fair |
| 14 | Composer + FXAA | 8.6 | +0.51 | 0.6–2 | 3 | Poor | Fair |
| 15 | Composer with `samples: 4` | 6.2 | +1.93 | 2–7 | 7 | Good | Fair |
| 16 | UltraHDR custom HDRI | 2.6 + about 550 asset | Same as env | Same | +1 | Poor | Same |
| 17 | Transmission, glass only | 0 | +1.54 plus re-render | 2–6 | 8 for glass | Good if needed | Poor |
| 18 | `.hdr` 1K HDRI | 1.8 + about 1,600 asset | Same as env | Same | +1 | Very poor | Same |
| 19 | Composer + SMAA | 45 | +1.04 | 1–3 | 5 | Very poor | Fair |
| 20 | Composer + SSAO, defaults | 12.3 | +4.09 | 5–15 | 5 | Poor | Poor |
| 21 | Composer + GTAO, defaults | 14.4 | +9.74 | 11–34 | 7 | Poor | Worst |

The default this implies is Neutral tone mapping, `RoomEnvironment`, `antialias: true`, a static contact or blob shadow, and capped DPR, with no composer: about 1.2 KB beyond Three plus your own code, and under 1 ms on weak GPUs by estimate [Inference]. **Adding a composer costs at least 6 KB and silently loses cheap MSAA**, because its default target has no `samples` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/EffectComposer.js)); restoring it costs nearly nine times the default-framebuffer path in my measurements. GTAOPass cost about 20 times the full bloom pass, which makes published "GTAO is cheap" figures non-transferable: XeGTAO reports 2.39 ms at 1080p on integrated graphics, but that is a different implementation ([XeGTAO](https://github.com/GameTechDev/XeGTAO)). SMAA is the worst value per KB, with its pass module at 34.9 KB gzip from 48 KB minified, which suggests embedded lookup textures [Inference]. pmndrs/postprocessing (Zlib per [npm](https://registry.npmjs.org/postprocessing/latest), read during synthesis) merges effects into fewer passes, and N8AO (ISC per [npm](https://registry.npmjs.org/n8ao/latest)) offers half-res AO with no per-device benchmarks; neither was measured here. Note that their tone-mapping advice is library-specific: `OutputPass` *reads* `renderer.toneMapping`, so leaving it off with three's composer gives no tone mapping ([OutputPass](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/OutputPass.js), [postprocessing README](https://github.com/pmndrs/postprocessing)).

For tone, use `NeutralToneMapping` when brand or product colors must survive: for inputs within [0.08, 0.8] output equals input minus 0.04 under unit-white lighting ([Khronos](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md)), and model-viewer now defaults to it after complaints about ACES and AgX saturation ([model-viewer](https://modelviewer.dev/examples/tone-mapping)). Use AgX for a soft filmic look and ACES when you want its contrast. Sources conflict on hue behaviour ([Blender PR](https://projects.blender.org/blender/blender/pulls/118936)), and three's own glTF example still uses ACES, so "the official example does it" proves little ([example](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_loader_gltf.html)).

Page matching has one tested trap. **`THREE.Color.setStyle` cannot parse modern CSS color formats**: computed `oklch()`, `lab()` and `color()` values produce a warning and leave the old color in place, while a 1x1 canvas `fillRect` plus `getImageData` normalized all of them, with display-p3 clipping to sRGB [Tested on Chrome 152; [source](https://cdn.jsdelivr.net/npm/three@0.187.0/src/math/Color.js)]. `alpha: true` with no `scene.background` lets the page show through ([docs](https://threejs.org/docs/pages/WebGLRenderer.html)). A mark that must be exact can use `MeshBasicMaterial` with `toneMapped: false` [Inference from [source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js)]. Older threads say bloom cannot do transparent backgrounds ([forum](https://discourse.threejs.org/t/unrealbloompass-makes-background-black/38994)), while r187's [source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/UnrealBloomPass.js) differs and the result was not visually verified. Under a composer on a transparent canvas, expect brightened edges from premultiplied encoding [Inference from source, not captured]. No credible source links typography or page mood to material choice, so any such mapping is a starting point only.

### Interaction: no timings exist, so the ranking is reasoned from KB and mechanics

Nobody measured these patterns in milliseconds, and neither did this research, so the order below is my judgement [Inference]. KB figures are [Tested] where given, and the code patterns in the notes were not run in a browser. Keeping the page in charge of scrolling matters more than any flourish.

| Rank | Pattern | KB | Frame cost | Gain | Evidence and main trap |
|---|---|---|---|---|---|
| 1 | Stop rendering offscreen, on hidden tabs and for static scenes | 0 | Saves all | Protects | rAF pauses only for hidden tabs ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)), so an offscreen canvas needs `IntersectionObserver` [Inference]; no measured savings |
| 2 | Time-based damping everywhere | 0 | Negligible | High feel | `MathUtils.damp` is `lerp` with `1 - exp(-λ·dt)` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.js), [Driscoll](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/)); OrbitControls damping is per `update()`, so it varies with refresh ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js)) |
| 3 | CSS hover tilt and pointer-following gradient | About 0.4 own code | Compositor | High for flat cards | No Three needed; [vanilla-tilt](https://registry.npmjs.org/vanilla-tilt/latest) (MIT) has a [reported gyroscope stutter](https://www.github.com/micku7zu/vanilla-tilt.js/issues/72) |
| 4 | Pointer parallax on a parent rig | 0 | Forces continuous render | Medium | Do not move a camera OrbitControls owns; drop under reduced motion |
| 5 | Horizontal-only orbit, zoom off, `pan-y` | 4.7 | Render while moving | High for viewers | `connect()` sets `touch-action: none`, so set `pan-y` afterwards; `enableZoom = false` returns the wheel to the page ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js)); model-viewer reports iOS bugs with the CSS route ([docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)) |
| 6 | Click to explore (raycast, tween) | 0 | Scales with mesh | High for parts | NDC must use the canvas rect ([docs](https://threejs.org/docs/pages/Raycaster.html)); add a drag threshold; throttle hover picks |
| 7 | Scroll-linked motion from real scroll position | 0 | Continuous while scrolling | Medium | Reading `wheel` breaks keyboard and touch; large motion is a vestibular trigger ([web.dev](https://web.dev/articles/prefers-reduced-motion)) |
| Never | Scroll capture | | | Negative | "more user pain than benefits" ([NN/g](https://www.nngroup.com/articles/scrolljacking-101/)) |

GSAP appears in common scroll tutorials ([Codrops](https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/), snippet only), but npm lists it under a custom ["Standard 'no charge'" license](https://registry.npmjs.org/gsap/latest) rather than an open one, so it falls outside the brief [read during synthesis]. Pointer input inside a closed shadow root on real sites was constructed but never exercised with real input.

## Shipping 3D on someone else's page means the page must never get worse

Only asset budgets have authoritative numbers, and they converge: about 100k triangles (30k to 50k ideal), 2K textures and 5 to 10 MB ([Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer), [Khronos auditor default](https://www.npmjs.com/package/@khronosgroup/gltf-asset-auditor)). Draw-call and frame budgets are conventions, and a forum commenter fairly argues that time per call matters more than count ([forum](https://discourse.threejs.org/t/material-draw-calls-reducer/29211)). **No official budget exists for a 3D element embedded in a live page, so the table is proposed rather than sourced** [Inference], and it needs validating on real low-end hardware.

| Metric | Decorative | Interactive viewer |
|---|---|---|
| Frame rate | 30 fps floor; 0 fps when idle | 30 fps floor, 60 target on desktop |
| Draw calls / triangles on weak GPUs | Under 50 / 50k | Under 100 / 100k |
| Pixel ratio | Max 1.5 | Max 2, reapplied on resize |
| Asset download | Under 1 MB | Under 5 MB; hard stop 10 to 15 MB |
| Texture memory | 1K; under 32 MiB | 2K max; under 64 to 128 MiB |
| JS | Lazy, about 191 KB gzip core, 216 KB with six addons [Tested] | Same |
| Time to first frame | Existing page instantly; scene within 2 to 3 s or abandon | Visible progress |
| Main-thread tasks | None over 50 ms after paint (boundary from memory, verify) | Same; `compileAsync` |

The cross-checks are informative. **A 1K HDRI alone (1.4 to 1.7 MB) breaks the decorative budget**, which is another reason `RoomEnvironment` is the default. Khronos showcase GLBs at 8 to 13 MB exceed the viewer target. The probe's 3.7 s first run on software GL exceeds the time-to-first-frame budget, so the page must look complete before any of this loads. Fill rate is likely the first cost, as a 3x display draws nine times the pixels per CSS pixel ([Utsubo, asserted](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). Because extensions run in desktop Chrome, integrated laptop GPUs are the realistic weak case rather than phones, unless scripts are shared to other managers [Inference from general knowledge]. No published battery or thermal data exists for phones; the closest is one M1 reading of about 200 to 2000 mW ([Torchbox](https://torchbox.com/blog/how-much-power-do-web-assets-use)).

WebGL2 reach is high but disputed. Web3DSurvey reads **WebGL2 98.05% and WebGPU 83.39%** with no sample date shown ([Web3DSurvey](https://web3dsurvey.com/)). Rick Byers estimated software WebGL at about 0.5% of page loads, while Ashley Gullen argued 4 to 5% worldwide because that survey skews high-end, and the thread leaves it unresolved ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)). **This matters on TamperSloth's platform**, because Chrome is removing automatic SwiftShader fallback on desktop, so context creation fails outright rather than running slowly. The intent estimated Chrome 137, while Chromium docs say M139 ([docs](https://chromium.googlesource.com/chromium/src/+/205191a32c9db91062c5342e901b2da2d67a49e5/docs/gpu/swiftshader.md)). Current stable behaviour was not confirmed. A null context is therefore a normal path to design for [Inference].

Lifecycle requirements have strong documentary support. Three does not release GPU resources automatically, and disposing a material leaves its textures alive ([manual, read via index excerpt](https://threejs.org/manual/en/how-to-dispose-of-objects.html)). `compileAsync` avoids compile stalls ([docs](https://threejs.org/docs/pages/WebGLRenderer.html)). MDN advises handling `webglcontextlost`, eagerly losing contexts when done, and resizing in the rAF loop ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Combining those with the probes gives the requirement [Inference]: one context per feature; pause when offscreen or hidden; render on demand when static; full teardown ending in `forceContextLoss()`, because the probe showed `dispose()` alone is not enough. SPA routes need their own detection because registered scripts only re-run on real navigations, and second runs in a world share `globalThis`, so earlier instances must be removed first. Note that `preventDefault()` on context loss comes from general knowledge, not the fetched pages.

The notes need one translation for this environment. General advice to "dynamically import the renderer" means "run the linker on a trigger" here, since `import()` is refused. **Listening for `securitypolicyviolation` as a sign of failure would misfire**, because addon `+esm` fetches logged a page-level refusal from a `modulepreload` Link header while rendering was unaffected [Tested for the log; Inference for the misfire and the Link-header cause]. Success of the load and render should be the test, not the absence of CSP events.

| Case | Detection | Response [Inference] |
|---|---|---|
| WebGL missing | `getContext('webgl2')` null ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext)) | Leave the page as it was; no error |
| Software renderer | `failIfMajorPerformanceCaveat` context null while plain succeeds ([blink-dev](https://groups.google.com/a/chromium.org/g/blink-dev/c/yhFguWS_3pM)); renderer string may be masked ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_debug_renderer_info)) | Poster, opt-in only; cross-browser behaviour untested |
| CDN or `fetch` failed | Linker rejects, or timeout around 5 to 10 s | Raw WebGL2, CSS or nothing |
| Decoder blocked | WASM or Worker failure on strict pages [Tested] | Uncompressed asset or placeholder |
| Asset failed | Loader error, wrong magic bytes, CORS | Code-built shape, flat color, plain lights |
| Context lost | `webglcontextlost`, no restore ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/webglcontextlost_event)) | Poster; no retry loop |
| Low-end | Frame-time probe outranks `saveData`, `deviceMemory`, `hardwareConcurrency` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)); thresholds are guesses | Lower quality, or click to load |
| Reduced motion | `matchMedia`, listening for change ([web.dev](https://web.dev/articles/prefers-reduced-motion)) | Static frame; drop decoration |

On a live page the base layer usually exists already: the product photo, chart or heading stays, and 3D augments it [Inference]. Canvas is not listed among LCP-eligible elements, though the page does not discuss it directly ([web.dev](https://web.dev/articles/lcp)), and a late-loading scene should not disturb the host's Largest Contentful Paint or [INP](https://web.dev/articles/inp) if it reserves its box and avoids long tasks [Inference; no before-and-after measurement found].

Accessibility has binding criteria, though WCAG says nothing specific to WebGL, so applying them to orbit controls is interpretation.

| Criterion | Level | Application to 3D |
|---|---|---|
| [1.1.1 Non-text Content](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html) | A | `role="img"` and label for informative canvases; `aria-hidden` or [`role="presentation"`](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Basic_usage) for decorative ones; prices and specs stay in DOM text |
| [2.1.2 No Keyboard Trap](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html) | A | Tab must always leave |
| [2.2.2 Pause, Stop, Hide](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html) | A | Autoplay over 5 s beside other content needs a control; starting on scroll or hover counts as automatic |
| [2.5.1 Pointer Gestures](https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html) | A | Pinch zoom needs a single-pointer alternative |
| [2.5.7 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html) | AA | Orbit drag needs rotate or preset-view buttons |
| [2.3.3 Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) | AAA | Parallax can be disabled; `prefers-reduced-motion` is a listed technique |

model-viewer (Apache-2.0) is a useful precedent for `alt`, `a11y` announcements, `pan-y` and `disable-zoom` ([docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)), but I could not confirm it honours reduced motion on its own, so it does not prove conformance. Decorative 3D that adds no information should be dropped rather than frozen under reduced motion, and never placed directly behind body text [Inference]. `prefers-reduced-transparency` is non-Baseline ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-transparency)).

## What was tested and what was not

| Claim area | Status | Basis | Limit |
|---|---|---|---|
| USER_SCRIPT permissions matrix, linker, Three r187 render on strict page | **Tested** | MV3 probe, results in `C:\Users\owopr\AppData\Local\Temp\claude\4457f3e905c798b4\de7f4484-9fb8-4346-b08d-7dcca3aeaef3\scratchpad\uswtest\` | Chrome 141, not current stable 156; SwiftShader; local pages; not inside TamperSloth; GM shim not exercised |
| Library and asset sizes, CORS, cache headers | **Tested** | curl and `urllib` | One machine; headers rather than browser fetches for most assets |
| Context limit, `forceContextLoss`, shadow root, world isolation from host Three | **Tested** | Same probe | Software GL hides memory pressure |
| GPU ms per effect | **Tested** | `C:\Users\owopr\AppData\Local\Temp\claude\4457f3e905c798b4\de7f4484-9fb8-4346-b08d-7dcca3aeaef3\scratchpad\bench\bench.html` | One discrete laptop GPU, noisy clocks, hidden pane, simple scene |
| CSS color parsing and canvas normalisation | **Tested** | Chrome 152, r187 | One browser; 8-bit sRGB |
| Space status, one Shap-E job | **Tested** | HF API, one generation | One point in time; no latency for TRELLIS or Hunyuan |
| `RGBELoader` presence, licenses of postprocessing, N8AO, vanilla-tilt, GSAP, transformers.js, onnxruntime-web | **Tested during synthesis** | curl and npm registry on 2026-11-04 | Registry field only |
| TamperSloth world CSP, `evaluate` CSP, MAIN default, `GM_xmlhttpRequest` credentials | **Repo, re-read during synthesis** | `index.ts:84,319`, `browserService.ts:171`, `userscript.ts:215-218`, `userscriptBridge.ts:82` | Working tree has uncommitted changes, so lines can move |
| API behaviour, migration history | **Source** | Docs and source at r187 | Migration guide read to 100,000 of 114,017 characters via a summariser |
| Benchmark numbers | **Source, preprints** | Author-reported, via summarising fetch | 3DHarnessBench and P3D-Bench only partly read; mostly Blender or OpenSCAD rather than Three.js |
| Gain scores, technique ceilings, style ranking, interaction ranking, budgets, decision signals, weak-GPU estimates | **Inference** | Judgement built from the above | No perception study; no integrated GPU measured |
| Vendoring as IIFE; raw WebGL2 on strict MAIN; `GM_xmlhttpRequest` for host images; time-based orbit damping; render of starter-kit models | **Inference, untested** | Reasoned from probes | Each needs a test before it is relied on |
| Draco, KTX2 and meshopt on strict pages | **Inference from primitives** | WASM and Worker failed; decoders not run | Re-test on Chrome 156 |

## Licenses for every tool and source

Each line states the license as read, and all of them can change, so re-check before shipping. This is not legal advice.

| Item | License as stated | Reuse position |
|---|---|---|
| [three.js](https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE), addons, examples code | MIT | Yes, keep notice; [maintainer notes](https://discourse.threejs.org/t/question-about-examples-license/60) some "inspired from" code has extra attribution; example assets vary |
| [OGL](https://registry.npmjs.org/ogl/latest) | Unlicense | Yes |
| [PlayCanvas](https://registry.npmjs.org/playcanvas/latest), [A-Frame](https://registry.npmjs.org/aframe/latest), [regl](https://registry.npmjs.org/regl/latest), [twgl](https://registry.npmjs.org/twgl.js/latest), [three-stdlib](https://registry.npmjs.org/three-stdlib/latest) | MIT | Yes |
| [Babylon.js](https://registry.npmjs.org/babylonjs/latest), [`<model-viewer>`](https://registry.npmjs.org/@google/model-viewer/latest), [Filament](https://registry.npmjs.org/filament/latest) | Apache-2.0 | Yes, with notice |
| [drei](https://raw.githubusercontent.com/pmndrs/drei/master/LICENSE), [maath](https://raw.githubusercontent.com/pmndrs/maath/main/LICENSE), [troika](https://raw.githubusercontent.com/protectwise/troika/main/LICENSE), [three-subdivide](https://github.com/stevinz/three-subdivide), [tsl-textures](https://raw.githubusercontent.com/boytchev/tsl-textures/main/LICENSE), [threejs-skills](https://github.com/CloudAI-X/threejs-skills) | MIT | Yes; drei shaders need adapting out of React; fonts are separate; threejs-skills targets r186 |
| [img2threejs](https://github.com/img2threejs/img2threejs) | Apache-2.0 | Yes; its private plugin and hosted product are separate |
| [blender-mcp](https://github.com/ahujasid/blender-mcp) | MIT | Pattern only; needs Blender |
| [postprocessing](https://registry.npmjs.org/postprocessing/latest) / [N8AO](https://registry.npmjs.org/n8ao/latest) / [vanilla-tilt](https://registry.npmjs.org/vanilla-tilt/latest) | Zlib / ISC / MIT | Yes |
| [@gradio/client](https://registry.npmjs.org/@gradio/client/latest) | ISC | Yes; Space terms are separate |
| [folio-2025](https://github.com/brunosimon/folio-2025) | MIT label | Code probably; assets unverified |
| [Quilez](https://iquilezles.org/) | MIT for algorithms, copyright for artwork code (via search result) | [Check each header](https://linen.futureofcoding.org/t/12355754/my-overall-goal-for-the-year-is-to-finally-learn-how-to-do-r); [Blender precedent](https://developer.blender.org/rB3848507511a7546ab396c80f069b48de3332860f) |
| [GSAP](https://registry.npmjs.org/gsap/latest) | Custom "no charge" | **Not open; exclude** |
| [LYGIA](https://raw.githubusercontent.com/patriciogonzalezvivo/lygia/main/LICENSE.md) | Prosperity 3.0.0 | **30-day commercial trial only unless licensed** |
| [Shadertoy](https://www.shadertoy.com/terms) | Reported CC BY-NC-SA 3.0 default ([secondhand](https://godotshaders.com/shader/creation-by-silexars/); terms returned 403) | **No by default; an [MIT label on a copy is not proof](https://discourse.vidvox.net/t/user-bennoh-is-stealing-shaders-and-uploading-them-online-with-mit-license/2682)** |
| [Three.js Journey](https://threejs-journey.com/) | Not found | **Assume no** |
| Poly Haven, ambientCG, Kenney, Quaternius assets | CC0 (linked above) | Yes; Poly Haven site content and Kenney logo excluded |
| Khronos, three.js, Poly Pizza assets | Per file | Read each; store title, author and license with the URL |

## What is likely to change

| Item | State on 2026-11-04 | Why it moves | Re-check |
|---|---|---|---|
| USER_SCRIPT matrix, especially WASM and Workers | Undocumented; measured on Chrome 141 | Chrome can change it silently | Re-run probe on 156 first |
| `+esm` output and the regex linker | Works on r187 | Bundler output can change; pinned responses are immutable | On any version bump |
| Three version and looks | r187, monthly releases; PMREM reworked at r187 | [Code deprecated in r177 removed at r187](https://github.com/mrdoob/three.js/releases), so shims keep vanishing | Pin; read the guide before bumps |
| `three.cjs` stub | 631 bytes, says it will be removed | Stated in the file | Do not depend on it |
| Min builds on npm | Absent since r186; jsDelivr auto-minifies; no release note found | Unexplained | Check on bumps |
| `llms.txt` guidance | Import map, pinned 0.187.0 | Changes per release | Do not follow for USER_SCRIPT |
| WebGPU renderer and TSL | Experimental; renamed across r185 to r187 | Active work | Revisit when the manual stops calling it experimental |
| WebGPU and WebGL support, SwiftShader removal | 83.39% and 98.05%; M137 or M139 conflict | Fast-moving, disputed | Test current stable |
| ZeroGPU quotas, Space status | 2 min anonymous; 6 of 20 entries down | Highest risk here | Per use |
| Poly Haven bytes, Poly Pizza terms and paths, ambientCG hash | Mutable or undocumented | Observed drift | Prefer SHA pins |
| jsDelivr terms, GitHub raw limits | Terms effective October 2026; limits unpublished | Recent changes | Before shipping |
| Chrome Web Store policy on the User Scripts API | No statement on AI-generated code found | Policy pages undated | Before submission |
| Benchmarks and model scores | Preprints, new model names | Fast cycle | Do not hardcode |
| Scroll timeline support, `prefers-reduced-transparency`, `deviceMemory` | About 88%; non-Baseline; limited | Support grows | caniuse and MDN |

## Owner-facing issues raised by the notes

Items 1 to 4 should be settled before the playbook is finalised, as they determine what it may say. My reading of policy is not a legal or Chrome Web Store reviewer's opinion.

| # | Issue | Why it matters | Decision needed |
|---|---|---|---|
| 1 | **Agent-chosen CDN code and Web Store policy.** MV3 bans remote logic and `eval` of remote strings, excepting documented APIs for their stated purpose ([requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)); the User Scripts API is described as for user-supplied code ([guide](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)). | A jsDelivr URL or linker hardcoded in TamperSloth's prompts or playbooks means the extension, not the user, chose the code. No ruling or precedent was found. | Bundle, accept the risk, or ask One Stop Support |
| 2 | **Bundling versus the load-by-URL brief.** A Three IIFE in the package removes the policy question, the CDN, `eval` and the origin leak. | It is the cleanest design, but departs from the brief and adds package size; the real bundle is unbuilt. | Choose the medium-term target |
| 3 | **Inconsistent world CSP.** `browserService.ts:171` drops `'unsafe-inline'` on every `evaluate`, while `index.ts:84` sets it; agent runs share that world. | Inline injection depends on call order, so behaviour is intermittent. | Align them |
| 4 | **`'unsafe-inline'` is a page-CSP bypass into MAIN.** Inline scripts from USER_SCRIPT ran in MAIN on strict and Trusted Types pages [Tested]. | Possibly intended, but it should be conscious. | Keep or remove knowingly |
| 5 | **Do not widen the world CSP for `import()`.** It works, but also lets `<script src>` from jsDelivr run on strict pages, and jsDelivr serves arbitrary npm and GitHub content [Tested]. | Weakens every page. | Confirm as a rule |
| 6 | **Saved scripts default to MAIN** without a grant or `@inject-into content` (`userscript.ts:215-218`). | A grant-free 3D script gets the strict MAIN column and fails on strict pages. | Default or warn |
| 7 | **Privacy.** World `fetch` sends the current site's origin to the CDN [Tested on a local server]. | The disclosed data-use text should cover it ([policies](https://developer.chrome.com/docs/webstore/program-policies/policies)). | Update disclosure if CDN loading ships |
| 8 | **CSP reports to sites.** Addon `+esm` fetches logged a page refusal; a site with `report-to` would probably receive it (delivery untested). | Reveals script activity to the site. | Accept, or vendor |
| 9 | **Integrity.** `+esm` output cannot use SRI, by jsDelivr's own header note. | The CDN stays trusted. `@resource` pins bytes for saved scripts; a hash check before `new Function` is possible for agent runs. | Require a hash or not |
| 10 | **Silent failure.** ESM in `@require` produces no execution report, and syntax errors in `execute` return `null`. | Agents and users see nothing. | Add an install-time warning |
| 11 | **Host-page harm from contexts.** A script can evict the host's WebGL context [Tested]. | A page feature can break visibly because of TamperSloth. | Decide on a guard or rule |
| 12 | **`GM_xmlhttpRequest` sends credentials by default** (`userscriptBridge.ts:82`). | Asset or host-image fetches can carry cookies unless `anonymous: true`. | Confirm the default |
| 13 | **Third-party generation.** Hunyuan territory limits, unread output rights, no service guarantee, shared-IP quota competition, and user images reaching third parties. | Legal and trust exposure if offered. | Offer opt-in or omit |
| 14 | **Asset licensing and attribution.** No embedded licenses; CC-BY needs visible credit; Poly Haven's API credit and scraping terms; jsDelivr's media-hosting ban if mirroring. | Agent output can breach terms silently. | Set a default allow-list |
| 15 | **Shader license hygiene.** Shadertoy, LYGIA and Journey code must not be pasted into output, and a userscript distributed free is not automatically noncommercial. | Share-alike could reach a user's code. | Require citing source and license for adapted shaders |
| 16 | **Re-test debt.** Chrome 156, a real GPU, an integrated GPU, the real TamperSloth runtime and GM shim, Draco and KTX2, real pointer input, and screenshot capture of a canvas in a closed shadow root. | Most of the primary recommendation rests on a Chrome 141 software-GL probe. | Schedule before shipping |

## Conclusion

The main shift in understanding is that loading, not rendering, is the hard part. A userscript world turns a routine ES module import into something that needs a custom linker, and the platform's own guidance, including Three's advice to LLMs, points the wrong way. Most of the visual problem is the reverse of what one might expect: the expensive techniques that look like quality (screen-space AO, SMAA, HDRIs, showcase GLBs) rank near the bottom, while the top of the ranking is free configuration that LLMs get silently wrong. So the highest-value investment is a correct, version-pinned baseline and a verification step that checks both the scene graph and the pixels, not a larger library or a generation service.

The open decision is whether this capability sits on remote code at all. If the owner bundles Three, most of the fragile items above disappear at once: the linker, the origin leak, the CSP reports, the integrity gap and the policy question. What remains is the part that no packaging can settle, which is restraint: deciding that a page does not need 3D, and leaving it exactly as it was when anything goes wrong.
