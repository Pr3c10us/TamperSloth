# Web 3D beauty and interaction: techniques ranked by visual gain per KB and per ms (November 2026)

Scope: Three.js-style vanilla JS, WebGL renderer, no build step. Checked against three.js r187, the newest release ([releases](https://github.com/mrdoob/three.js/releases), published 30 Oct; the page shows no year, and the npm package 0.187.0 is what I read).

Evidence grades used on every section:
- **[A]** primary docs or source code read at r187.
- **[B]** published vendor or peer-reviewed measurement.
- **[C]** practitioner, forum, or single-report claim, or a search snippet I could not open.
- **[O]** my own measurement this session, on one device. Method is given below.
- **[J]** my judgment. Every "visual gain" score is [J]. No source measures perceived beauty.

## Lighting, rendering and post-processing: costs and ranking

### Takeaway
The biggest visual gains cost almost nothing: a correct color pipeline, a tone mapper, an environment map (RoomEnvironment is 1.2 KB gzipped), a DPR cap, default-framebuffer MSAA and a fake ground shadow. EffectComposer effects sit lower. Screen-space AO is by far the most expensive: three's GTAOPass cost about 20x the bloom pass alone on my test GPU. SMAA is the worst value per KB at 39 KB, because it embeds lookup textures. Use `NeutralToneMapping` for product and brand colors, `AgXToneMapping` for a soft filmic look, and ACES only when you want its contrast and accept hue shifts.

### Cited Findings

**Measured KB: three r187 (all [O])**

Sizes are jsDelivr's Terser `.min.js` output for `three@0.187.0`, compressed with `gzip -9`, per module. Numbers are transfer size, and modules compress separately.

| Module or stack | Gzipped KB |
|---|---|
| Core: `three.core.min.js` + `three.module.min.js` | 105.3 + 89.4 = 194.6 |
| Core, r185's shipped min files, for comparison | 100.9 + 86.6 = 187.5 |
| RoomEnvironment | 1.18 |
| HDRLoader | 1.79 |
| UltraHDRLoader | 2.62 |
| OrbitControls | 4.72 |
| GLTFLoader | 14.19 |
| Composer base: EffectComposer, RenderPass, ShaderPass, MaskPass, Pass, CopyShader | 4.42 |
| OutputPass + OutputShader | 1.73 |
| UnrealBloomPass + LuminosityHighPassShader | 3.24 |
| FXAAPass + FXAAShader | 2.40 |
| SSAOPass + SSAOShader + SimplexNoise | 6.10 |
| GTAOPass + GTAOShader + PoissonDenoiseShader + SimplexNoise | 8.25 |
| SMAAPass + SMAAShader | 38.79 |

- The SMAAPass module alone is 34.9 KB gzipped from only 48 KB minified. That low compression ratio suggests embedded texture data, which is an inference from the ratio. [O]
- Assets (Content-Length, [O]): a 1k Poly Haven `.hdr` is 1.62 MB and the 2k is 6.31 MB ([1k file](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr), [2k file](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/studio_small_09_2k.hdr)). The UltraHDR JPEG used by the official glTF example is 0.55 MB at 2k ([file](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/equirectangular/royal_esplanade_2k.hdr.jpg)). These are different scenes, so the sizes are indicative only.
- A three.js PR reports a full ESM build of about 338 KB minified and 79 KB gzipped for WebGL, and about 579 and 160 for WebGPU ([PR 31830](https://github.com/mrdoob/three.js/pull/31830)). This is a search snippet with units inferred, and it appears to be a different build configuration from my figures. [C]

**Version trap: minified builds are gone from npm since r186 [O]**
- The r187 tarball contains no `build/*.min.js`, while r185's does. `unpkg.com/three@0.186.0/build/three.module.min.js` and the 0.187.0 path both return 404; 0.185.0 returns 200.
- jsDelivr still serves `three.module.min.js` through auto-minification, but that file imports `./three.core.js`, the **unminified** core (1.47 MB raw, 290 KB gzipped). A naive no-build import of r187 therefore transfers about 379 KB gzipped, not 195 KB.
- In r185, by contrast, `three.module.min.js` imported `./three.core.min.js`.
- I found no release note explaining the removal. Treat this as likely to change.

**Measured ms: my benchmark [O]**

Method:
- `EXT_disjoint_timer_query_webgl2` TIME_ELAPSED around each frame, with three r187 in Chrome 152 on ANGLE D3D11 and an **NVIDIA RTX 4070 Laptop**.
- 3840x2160 canvas, 40 sampled frames per config, 4 passes.
- Scene: 73k triangles, 6 draw calls, one metal torus knot, 4 dielectric spheres and a floor, filling most of the frame.
- `powerPreference: 'low-power'` still returned the NVIDIA GPU, so **no integrated GPU was measured**.

Reliability:
- GPU clocks made the readings bimodal. The same config read 0.25 to 2.42 ms, and a 1080p run was too noisy to use.
- The table uses the **minimum per-pass median**, since clock changes only add time. Expect about +/-0.1 to 0.2 ms error.
- Rows that were stable across passes are marked "stable". Others are lower-confidence.

| Config | Min GPU ms at 4K | Delta from reference | ms per MP |
|---|---|---|---|
| Direct light only, no env | 0.15 | -0.10 | |
| Env only | 0.21 | -0.04 | |
| **Reference: env + direct light, no tone mapping** | 0.25 | 0 | 0.03 |
| ACES / AgX / Neutral | 0.36 / 0.41 / 0.35 | about +0.1 | |
| Baked blob plane | 0.33 | +0.08 | |
| Clearcoat (stable) | 0.31 | +0.06 | |
| Contact shadow, 512 target, per frame | 0.42 | +0.17 | |
| Basic shadow 1024 | 0.39 | +0.14 | |
| PCF shadow 1024 / 2048 | 0.47 / 0.50 | +0.22 / +0.25 | |
| VSM 1024, radius 4 | 0.47 | +0.22 | |
| Default-framebuffer MSAA | 0.47 | +0.22 | |
| Composer, Render + Output | 0.57 | +0.32 | 0.04 |
| Composer with `samples: 4` (fairly stable) | 2.18 | +1.93 | 0.23 |
| + FXAA (stable) | 0.76 | +0.19 over composer | 0.02 |
| + Bloom half-res | 0.88 | +0.31 over composer | 0.04 |
| + Bloom full | 1.03 | +0.46 over composer | 0.06 |
| + SMAA (stable) | 1.29 | +0.72 over composer | 0.09 |
| Transmission on one sphere (11 draw calls) | 1.79 | +1.54 | 0.19 |
| + SSAO, defaults (stable) | 4.34 | +3.77 over composer | 0.45 |
| + GTAO, defaults (stable) | 9.99 | +9.42 over composer | 1.14 |

- Fill scaling: the reference read 0.07 ms at 2.07 MP, 0.25 at 8.29 MP and 0.56 at 18.66 MP, about 0.03 ms per MP. Cost is close to linear in pixels. [O]
- First-frame wall time at 1080p, which is mostly shader compile, on ANGLE D3D11: baseline 20 to 96 ms; bloom 142 to 191; SSAO 127 to 170; SMAA 80 to 150; transmission 91 to 259; GTAO 165 to 427. PMREM from RoomEnvironment took 100 to 200 ms each time (456 ms once). Later runs may hit a program cache, so these are lower bounds. [O]

**Published measurements on weak GPUs [B]**
- Bloom on a phone: MediaTek Dimensity 8300 at 2712x1220, OpenGL ES, bloom stage only: Mipmap 2.97 ms, Kawase 4.25, Hybrid 6.67, Gaussian 7.17, Compute 14.40. Timing used `glFinish`, which the author says inflates absolute numbers. Single device; 40 HDR emissive objects ([Tarigan, ETASR 2026](https://etasr.com/index.php/ETASR/article/download/19101/6940)).
- That paper attributes the mobile cost mainly to render-target transitions rather than shader math, because each one forces tile contents out to main memory ([same paper](https://etasr.com/index.php/ETASR/article/download/19101/6940)).
- Blur filters on Mali-T760 MP8, 2015, a 97x97-equivalent blur. At 1080p: Gaussian 41.9 ms, Box 21.4, 5x5 Gaussian 23.5, Kawase 4.5, Dual 2.8. At 720p: 19.2, 9.9, 7.0, 2.8, 1.7. The notes also say the separable 5x5 setup's 16 render-target switches hurt directly ([Arm SIGGRAPH 2015 notes](https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_notes.pdf)).
- The same deck reports dual filtering needs 7% of the bandwidth of linear sampling, at PSNR 49.78 dB against Kawase's 50.02 dB ([same notes](https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_notes.pdf)).
- GTAO on an integrated GPU: Intel's XeGTAO High, full resolution, 3 slices, 6 samples: about 2.39 ms at 1080p on i7-1195G7 integrated graphics, 0.56 ms on RTX 2060, and 1.4 ms at 4K on RTX 3070. Vendor's own numbers; the repository is archived ([XeGTAO](https://github.com/GameTechDev/XeGTAO)).
- N8AO half-res AO gives a 2x to 4x speedup, with depth-aware upscaling costing a fixed cost of about 1 ms. No per-device benchmarks ([N8AO](https://github.com/N8python/n8ao)). [C]
- MSAA on tile GPUs: multisampled data stays in on-chip tile memory and resolves at tile write-out, so it needs no extra framebuffer storage or memory bandwidth ([Arm tile-based renderers](https://arm-software.github.io/magog/docs/03_mobile_gpus/03_tile_based_renderers/)). It is still not free: an Arm engineer says cost is content-dependent and fixed-function logic has not scaled as fast as shader cores ([Arm forum](https://community.arm.com/support-forums/f/graphics-gaming-and-vr-forum/56051/some-questions-about-msaa-on-mali-g77)).

**Asserted budgets, not measured [C]**
- Mobile budget of under 100 draw calls and 100,000 vertices (quoting Don McCurdy); pixel ratio cap of 2; shadow maps 512 to 1024 on mobile; half-resolution post can roughly double frame rate when fill-rate bound; about 3 dynamic lights at most. Article states it assumes r186 and reports no benchmarks of its own ([Utsubo, updated Sept 2026](https://www.utsubo.com/blog/threejs-best-practices-100-tips)).
- A forum user saw FPS fall with SSAO and even with an empty composer ([thread](https://discourse.threejs.org/t/composer-kills-performance/51680)). Anecdote.
- MDN notes a smaller back buffer is an easy way to trade quality for speed, and cautions against assuming render-to-float support ([MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). [A]
- pmndrs/postprocessing defaults to 8-bit buffers and recommends `HalfFloatType` for HDR-like work on desktop ([README](https://github.com/pmndrs/postprocessing)). It merges effects into fewer passes, which is the main performance argument for it. [A]

**Tone mapping [A, C]**
- Available in three since: AgX r160, Neutral r162 (checked in `src/constants.js` across releases). [O] Current constants are [in source](https://cdn.jsdelivr.net/npm/three@0.187.0/src/constants.js).
- Khronos PBR Neutral exists so base color survives into the final image. For inputs with all channels in [0.08, 0.8], output equals input minus 0.04, so hue and saturation are preserved. Compression starts at 0.76 and desaturation blends toward white above that ([Khronos spec](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md)).
- The guarantee assumes a shiny dielectric facing the camera under unit-white lighting. It does not hold under colored or strongly non-unit lighting ([same spec](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md)).
- Google's model-viewer now defaults to Neutral (ACES before v4.0) and says ACES has color-accuracy problems ([docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)). Its article reports users complaining of saturation loss with both ACES and AgX, with bright yellows, greens and blues unreachable ([model-viewer tone mapping](https://modelviewer.dev/examples/tone-mapping)).
- Practitioner summary: ACES adds contrast, darkens, and has a distinct look; AgX is flatter and neutral in intent; Neutral suits product visualizers and embedding 3D in a 2D page ([three.js forum overview, Dec 2024](https://discourse.threejs.org/t/tone-mapping-overview/75204)). [C]
- Sources conflict on AgX and Neutral. A Blender thread says AgX severely desaturates and also reports odd hue skews from Neutral on a Macbeth chart ([Blender PR](https://projects.blender.org/blender/blender/pulls/118936)). [C] The official three glTF example still uses ACES ([example](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_loader_gltf.html)), so "the official example does it" is not evidence for product use.

**Environment maps and PBR [A]**
- MeshStandardMaterial docs: "you should always specify an environment map when using this material" ([docs](https://threejs.org/docs/pages/MeshStandardMaterial.html)). Defaults are roughness 1 and metalness 0.
- `RoomEnvironment` takes no constructor arguments in r187 ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/environments/RoomEnvironment.js)); older snippets pass a renderer. It changed position in r183, so PMREM lighting looks different across that version ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).
- PMREM reflections improved in r181, blur changed to spiral in r186 and PMREMs moved to cube render targets in r187, with `CubeUVReflectionMapping` removed ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [releases](https://github.com/mrdoob/three.js/releases)). Expect looks to shift across upgrades, so pin a version.
- `RGBELoader` was renamed `HDRLoader` in r180 ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). `RGBELoader.js` does not exist in the r187 package. [O]

**Shadows [A, C]**
- Renderer default is `PCFShadowMap`, with `BasicShadowMap` and `VSMShadowMap` as the alternatives ([WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)).
- `PCFSoftShadowMap`: the migration guide says deprecated in r182 with `PCFShadowMap` now soft too; the constant's comment says deprecated since r186; at runtime r187 warns it has been removed and uses PCF ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [constants](https://cdn.jsdelivr.net/npm/three@0.187.0/src/constants.js), [module](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js)). The version numbers disagree but the action is clear: use `PCFShadowMap`.
- `VSMShadowMap`: all receivers also cast shadows ([constants](https://cdn.jsdelivr.net/npm/three@0.187.0/src/constants.js)). My VSM run took 14 draw calls versus 11 for PCF, because of the extra blur passes. [O]
- Contact shadows: the official example renders casters from below into a 512x512 target through a 0.3-tall ortho camera, then blurs horizontally and vertically ([example](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_shadow_contact.html)). It cannot self-shadow ([forum](https://discourse.threejs.org/t/shadow-contact-threejs/29505)). [C]
- AccumulativeShadows-style: drei's version accumulates over frames (default 40), with zero cost after accumulation finishes, on a single Y-up plane only, using randomized lights for raycast-like softness ([drei docs](https://raw.githubusercontent.com/pmndrs/drei/master/docs/staging/accumulative-shadows.mdx)). It is React-oriented, so a vanilla version means reimplementing it.
- model-viewer docs state softer shadows render faster and softness should not change every frame ([docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)).

**Post-processing [A, C]**
- `EffectComposer`'s default target is `new WebGLRenderTarget(w, h, { type: HalfFloatType })`, with no `samples` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/EffectComposer.js)). So renderer `antialias: true` does not help anything rendered inside the composer. Forum users report fixing aliasing by passing their own target with `samples: 4` and `HalfFloatType` ([thread](https://discourse.threejs.org/t/when-i-used-effectcomposer-i-found-that-the-edges-of-my-model-were-blurred/40972), [thread](https://discourse.threejs.org/t/the-sky-shader-becomes-a-lump-after-post-processing/73613)). [C]
- Inline tone mapping only applies when rendering to screen; for post-processing use `OutputPass`, which takes no constructor parameters and reads settings from the renderer (r155, [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).
- `SSAOPass` needs a prior `RenderPass` since r156; `HBAOPass` was replaced by `GTAOPass` in r160; `SMAAPass` takes no arguments in r187 ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/SMAAPass.js)).
- Conflict: pmndrs/postprocessing says leave `renderer.toneMapping` at `NoToneMapping` and add `ToneMappingEffect` last ([README](https://github.com/pmndrs/postprocessing)). Three's own `OutputPass` *reads* `renderer.toneMapping` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/OutputPass.js)). Both are right for their own library, and Utsubo's tip repeats the pmndrs rule without that qualifier ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)).
- `UnrealBloomPass` runs 5 mips, each with its own blur ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/UnrealBloomPass.js)).

**Ranking table**

KB and RTX ms columns are [O]. "Est. ms" is [J]: my ms per MP multiplied by 10 to 30 for a 1 MP canvas on an integrated GPU or mid-range phone. Basis for that factor:
- Tarigan's phone bloom (excluding the compute variant) works out at roughly 0.9 to 2.2 ms per MP, against my 0.06 to 0.09, so 10x to 35x, though inflated by `glFinish` and a different implementation.
- XeGTAO shows integrated graphics at 4.3x an RTX 2060 ([XeGTAO](https://github.com/GameTechDev/XeGTAO)), and I assume the RTX 4070 Laptop is 2x to 3x an RTX 2060.

Treat the factor as order-of-magnitude. It also understates render-target switches on tile GPUs, per the Arm and Tarigan findings above. Gain is a 1 to 10 score [J].

| Rank | Technique | KB | RTX ms delta at 4K | Est. ms at 1 MP weak GPU | Gain | Gain per KB | Gain per ms |
|---|---|---|---|---|---|---|---|
| 1 | Correct color pipeline (sRGB maps, no manual gamma) | 0 | 0 | 0 | 10 | Best | Best |
| 2 | Cap DPR (1.5 mobile, 2 desktop) | 0 | Negative | Saves up to 2x to 4x | Protects | Best | Best |
| 3 | Tone mapper | 0 | +0.1 | 0.1 to 0.4 | 8 | Best | Excellent |
| 4 | RoomEnvironment + PMREM | 1.2 | +0.1, plus 100 to 200 ms once | 0.1 to 0.4 | 10 | Excellent | Excellent |
| 5 | Material tuning (roughness, metalness, variation) | 0 | 0 | 0 | 7 | Best | Best |
| 6 | Baked or blob shadow plane | Under 0.5 own code | +0.08 | 0.1 to 0.3 | 7 | Excellent | Excellent |
| 7 | Default-framebuffer MSAA, no composer | 0 | +0.22 | 0.3 to 0.8 | 7 | Best | Very good |
| 8 | Contact shadow (static: render once) | About 1 to 2 own code | +0.17 per frame; 0 if static | 2 to 5 if per frame | 8 | Very good | Excellent if static |
| 9 | Clearcoat on glossy products | 0 | +0.06 | 0.1 to 0.2 | 5 | Best | Very good |
| 10 | PCF directional shadow, 1024 | 0 | +0.22 plus caster redraw | 2 to 7 | 6 | Best | Fair |
| 11 | VSM | 0 | +0.22 | 2 to 7 | 5 | Best | Fair |
| 12 | Accumulated soft shadow (static) | About 2 to 4 own code, unmeasured | Spread over frames, then 0 | Then 0 | 9 | Good | Excellent once settled |
| 13 | Composer + bloom (dark or emissive scenes) | 9.4 | +0.78 | 0.6 to 2 | 5 | Fair | Fair |
| 14 | Composer + FXAA, if no MSAA | 8.6 | +0.51 | 0.6 to 2 | 3 | Poor | Fair |
| 15 | Composer with `samples: 4` | 6.2 | +1.93 | 2 to 7 | 7 | Good | Fair |
| 16 | UltraHDR custom HDRI | 2.6 + about 550 asset | Same as env | Same | +1 over Room | Poor | Same |
| 17 | Transmission (glass only) | 0 | +1.54, plus a scene re-render | 2 to 6 | 8 for glass, else 0 | Good if needed | Poor |
| 18 | `.hdr` 1k HDRI | 1.8 + about 1,600 asset | Same as env | Same | +1 over Room | Very poor | Same |
| 19 | Composer + SMAA | 45 | +1.04 | 1 to 3 | 5 | Very poor | Fair |
| 20 | Composer + SSAO, defaults | 12.3 | +4.09 | 5 to 15 | 5 | Poor | Poor |
| 21 | Composer + GTAO, defaults | 14.4 | +9.74 | 11 to 34 | 7 | Poor | Worst |

**Minimal pattern** (the renderer and composer construction below ran without error in my benchmark; the exact combinations were not visually reviewed):

```js
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 768 ? 1.5 : 2));
renderer.toneMapping = THREE.NeutralToneMapping;      // AgX for soft/filmic, ACES for contrast
const pm = new THREE.PMREMGenerator(renderer);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;

// Only if you truly need post: keep MSAA by supplying the target
const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.4, 0.85));
composer.addPass(new OutputPass());   // tone mapping and sRGB happen here
```

### Inferences
- Default stack for a page-embedded 3D object: Neutral + RoomEnvironment + `antialias: true` + a static contact or blob shadow + capped DPR, no composer. That is about 1.2 KB beyond three plus your own code, and under 1 ms on weak GPUs (estimate). Adding any composer effect costs at least 6 KB and loses cheap default MSAA.
- Avoid SSAO and GTAO on mobile. On weak GPUs they alone can consume a 60 fps budget. A soft contact shadow plus a baked `aoMap` gets most of the "grounded" effect.
- Three's GTAOPass defaults are costly relative to XeGTAO: 1.14 ms per MP on an RTX 4070 Laptop versus 0.27 ms per MP on a slower RTX 2060. Implementation and settings differ, so this is a rough comparison, but it shows published "GTAO is cheap" numbers do not transfer to GTAOPass.
- `UnrealBloomPass`'s 5-mip separable chain implies many render-target switches, which the Arm and Tarigan findings identify as the main mobile cost. Half-res bloom only saved 0.15 ms on my GPU, but likely saves more on tile GPUs. A dual-filter bloom could be cheaper still on phones, though I did not test one.
- Bloom on light page backgrounds has low gain because there is little headroom to glow against. It suits dark pages and emissive objects. [J]
- Transmission and shadow costs scale with scene complexity, not just pixels. My 73k triangle scene understates them for heavy scenes.

### Gaps
- No published per-effect three.js timings on phones or integrated GPUs. My benchmark is one discrete GPU, with noisy clocks, a hidden pane and a simple scene. It should be rerun on real target devices, using a scene like yours. The harness is in the scratchpad at `C:\Users\owopr\AppData\Local\Temp\claude\4457f3e905c798b4\de7f4484-9fb8-4346-b08d-7dcca3aeaef3\scratchpad\bench\bench.html`.
- No reliable SMAA or FXAA millisecond figures from their authors: the [SMAA page](https://www.iryoku.com/smaa/) lists none, and I did not open its PDF.
- No measurement of PMREM time or compile stalls on mobile. D3D11 ANGLE compile times do not transfer.
- No measurement of a vanilla accumulated-shadow implementation. Its KB is my guess.
- I did not test the import map remap of `three.core.js` to `three.core.min.js` as a fix for the r186+ minified build problem. In principle a URL-keyed import map entry should do it. Untested.

## Settings that LLMs and beginners get wrong

### Takeaway
Most errors come from training data predating r152, r155 and r180 to r187, so snippets look plausible but use removed names or old light scales. Pin a version and check against the migration guide. Only some of these fail loudly: several silently produce a dull, dark or aliased image.

### Cited Findings
Unless noted, the version facts below come from the [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide). None of the sources measures how often LLMs make each mistake; "LLMs do this" is [J] throughout.

| Mistake | Correct at r187 | Since | Failure mode |
|---|---|---|---|
| Metal with no env map | `scene.environment` from PMREM; docs say always specify one ([docs](https://threejs.org/docs/pages/MeshStandardMaterial.html)) | Always | Metals look near black, silently |
| No tone mapping | Default is `NoToneMapping` ([docs](https://threejs.org/docs/pages/WebGLRenderer.html)); set one explicitly | Always | Highlights clip, silently |
| Color map left without colorSpace | `map.colorSpace = THREE.SRGBColorSpace`; data maps keep `NoColorSpace`; HDR already linear ([r152 notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791)) | r152 | Washed out, silently |
| `outputEncoding`, `texture.encoding`, `sRGBEncoding` | `outputColorSpace`, `colorSpace`, `SRGBColorSpace` ([r152 notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791)) | r152 | Old names are ignored |
| Manual `convertSRGBToLinear()` on hex | Remove it: hex and CSS colors convert automatically; `color.r = 0.5` is linear ([r152 notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791)) | r152 | Double conversion, silently |
| Old light intensities | No more PI factor: multiply ambient, hemisphere and directional by PI; point and spot need much higher values and use candela; decay 2 is physical ([r155 notes](https://discourse.threejs.org/t/updates-to-lighting-in-three-js-r155/53733)) | r155 | Too dark, silently |
| `useLegacyLights`, `physicallyCorrectLights` | Remove them: default flipped in r155 and the property was deprecated | r155 | Ignored |
| `antialias: true` with EffectComposer | Pass a target with `samples` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/EffectComposer.js)) | Current | Jagged edges, silently |
| No `OutputPass`, or `GammaCorrectionShader` | End the chain with `OutputPass` | r155 for no-args form | Dark, no tone mapping |
| `new OutputPass(ACESFilmicToneMapping, 1)` | No args; read from renderer | r155 | Args ignored |
| `RGBELoader` | `HDRLoader` | r180 | Import 404 |
| `PCFSoftShadowMap` | `PCFShadowMap` | r182 to r186 | Runtime warning, falls back |
| `THREE.Clock` | `THREE.Timer`: call `timer.update()` then `getDelta()`; `timer.connect(document)` for Page Visibility | Deprecated r183 | Deprecated |
| `build/three.min.js`, `three.js` globals | ES modules with an import map | Removed r161 | 404 |
| `three.module.min.js` from unpkg at r186+ | jsDelivr or pin r185; see cost note above [O] | r186 | 404 |
| Uncapped `setPixelRatio(devicePixelRatio)` | Cap it. DPR 3 means 9x pixels ([Utsubo](https://www.utsubo.com/blog/threejs-best-practices-100-tips)). The official example does this uncapped too ([example](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/webgl_loader_gltf.html)) | Current | Slow phones |
| `new SMAAPass(w, h)`, `HBAOPass` | `new SMAAPass()`; `GTAOPass` | r160 for HBAO | Varies |
| `controls.enableDamping` without per-frame `update()` | Call `controls.update()` every frame ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js)) | Current | Motion dies, silently |
| `pos.lerp(target, 0.1)` per frame | `1 - Math.exp(-lambda * dt)`; see next section | Always | Speed varies with refresh rate |
| `new THREE.Color(getComputedStyle(el).color)` | Normalize first; see design section [O] | Current | Wrong color, with a warning only |
| `renderer.toneMapping = NoToneMapping` with three's `OutputPass` | That advice is for pmndrs/postprocessing ([README](https://github.com/pmndrs/postprocessing)) | Current | No tone mapping |

- Custom shaders are a further trap: since r152, `ShaderMaterial` needs tone-mapping and color-space chunks after writing `gl_FragColor` ([r152 notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791)).
- Forum reports show the same class of confusion in the wild: a user matched colors only after setting both color management and tone mapping ([thread](https://discourse.threejs.org/t/is-it-possible-to-match-the-colors-perfectly/49894)). [C]
- Newer churn, likely to catch future LLMs: `ColorManagement.fromWorkingColorSpace` renamed `workingToColorSpace` in r177; `Source` renamed `TextureSource` in r186; `Matrix3.scale`, `rotate` and `translate` deprecated in r185 ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [releases](https://github.com/mrdoob/three.js/releases)). Code deprecated in r177 was removed in r187.

### Inferences
- Since most failures are silent, a generated-code checklist should verify explicitly: env map set, tone mapping set, `map.colorSpace` set, composer target has samples if a composer exists, DPR capped, and damping uses `dt`.
- Light values copied from pre-r155 code tend to look dark. The fix is usually the env map first, not a brighter light. [J]

### Gaps
- No empirical study of which three.js errors LLMs make most. The list is derived from API churn and forum reports.
- I read the guide's content through a summarizing fetch and covered 100,000 of 114,017 characters, so older entries near the end were not all checked. All r150+ items appeared within the part read.

## Interaction patterns

### Takeaway
Keep the page in charge of scrolling: disable OrbitControls zoom so the wheel scrolls the page, use `pan-y` for touch, and limit orbit to horizontal drag in embedded views. Drive scroll, parallax and tilt from target values smoothed with frame-rate-independent damping (`1 - exp(-lambda * dt)`), and pause rendering when offscreen. Use a raycast for click-to-explore, with a drag threshold so orbit does not trigger clicks.

### Cited Findings

**OrbitControls at r187 [A]** ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js))
- Defaults: `enableDamping` false, `dampingFactor` 0.05, `enableZoom` true, `enablePan` true, `autoRotate` false, one finger rotates, two fingers dolly and pan.
- `connect()` sets `domElement.style.touchAction = 'none'`, which blocks page scroll on touch. Listens to `pointercancel` and uses pointer capture.
- The wheel listener is `{ passive: false }` and calls `preventDefault()`, but returns early when zoom is disabled. So `enableZoom = false` gives wheel scrolling back to the page.
- Damping is per `update()` call, not time-based: `theta += delta * dampingFactor`, then `delta *= 1 - dampingFactor`. `update(deltaTime)` uses `deltaTime` only for auto-rotation, so damping varies with refresh rate.
- Forum threads confirm the scroll-blocking problem; suggestions include toggling `controls.enabled` during gestures, and the question of one-finger page scroll was left unresolved ([thread](https://discourse.threejs.org/t/orbitalcontrols-on-mobile-devices/58430), [thread](https://discourse.threejs.org/t/one-finger-panning-on-touch-devices-orbitcontrols/17551)). [C]

**Precedent: model-viewer [A]** ([docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json))
- Default `touch-action` behavior is `pan-y`: vertical swipes scroll, horizontal-start gestures interact.
- It implements that itself because the CSS property "does not work due to some iOS bugs" (its wording). That is a real risk for a plain CSS approach.
- `disable-zoom` stops swallowing wheel and pinch so those scroll and zoom the page.
- Interaction prompt after 3,000 ms idle; `interpolation-decay` 50 ms.

**touch-action [A]** ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action))
- `pan-y` enables single-finger vertical panning and leaves horizontal to the app.
- The browser sends `pointercancel` when it takes over a gesture. Changing the value after a gesture starts has no effect, and the browser intersects values from the element and its ancestors.

**Damping math [A, C]**
- A per-frame `lerp(a, b, k)` removes a fixed fraction per frame, so it settles faster at 120 fps than at 30. The fix is `lerp(a, b, 1 - exp(-lambda * dt))`, or with `r` as the fraction remaining after a second, `1 - r^dt` ([Rory Driscoll](https://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/)).
- Three ships this as `MathUtils.damp(x, y, lambda, dt)`, whose body is `lerp(x, y, 1 - Math.exp(-lambda * dt))` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.js)).
- `Timer` replaces `Clock` and needs `timer.update()` once per frame ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.core.js)).

**Scroll-linked animation [C]**
- Three.js Journey's lesson uses `alpha: true` with the clear color left transparent and the background set on the page, avoiding a mismatched overscroll color ([lesson](https://threejs-journey.com/lessons/scroll-based-animation)). Its later parallax and easing sections are members-only, so I could not read them.
- Codrops' scroll tutorials use GSAP ScrollTrigger; one notes no render loop is needed when only GSAP animates a static scene ([article](https://tympanus.net/codrops/?p=66174), [2025 article](https://tympanus.net/codrops/2025/11/19/how-to-build-cinematic-3d-scroll-experiences-with-gsap/)). Search snippets only, since direct fetch returned 403.
- `prefers-reduced-motion: reduce` signals a request to minimize non-essential motion ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).

**Raycasting [A]** ([Raycaster docs](https://threejs.org/docs/pages/Raycaster.html))
- `setFromCamera` needs normalized device coordinates in [-1, 1]; `intersectObjects` is recursive by default and returns closest first; `layers` can exclude objects.

**Patterns** (mine, not run in a browser except where noted; adapted from the sources above):

```js
// Embedded orbit that respects page scroll
const c = new OrbitControls(camera, renderer.domElement);
c.enableDamping = true;
c.enableZoom = false;                         // wheel scrolls the page
c.enablePan = false;
c.minPolarAngle = c.maxPolarAngle = Math.PI / 2.4;  // horizontal only
renderer.domElement.style.touchAction = 'pan-y';    // set AFTER construction; connect() set 'none'
// Test on iOS: model-viewer reports CSS touch-action bugs there.

// Loop: time-based damping everywhere
const timer = new THREE.Timer(); timer.connect(document);
const damp = THREE.MathUtils.damp;
const target = { px: 0, py: 0, scroll: 0 }, cur = { px: 0, py: 0, scroll: 0 };

addEventListener('pointermove', e => {
  target.px = e.clientX / innerWidth * 2 - 1;
  target.py = e.clientY / innerHeight * 2 - 1;
}, { passive: true });

const sect = document.querySelector('#hero');
addEventListener('scroll', () => {
  const r = sect.getBoundingClientRect();
  target.scroll = THREE.MathUtils.clamp(-r.top / (r.height - innerHeight), 0, 1);
}, { passive: true });

let visible = true;
new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(renderer.domElement);
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

renderer.setAnimationLoop(t => {
  if (!visible) return;
  timer.update(t);
  const dt = Math.min(timer.getDelta(), 0.1);           // clamp tab-switch spikes
  const k = still ? 1000 : 6;
  cur.px = damp(cur.px, target.px, k, dt);
  cur.py = damp(cur.py, target.py, k, dt);
  cur.scroll = damp(cur.scroll, target.scroll, k, dt);
  rig.rotation.y = cur.px * 0.15;                       // parallax on a parent group
  rig.rotation.x = cur.py * 0.08;                       // not on the camera that orbit owns
  hero.rotation.y = cur.scroll * Math.PI;
  c.dampingFactor = 1 - Math.exp(-3 * dt);              // time-based orbit damping
  c.update();
  renderer.render(scene, camera);
});

// Click to explore: raycast, ignore drags, tween camera and target together
let down = null;
const el = renderer.domElement, ray = new THREE.Raycaster();
el.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
el.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
  const b = el.getBoundingClientRect();                  // the canvas rect, not window
  ray.setFromCamera(new THREE.Vector2(
    (e.clientX - b.left) / b.width * 2 - 1,
    -(e.clientY - b.top) / b.height * 2 + 1), camera);
  const hit = ray.intersectObjects(pickables)[0];
  if (hit) goTo(hit.point);   // each frame: damp camera.position and c.target toward goals
});
```

**Common errors**
- NDC from `innerWidth` on a canvas that is not full-window: picks the wrong object. Docs require NDC, and a non-fullscreen canvas needs its own rect. [A, J]
- Touching `camera.position` while OrbitControls owns it: it gets overwritten at the next `update()`. Animate a parent `rig` or move `controls.target` as well. [J]
- `wheel` listeners for scroll animation instead of reading actual scroll position: breaks keyboard, scrollbar and touch scrolling. [J]
- Setting `touchAction` before creating controls: `connect()` overwrites it ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/controls/OrbitControls.js)).
- Raycasting on every `pointermove` against dense meshes: throttle to one per frame, or test simplified proxy meshes. [J]
- Rendering continuously for a static model: render on demand, as Codrops notes above. Note that damping needs frames until it settles. [J]

### Inferences
- Setting `c.dampingFactor` from `dt` each frame should make orbit inertia frame-rate independent, because the source reads the factor on each `update()`. Untested.
- A `lambda` around 4 to 8 feels responsive for parallax and scroll; 2 to 4 feels floaty. Those ranges are my judgment. model-viewer's 50 ms decay implies a much snappier response.
- On pointer-free devices, parallax has no input. Use small idle motion or skip it rather than gyroscope, which needs permission on iOS and was implicated in one vanilla-tilt bug report ([issue](https://www.github.com/micku7zu/vanilla-tilt.js/issues/72)). [J, C]

### Gaps
- I could not read Codrops articles directly (403) or Three.js Journey's members-only parallax section. Those patterns are mine, not theirs.
- No published measurement of how much `pan-y` reduces gesture conflicts, and iOS behavior with OrbitControls was not tested.
- `three` has no built-in camera tween. Sources for "best" easing are opinion only.

## Matching 3D to the page's design

### Takeaway
Read colors from computed CSS, but normalize them through a 2D canvas first, because `THREE.Color` cannot parse modern CSS color formats. Use Neutral tone mapping when brand colors must match, `alpha: true` with no `scene.background` so the page shows through, and a long-ish lens with real ground contact. The mapping from typography mood to material is judgment with no solid source.

### Cited Findings

**Palette from CSS [O, A]**
- `THREE.Color.setStyle` handles only hex, named, `rgb()` and `hsl()` forms ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/src/math/Color.js)).
- Tested in Chrome 152 with r187: computed style returns `oklch(0.7 0.15 150)`, `lab(50 40 30)`, `color(display-p3 1 0 0)` and `color(srgb 0.5 0 0.5)` (from `color-mix`) unconverted. `setStyle` warns `Unknown color model` and **leaves the old color in place**. Legacy forms arrive as `rgb(...)` and parse correctly. Alpha is ignored, with a warning. [O]
- A 1x1 canvas `fillRect` followed by `getImageData` produced correct sRGB bytes for all of these in the same test (for example `oklch(0.7 0.15 150)` gave 76, 184, 106). `display-p3` red clipped to 255, 0, 0. Reading `fillStyle` back does **not** normalize, since it returned the original string. [O]
- Hex and CSS colors are treated as sRGB and converted to linear working space automatically ([r152 notes](https://discourse.threejs.org/t/updates-to-color-management-in-three-js-r152/50791)).

```js
function cssToThree(value) {                 // tested logic: canvas readback; wrapper not run as-is
  const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  g.canvas.width = g.canvas.height = 1;
  g.fillStyle = value; g.fillRect(0, 0, 1, 1);
  const [r, gg, b] = g.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, gg / 255, b / 255, THREE.SRGBColorSpace);
}
const cs = getComputedStyle(document.documentElement);
const accent = cssToThree(cs.getPropertyValue('--accent').trim() || getComputedStyle(btn).backgroundColor);
```

**Color fidelity [A, C]**
- Under Neutral, base colors track input closely within [0.08, 0.8] under grayscale unit lighting ([Khronos](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md)); Khronos pitches it for faithful base color, hue and saturation ([press release](https://khronos.org/news/press/khronos-pbr-neutral-tone-mapper-released-for-true-to-life-color-rendering-of-3d-products)).
- A forum user matched colors exactly only after disabling tone mapping on the mesh and setting color management ([thread](https://discourse.threejs.org/t/is-it-possible-to-match-the-colors-perfectly/49894)). [C]
- For a mark that must be exact, `MeshBasicMaterial` with `toneMapped: false` bypasses both lighting and tone mapping; `material.toneMapped` is checked by the renderer ([module source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js)). Exact match is my inference from that.

**Transparent canvas and premultiplied alpha [A, C]**
- `alpha` defaults false; when true the clear alpha starts at 0. `premultipliedAlpha` defaults true ([WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html)).
- Three.js Journey recommends a transparent clear plus page background ([lesson](https://threejs-journey.com/lessons/scroll-based-animation)). Setting a scene background removes transparency ([thread](https://discourse.threejs.org/t/ssaa-postprocessing-affects-contrast/55089)). [C]
- Scene background `Color` is reported as not tone mapped when rendered inline, so it can match CSS ([thread](https://discourse.threejs.org/t/reflector-and-scene-background-color/56452)). Tone mapping in post, however, changes the whole viewport including background ([thread](https://discourse.threejs.org/t/tone-mapping-and-post-processing/68292)). [C]
- Custom shaders must honor premultiplication; three's built-in materials include a `premultiplied_alpha_fragment` chunk ([module source](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js)).
- `OutputShader` applies tone mapping and sRGB OETF to the RGB of the composer's texture, leaving alpha unchanged ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/shaders/OutputShader.js)).
- **Version-sensitive conflict:** older threads say `UnrealBloomPass` does not support transparent backgrounds, because of alpha forced to 1.0 ([forum 2022](https://discourse.threejs.org/t/unrealbloompass-makes-background-black/38994), [issue 14104](https://github.com/mrdoob/three.js/issues/14104)). r187's source differs: it outputs `bloomAlpha = max(r, g, b)` and its blend material sets `premultipliedAlpha: true` ([source](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/postprocessing/UnrealBloomPass.js)). I did not visually verify the result, and [PR 26185](https://github.com/mrdoob/three.js/pull/26185) shows maintainers treated this cautiously. Do not trust old answers either way, so test on your background.
- WebGPU's premultiplied handling changed in r185, and blending issues may need an opaque background ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). This is WebGPU-only but relevant if switching.
- Per MDN, `alpha: false` composites the canvas as opaque, and most apps can be arranged to produce alpha 1.0 ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).

**Composition and camera [A, C]**
- model-viewer's default `field-of-view` is "auto", which sets either vertical or horizontal FOV to 45 degrees depending on model and canvas aspect; its `camera-orbit` percent radius uses 100% as tight framing from every angle ([docs data](https://raw.githubusercontent.com/google/model-viewer/master/packages/modelviewer.dev/data/docs.json)).
- A bounding sphere has a constant-size silhouette from any angle, unlike a box ([forum](https://discourse.threejs.org/t/how-can-i-place-camera-to-show-all-objects/35226)), making it the safe fit for an orbitable object. Fitting from vertical and horizontal FOV separately handles narrow canvases ([snippet](https://git.xythobuz.de/thomas/drumkit/src/commit/97548534938b9e0a230a7534a80a4d1bc87c5e6a/docs/src/js/3d.js)). [C]
- Baked or contact shadows address the "floating" look; baked shadows are integrated into a texture mapped on the material ([forum](https://discourse.threejs.org/t/how-can-i-bake-a-shadow-onto-a-planegeometry/40887)). [C]

```js
// Fit a bounding sphere in both axes
const s = new THREE.Box3().setFromObject(obj).getBoundingSphere(new THREE.Sphere());
const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
const hf = Math.atan(Math.tan(vf) * camera.aspect);
const d = s.radius / Math.sin(Math.min(vf, hf)) * 1.1;
camera.position.copy(s.center).add(new THREE.Vector3(0.5, 0.35, 1).normalize().multiplyScalar(d));
camera.lookAt(s.center);
```

**Mood mapping (all [J], no source found)**

| Page mood | Material | Lighting and tone | Camera |
|---|---|---|---|
| Geometric sans, lots of white, SaaS | Matte or satin plastic, roughness 0.4 to 0.6, accent from CSS | Neutral, soft RoomEnvironment, faint contact shadow | FOV 25 to 35, slight three-quarter |
| Serif, editorial, luxury | Polished metal or ceramic, roughness 0.1 to 0.3, sparse color | AgX or Neutral, one strong key | FOV 20 to 30, low angle |
| Mono, terminal, dark, technical | Dark metal, thin emissive accents | ACES or AgX, bloom justified here | FOV 35 to 50 |
| Rounded, playful | Soft clay, roughness 0.6 to 0.9, clearcoat optional, saturated colors | Neutral to keep saturation, soft broad shadow | FOV 30 to 40, bouncy spring |
| Brutalist, flat | Unlit or toon material, hard edges | No tone mapping; MeshBasic or Toon | Orthographic or very low FOV |

### Inferences
- Under a composer on a transparent canvas, expect brighter edges. `OutputShader` encodes premultiplied RGB (linear color times coverage), and a browser expects sRGB color times coverage, so semi-covered MSAA edges get a lifted value. Inline rendering avoids this, since materials encode before blending. Derived from source, not visually tested. This is one more reason to skip the composer for embedded objects, or to use an opaque background matching a solid page color.
- `getComputedStyle` of a transparent element returns zero alpha, so walk up the ancestors to find the effective page background before picking contrast or ground color. [J]
- Pick dark or light scene treatment from page background luminance so shadow and glow make sense; shadows vanish on black, and bloom vanishes on white. [J]
- Watch `prefers-color-scheme` and re-read tokens on change, updating material colors rather than rebuilding. [J]
- Low FOV flattens perspective and reads as product photography. No citation found for specific values; model-viewer's 45 degree default is the only sourced number, and it is wider than the range I recommend for hero objects. [J]

### Gaps
- No credible source links typography mood to 3D material, or studies perception of embedded 3D and page harmony. The table is my judgment, and should be read as a starting point.
- Canvas readback is 8-bit sRGB. Wide-gamut brand colors clip, and I did not test a display-p3 output path.
- Browsers other than Chrome 152 were not tested for computed-style serialization.
- Transparent-canvas edge artifacts were analyzed from source but not captured visually.

## CSS 3D and canvas 2D alternatives

### Takeaway
Use CSS transforms for flat cards, tilt, parallax layers and simple flips: no library, compositor-accelerated and crisp text. Three costs about 195 KB gzipped before any scene work, or more than 379 KB if imported naively at r187. Choose WebGL only when you need real lighting, reflections, meshes, arbitrary geometry or many objects. Use canvas 2D for particles, charts and pixel effects without depth.

### Cited Findings
- Only `transform` and `opacity` can be handled by the compositor alone. Layers cost memory and texture upload, so do not promote elements unnecessarily, and `will-change: transform` or `translateZ(0)` creates a layer ([web.dev](https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count)). [A]
- Scroll-driven CSS (`animation-timeline: scroll()`): Chrome and Edge 115+, Firefox 159+, Safari 26+; about 88% global support ([caniuse](https://caniuse.com/mdn-css_properties_animation-timeline_scroll)). [A] This allows scroll-linked transforms without JS on modern browsers, and is version-specific, so it is likely to grow.
- `vanilla-tilt` is about 8.5 KB minified, with no dependencies, per a fork's listing ([repo](https://github.com/abdurasul18/vanilla-tilt.js)). Reported stutter and post-leave updates were traced to its gyroscope path ([issue](https://www.github.com/micku7zu/vanilla-tilt.js/issues/72)). Single user report. [C]
- A pure-CSS tilt with invisible hover zones avoids JS, but snaps between fixed angles rather than tracking the pointer ([tutorial](https://alvarotrigo.com/fullPage/tilt-effect/)). [C]
- No benchmark comparing CSS tilt with WebGL tilt was found. "CSS tilt is performant" claims come with no numbers ([same tutorial](https://alvarotrigo.com/fullPage/tilt-effect/)). [C]
- WebGL now also has an in-scene HTML path: r184 added `HTMLTexture`, and it is exported at r187 ([releases](https://github.com/mrdoob/three.js/releases), [module](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js)). I did not evaluate its support or cost.

**Minimal hover tilt (about 400 bytes, mine, not run):**

```js
document.querySelectorAll('.card').forEach(el => {
  let raf = 0, x = 0, y = 0;
  el.addEventListener('pointermove', e => {
    const b = el.getBoundingClientRect();
    x = (e.clientX - b.left) / b.width - 0.5;
    y = (e.clientY - b.top) / b.height - 0.5;
    raf ||= requestAnimationFrame(() => {
      raf = 0;
      el.style.transform = `perspective(800px) rotateX(${-y * 10}deg) rotateY(${x * 10}deg)`;
    });
  });
  el.addEventListener('pointerleave', () => { el.style.transform = ''; });
});
// CSS: .card { transition: transform .15s ease-out; }
// @media (prefers-reduced-motion: reduce) { .card { transition: none; transform: none !important; } }
```

**Decision guide [J]**

| Need | Use | Why |
|---|---|---|
| Card tilt, flip, depth layers, parallax of DOM | CSS 3D | 0 KB, sharp text, selectable and accessible, compositor-run |
| Scroll-linked DOM motion | CSS scroll timeline, JS fallback | No main-thread loop where supported |
| Particles, noise, charts, 2D sprites | Canvas 2D | No shader pipeline; simple |
| Thousands of particles or shader effects | Raw WebGL or small lib | Canvas 2D fill cost grows; 195 KB of three may be excessive |
| Specular highlight on a flat card | CSS gradient following pointer | Fakes the look for free |
| Real reflections, PBR metals, meshes, shadows | WebGL + three | CSS cannot shade |
| Many objects sorted in depth, intersections | WebGL | CSS has no depth buffer across non-plane intersections |
| Multiple 3D widgets on a page | One shared WebGL context, or CSS | Each canvas pays its own context and memory |

### Inferences
- If the visual is a flat object with lighting cues only (a card, poster or badge), CSS with a moving gradient likely beats WebGL on gain per KB and per ms, since cost stays near zero.
- CSS tilt keeps DOM text accessible and selectable, an advantage WebGL text does not offer. [J]
- A 3D look without runtime 3D is also an option: pre-render to a sprite sheet, video or image sequence. This trades asset KB for near-zero GPU cost. [J]

### Gaps
- No direct measurements of CSS 3D versus WebGL for equivalent effects, in frame time or memory.
- `HTMLTexture`, CSS scroll timelines in iframes, and interactions with user-page CSS were not tested.
