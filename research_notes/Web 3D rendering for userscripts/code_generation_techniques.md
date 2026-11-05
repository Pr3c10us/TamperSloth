# Code-generated 3D for an AI agent: techniques, image and description workflows, styles, and reusable sources (as of 4 November 2026)

Evidence grades used below:
- **[Measured]**: numbers from a benchmark or experiment. Unless noted, these are author-reported preprints, not independently replicated.
- **[Structured]**: a structured comparison with no controlled metric.
- **[Anecdote]**: one practitioner's or forum user's report.
- **[Vendor/author]**: a project describing its own work.
- **[Docs]**: official API docs or source code, reliable for how the API behaves but not for visual quality.

How these notes were read: paper numbers came through a summarising fetch tool, not a hand check of each table, so spot-check any figure before quoting it publicly. Model names are as the papers give them. Nothing here was run, and the snippets are illustrative and untested.

## Q1. For each technique, what is it good for, how far can quality go, and how do LLMs fail?

### Takeaway
No benchmark found compares these techniques against each other, so every quality ceiling below is judgement, not measurement. The measured evidence is about Three.js output in general. Code usually runs (validity near 1.0 in one benchmark), but geometric accuracy, required content and behaviour fall well short. The most reliable default is composed primitives with bevels and extrusion, plus environment lighting and one committed style.

### Cited Findings

**Whole-task evidence on Three.js code**
- [Measured] P3D-Bench, Image-to-3D: GPT-5.5 reached validity 1.000 on Three.js, but topology 0.828 against 1.000 on OpenSCAD. The authors attribute this to triangulated meshes that are not guaranteed watertight and do not give clean per-part solids. — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] WorldBench, one fixed voxel-island prompt scored out of 280, one world per model, no repeat runs: Claude Fable 5.1 210.79, GPT-6 Astra 199.73, Kimi K3 191.36, Grok 4.7 187.78, Gemini 3.1 Pro 149.00. The authors treat gaps of a few points as ties. — [WorldBench](https://arxiv.org/html/2610.10622v1)
- [Measured] WorldBench's error analysis of 378.3 lost points on two tests: 48.0% unimplemented features, 32.4% code present but never seen in a capture, 8.9% seen but no verified code quote, 3.9% property violations, 6.7% penalties and gates. Jungle and swamp were among the hardest biomes and grassland the easiest. — [WorldBench](https://arxiv.org/html/2610.10622v1)
- [Measured] WorldCoder-Bench, 205 core tasks, nine models: the best verification coverage was 27.8% (GPT-5.4) and the lowest 16.5%. Rendering tasks scored highest of three categories (22.2-37.8%). — [WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)
- [Measured] WorldCoder-Bench failure causes: state schema drift (42.8%) and broken interaction chains (40.8%) make up 83.6% of zero-transition failures. Its example task also shows a missing global state reference, sandbox-breaking external asset loading, and frame-rate-dependent physics. — [WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)

**Stale API knowledge, a documented risk**
- [Docs] Three.js publishes guidance aimed at LLMs. It warns against old classic script tags pinned to r128, and recommends an import map with `three` and `three/addons/`. Its example pins 0.187.0 while also saying to use the latest version. This will change with each release. — [three.js llms.txt](https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/llms.txt)
- [Docs] `SVGLoader.createShapes` has been deprecated since r185 and now warns and returns `shapePath.toShapes()`. — [SVGLoader source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/loaders/SVGLoader.js)
- [Docs] `iridescenceThicknessRange` has been deprecated since r187, replaced by minimum and maximum properties. — [MeshPhysicalMaterial docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- [Vendor/author] CloudAI-X/threejs-skills pairs outdated patterns with r186 fixes and says it checked import paths and classes against `three@0.186.1`. The page shows no CI or test results, so this is unconfirmed. — [threejs-skills](https://github.com/CloudAI-X/threejs-skills)

**API facts by technique [Docs]**
- Extrusion: `ExtrudeGeometry` defaults to `bevelEnabled: true`, `bevelThickness` 0.2, `bevelSegments` 3, `curveSegments` 12, `steps` 1. Bevels are not supported when extruding along `extrudePath`. — [ExtrudeGeometry docs](https://threejs.org/docs/pages/ExtrudeGeometry.html)
- SVG: `SVGLoader.parse(text)` takes a string and needs `DOMParser`, so a browser-like environment. It supports `path`, `rect`, `polygon`, `polyline`, `circle`, `ellipse`, `line`, `use`, transforms, and fill gradients. Filters and gradient strokes are not supported, and rounded rectangle corners are approximated with Beziers. — [SVGLoader source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/loaders/SVGLoader.js)
- Rounded boxes: `RoundedBoxGeometry(width, height, depth, segments = 2, radius = 0.1)` clamps the radius to half the smallest dimension. — [RoundedBoxGeometry source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/geometries/RoundedBoxGeometry.js)
- Instancing: `InstancedMesh` shares geometry and material across per-instance transforms to reduce draw calls. You must set `instanceMatrix.needsUpdate` after `setMatrixAt` and `instanceColor.needsUpdate` after `setColorAt`. The bounding sphere may need recomputing after instances move. — [InstancedMesh docs](https://threejs.org/docs/pages/InstancedMesh.html)
- Normals and welding: `toCreasedNormals` keeps smooth normals except where faces meet beyond a crease angle (default 60 degrees). `mergeVertices` welds vertices whose attributes match within a tolerance (default 1e-4). — [BufferGeometryUtils source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/utils/BufferGeometryUtils.js)
- Subdivision: three-subdivide (MIT) offers `LoopSubdivision.modify(geometry, iterations, params)`, with iterations typically 1-5. It converts to non-indexed geometry and can tear flat geometry UVs without `uvSmooth`, and results are not always uniform. — [three-subdivide](https://github.com/stevinz/three-subdivide)
- Shaders: Three.js says WebGLRenderer is the default and most compatible, and advises TSL with WebGPURenderer for custom materials, compute and node materials. WebGPURenderer needs `await renderer.init()`. — [three.js llms.txt](https://raw.githubusercontent.com/mrdoob/three.js/dev/docs/llms.txt)
- TSL: a JavaScript node-based shader abstraction that can output WGSL or GLSL, replacing `onBeforeCompile` string patching. The wiki gives no stability label and no full limitations list, and some features are WebGPU-oriented. — [TSL wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- Text: `TextGeometry` is an addon needing a typeface.json font through `FontLoader`. Its defaults are large (`size` 100, `depth` 50). — [TextGeometry docs](https://threejs.org/docs/pages/TextGeometry.html)
- Text alternative: troika-three-text builds SDF glyphs on the fly from .ttf, .otf or .woff (not .woff2). By default it fetches Roboto from Google Fonts and fallback fonts from jsDelivr. A restrictive CSP can block its worker, and `configureTextBuilder({useWorker: false})` is the documented workaround. Sync is asynchronous. — [troika-three-text README](https://raw.githubusercontent.com/protectwise/troika/main/packages/troika-three-text/README.md)
- SDF: Inigo Quilez's site states that code implementing an algorithm is MIT, while code implementing an artwork is copyrighted (read through a search result; direct fetch failed). — [iquilezles.org](https://iquilezles.org/)
- Official example names, useful as study targets. Marching cubes: `webgl_marchingcubes`. Instancing: `webgl_instancing_scatter`, `webgl_instancing_performance`. Points: `webgl_points_waves`, `webgl_custom_attributes_points`. Extrusion: `webgl_geometry_extrude_shapes`, `webgl_geometry_extrude_splines`. SVG: `webgl_loader_svg`. Subdivision: `webgl_modifier_subdivision`. Text: `webgl_geometry_text`, `webgl_geometry_text_shapes`. TSL: `webgpu_tsl_procedural_terrain`, `webgpu_tsl_wood`, `webgpu_tsl_galaxy`. No example name contains "raymarch", "sdf" or "lathe". — [three.js files.json](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)

### Inferences
These columns are my judgement from the API facts above and general three.js knowledge, not measured results. Failure modes marked (S) follow from a cited source, and the rest are expected, not observed in this research.

| Technique | Good for | Concrete example (untested) | How far quality can go | Common LLM failure modes |
|---|---|---|---|---|
| Primitives and groups | Furniture, robots, vehicles, stylised characters, anything with clear parts | `Group` "chair" with seat, back and 4 legs, each pivot at its joint | High in a committed style, low for realism; silhouette is the limit | Floating or interpenetrating parts, wrong pivots, no shared unit scale, too few parts, default lighting |
| Extrude / lathe / SVG | Logos, icons, panels, gears; bottles, vases, wheels, columns | `new ExtrudeGeometry(shape, {depth: .2, bevelSize: .02, bevelThickness: .02, bevelSegments: 3})`; `new LatheGeometry(profilePoints, 48)` | High for hard-surface and rotationally symmetric forms | Forgetting the default bevel grows the outline (S), wrong hole winding, centring not applied, Y-flip for SVG, stale `createShapes` (S), bevel on path extrusion (S), negative lathe x values |
| Parametric / noise geometry | Terrain, rocks, blobs, trees, organic variation | Displace a `PlaneGeometry` by fractal noise, then `computeVertexNormals()` | High for terrain and rocks; poor for specific recognisable objects | Stale normals, no seed, single-octave noise looking like lumps, seams on spheres, per-frame CPU cost |
| Instancing | Forests, crowds, grass, debris, tiles | `InstancedMesh(leaf, mat, 5000)` with jittered scale, rotation and colour | Multiplies perceived richness cheaply; quality depends on the base mesh and variation | Missing `needsUpdate` (S), stale bounding sphere causing culling pop (S), uniform grids without jitter, no per-instance colour |
| Particles / point clouds | Galaxies, dust, fire, sparkles, sampled image or shape clouds | `Points` with a `BufferGeometry` of positions, soft canvas sprite, additive blending | Very high for atmospheric and abstract pieces | Square points from no sprite, depth sorting artefacts, blowout from additive blending, size not scaled with distance, too many on CPU |
| GLSL / TSL shaders | Water, holograms, gradients, procedural textures that replace image files | `ShaderMaterial` with fresnel rim and noise; TSL `colorNode` on a node material | Very high; often the largest gain per line of code | Mixing GLSL into TSL or old API names (S on staleness), wrong renderer for TSL, no tone mapping or colour space handling, compile errors unseen without console read |
| SDF / raymarching | Smooth blends, metaballs, impossible forms, full-screen hero art | Fragment shader on a quad using a smooth-union of sphere and box SDFs | Very high visually for one hero object; weak for scene integration | Too many steps for weak GPUs, no depth integration with the mesh scene, resolution not capped, banding, wrong step scaling after distortion |
| Text and alternatives | Titles, labels, signage | `TextGeometry` with an inlined font, troika with a supplied font, or a `CanvasTexture` plane | Extruded text looks strong as a hero; troika looks strongest for small crisp text | Huge default size (S), missing font loading (S), CDN or CSP failure under troika (S), using geometry after an async sync (S) |
| RoundedBox and bevels | Removing the "default primitive" look from anything boxy | `new RoundedBoxGeometry(1, .4, 1, 4, .04)` | Small effort, large perceived gain under environment lighting | Radius too large or too small for scale, too few segments, bevels invisible with flat lighting |
| Subdivision / displacement | Soft bodies from a cage, sculpted feel, adding micro-form | `LoopSubdivision.modify(geo, 2)` then displacing along normals | Medium to high for blobby or organic forms; loses hard edges | Triangle explosion, shrinkage of the cage, seams or UV tearing (S), forgetting `mergeVertices` before displacing so cracks open (S on re-indexing) |

Other inferences:
- **Most reliable first choice:** primitives, `RoundedBoxGeometry` and extrusion, because each part can be verified and fixed separately. P3D-Bench's near-perfect validity shows models can usually make such code run, but its low geometry scores warn that running is not the same as matching.
- **Highest quality per line of code:** environment lighting and shaders, not more geometry. `RoomEnvironment` needs no files (see Q4), which fits the no-download constraint.
- **Topology scores matter less here.** P3D-Bench's topology penalty on Three.js comes from a CAD-style view of solids. A scene that only has to render need not be watertight. However, part structure still matters for editing and fixes.
- **Checking the running scene is essential.** WorldBench's 48.0% unimplemented share suggests "did you build everything requested?" is the first thing to verify, more than fine shape.
- **Hard organic content, measured weakly:** WorldBench's hardest biomes were dense, organic ones, which fits the expectation that primitives struggle there. This is one prompt per model, so it is suggestive only.

### Gaps
- No benchmark or controlled comparison was found per technique. All ceilings above are judgement.
- LatheGeometry docs, point material docs and the `SimplexNoise`/`ImprovedNoise` addons were not read in this research. Check their current API before relying on the lathe, particle and noise rows.
- I did not read `webgl_modifier_subdivision` to see which subdivision implementation it uses.
- No measured data was found on performance by technique on typical user hardware.
- The Quilez SDF article could not be fetched (404 through the fetch tool), so its specific contents were not verified here.

## Q2. Reference image to code: which methods exist, and what works or fails?

### Takeaway
Published methods exist but few target three.js specifically. The strongest measured finding is that better ways of seeing help: in a Blender benchmark, one model rose from 0.725 from a single view to 0.927 with full 3D interaction. That top figure relies on access to the target asset, which a single user photo cannot provide. Expect image input to be clearly harder than text with explicit parameters, and semantic match to run well ahead of geometric match.

### Cited Findings

**Measured evidence**
- [Measured] 3DHarnessBench gives agents 100 targets to rebuild as Blender Python, not three.js, seeing only renders and a GLB asset. Opus 5 scored Uni3D 0.725 single-view, 0.748 multi-view, 0.871 with agent-controlled viewpoints, and 0.927 with unrestricted Blender MCP access. — [3DHarnessBench](https://arxiv.org/html/2609.06535)
- [Measured] 3DHarnessBench's fixed-view harnesses allow one generation plus three render-and-refine iterations. — [3DHarnessBench](https://arxiv.org/html/2609.06535)
- [Measured] 3DHarnessBench ablations: camera pose cues cut Chamfer distance from 0.0199 to 0.0077 (GPT-5.6 Sol, 10 instances). Grid cues reached 0.0172, and combining cues was not additive. Global and part measurements cut Opus 5's Chamfer from 0.0150 to 0.0084. Normalising the viewport cut MiniMax M3's from 0.0798 to 0.0240. — [3DHarnessBench](https://arxiv.org/html/2609.06535)
- [Measured] More access does not help every model. Moving from multi-view to active visual changed Uni3D by +16.4% for Opus 5 and -16.5% for MiniMax M3. Gemini 3.1 Pro inspected little and often stopped early. — [3DHarnessBench](https://arxiv.org/html/2609.06535)
- [Measured] P3D-Bench: image input is harder than parametric text. GPT-5.5 on OpenSCAD scored Geo 0.567 and Judge 0.592 from images, against Geo 0.715 and Judge 0.850 from parametric text. — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] P3D-Bench: the strongest model reached a semantic judge score near 0.8 but a geometric judge score near 0.35, so results resemble the right kind of thing more than the right shape. — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] CADCodeVerify has the model generate and answer validation questions about its own render, then correct deviations. With GPT-4 this gave a 7.30% reduction in point cloud distance and a success gain reported as 5.5% in one version and 5.0% in another. It is modest but automatic, and it uses CADPrompt's 200 prompts. — [CADCodeVerify](https://arxiv.org/html/2410.05340v2)
- [Measured] Screenshots can mislead. In WorldCoder-Bench, screenshot-plus-vision scoring was essentially uncorrelated with behavioural verification (Kendall tau-b -0.068), and an 8-step agent (tau-b +0.111) still passed 45.6% of low-coverage outputs. That study tests behaviour, not looks. — [WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)
- [Measured] Code alone also misleads. Code and frames disagreed on 115 of 365 items (32%) in WorldBench. A code-only judge credited 79% of items against 53% for look-only, and four of five deliberately removed features were still credited. — [WorldBench](https://arxiv.org/html/2610.10622v1)
- [Measured] Vision judges err. WorldBench's judge accepted drifting snow as a blizzard, and 7 of 32 untouched items changed verdict between runs. All its judge roles are Gemini or Gemma, with bias unmeasured. — [WorldBench](https://arxiv.org/html/2610.10622v1)

**Workflows and tools**
- [Vendor/author] img2threejs (Apache-2.0) is the closest match to this brief, an agent skill from one image to a code-only Three.js model. It classifies the subject, inventories identity-defining details, writes a spec of components, materials, repetition and sockets, then builds in gated passes: blockout, structural, form, material, surface, lighting, interaction, optimisation. Each pass is judged from a reference-versus-render sheet. — [img2threejs](https://github.com/img2threejs/img2threejs)
- [Vendor/author] img2threejs gives no fidelity benchmarks. It says it is strongest on hard-surface objects, and treats "cannot reach the requested fidelity" as a valid result. Hidden sides are inferred. Star count (20.3k at capture) shows interest, not quality. — [img2threejs](https://github.com/img2threejs/img2threejs)
- [Vendor/author, independence unclear] A guide on Uwarp recommends starting with hard-surface objects and avoiding soft, edgeless organic blobs as references. It gives no cost or token figures and does not state its relationship to the project. — [Uwarp guide](https://www.uwarp.design/blog/img2threejs-image-to-procedural-threejs-guide)
- [Vendor/author] Blender MCP (MIT) lets the AI write Blender Python and check its result with a `look` tool across viewport, camera and multiple angles. It warns that arbitrary code can run, and its socket server has no authentication or encryption. Requires Blender, so it is outside this brief except as a pattern. — [blender-mcp](https://github.com/ahujasid/blender-mcp)
- [Anecdote] One practitioner runs one Blender operation, screenshots, has a vision model check, undoes on failure, and switches strategy after three identical failures. They also warn of stale screenshots unless the viewport redraws first and advise setting the camera in code. — [DEV Community](https://dev.to/aleksandr_kossarev_e23623/ai-orchestrated-3d-asset-pipeline-from-jpeg-to-game-ready-glb-without-touching-blender-1akf)
- [Anecdote] A review calls LLM spatial positioning approximate at best, but says a build, screenshot, refine loop makes iteration workable. — [ChatForest review](https://dev.to/grove_chatforest/blender-mcp-server-ai-powered-3d-modeling-with-a-security-trade-off-4d6g)
- [Anecdote] One Reddit user called Blender MCP a large token waste compared with doing the same task in Three.js, and another reported poor results. This is a mirror of the thread and only two opinions. — [Reddit snapshot](https://reddit.sentinel-team.org/posts/1rml9vj/snapshots/2026-03-13T21%3A15%3A30.397008Z)
- [Vendor/author] SceneCraft builds a scene graph, turns relations into numerical layout constraints, writes Blender Python, and uses GPT-V to review renders. It reports CLIP score gains over BlenderGPT of 45.1% on synthetic queries and 40.9% on Sintel scenes. It arranges up to about a hundred assets, so it is about layout, not building objects from primitives. — [SceneCraft](https://proceedings.mlr.press/v235/hu24g.html)
- [Vendor/author] LL3M agents critique both code and renders through creation and refinement, for example fixing a disconnected backrest. Evidence is qualitative only. — [LL3M](https://threedle.github.io/ll3m/)
- [Vendor/author] 3D-GPT splits work among dispatch, conceptualisation and modelling agents. Its public code drives Infinigen, and the repository suggests the release may not match the paper's full setup. Both of these rely on tools the agent here cannot run. — [3D-GPT](https://arxiv.org/html/2310.12945v2); [repo summary](https://www.sourcepulse.org/projects/1838868)
- [Measured, crowd vote, via mirror] VoxelBench has separate text and image leaderboards with different leaders (Claude Opus 5 at 2236 on text, Gemini 3.1 Pro Preview at 1701 on image), in a BenchLM snapshot dated 29 July 2026. It is voxel only and uses anonymous preference voting. — [BenchLM VoxelBench](https://benchlm.ai/benchmarks/voxelbench); [image board](https://benchlm.ai/benchmarks/voxelbench-image)

### Inferences
- **What a realistic target looks like here:** the agent has one image and no target asset, so Opus 5's 0.725 single-view result (with three refine rounds) is the closest guide, not 0.927. These are Blender results on a different metric, and transfer to three.js is unmeasured.
- **A workflow that fits the evidence:**
  1. Classify the subject and refuse or restyle if it is organic or photoreal (img2threejs, Uwarp).
  2. Write a spec before code: silhouette, height-to-width ratios per part, a part tree, material for each part, palette sampled from the image, and light direction. Measurements are the best-evidenced element here (3DHarnessBench).
  3. Match the camera to the reference first, since camera cues had the largest single gain in 3DHarnessBench's ablations.
  4. Build by passes: blockout with flat colours, then proportions, then materials, then lighting and detail.
  5. After each pass, compare a side-by-side sheet from a fixed, normalised camera, list differences, and apply one diagnosed fix. Procedura's one-fix-at-a-time rule is a claim from its authors (see Q3).
  6. Limit rounds. Three refine rounds is what the fixed-view benchmark used, and practitioner advice is to switch strategy after three identical failures (anecdote).
- **Pair code checks with visual checks.** WorldBench shows code-only and look-only judges each fail, so verify that each named part exists in the scene graph and is actually visible on screen. Scene graph inspection plus object bounding boxes can supply the measurements a vision model lacks.
- **Screenshot timing may matter on canvas too.** Reading a WebGL canvas needs a fresh render in the same tick or `preserveDrawingBuffer`, which parallels the stale-viewport anecdote. This is general knowledge, not tested here.
- **Weak-model behaviour:** some models regress with richer tools and stop early, so a fixed checklist of required views may be safer than letting the agent decide what to inspect.

### Gaps
- I found no published method dedicated to silhouette extraction, proportion analysis or lighting estimation as steps in LLM image-to-three.js work. img2threejs comes closest but reports no metrics.
- I found no controlled head-to-head test of Claude against GPT writing three.js from an image with results shown.
- I read 3DHarnessBench only up to about the first 100,000 of 187,000 characters and P3D-Bench only up to about 100,000 of 131,000, so later tables and discussion are unread.
- WorldCoder-Bench's and WorldBench's figures concern worlds and behaviour, not likeness to an image.

## Q3. Description to code: what does hierarchical part decomposition do for quality, and what do benchmarks show?

### Takeaway
Decomposition is close to universal in recent systems, but I found no controlled experiment isolating its effect, and the strongest claims are self-reported. The nearest measured evidence is that part measurements reduce error and that part recovery itself is weak: GPT-5.5's part-match F1 on P3D-Bench is about 0.5. Three.js-specific benchmarks exist (WorldBench, WorldCoder-Bench, P3D-Bench's image track), and they show running code far outpacing requested content, correct geometry and correct behaviour.

### Cited Findings
- [Measured] P3D-Bench covers 400 text cases, 400 image cases and 203 assemblies across 11 general models and 3 domain models. Three.js is only tested in the image track. — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] On parametric text, GPT-5.5 averaged validity 0.999, Geo 0.706, Topo 0.997, Judge 0.812. On assemblies it scored Geo 0.586, Judge 0.541, Part 0.629. Assemblies were the hardest setting. — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] Part recovery: PartFS about 0.73 and PartMatchF1 about 0.5 for GPT-5.5, so models miss on both part count and per-part geometry. — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] Invalid outputs on text were mostly syntax errors (73% of descriptive, 50% of parametric cases). On image and assembly CadQuery, parameter errors dominated (55% and 54%). — [P3D-Bench](https://arxiv.org/html/2606.11152v1)
- [Measured] In WorldCoder-Bench, Qwen3.6-Plus dropped from 25.3% on core tasks to 13.5% on perturbed variants, which the authors read as template recall over understanding. GPT-5.4 scored 19.9% on the perturbed set. — [WorldCoder-Bench](https://arxiv.org/html/2606.01869v2)
- [Vendor/author] Procedura plans an assembly graph, writes one part at a time, solves placements from typed mates instead of guessing, admits a part only after compile, mate and connectivity checks, then uses a decoupled vision critic for one fix at a time. It claims to beat native generators and prior code agents on P3D-Bench and MechBench-36. This is a preprint from August 2026, and the abstract gives no numbers. — [Procedura](https://arxiv.org/abs/2608.26238)
- [Vendor/author] ShapeCraft's agents parse prompts hierarchically into a graph-based procedural representation, arguing independent components are easier for LLMs. I could only read a search summary of it. — [ShapeCraft](https://arxiv.org/pdf/2510.17603)
- [Vendor/author] Proc3D's compact procedural graph format reportedly cuts context 4-10x against platform-specific code (search summary only). — [Proc3D](https://arxiv.org/pdf/2601.12234)
- [Vendor/author] MeshCoder argues primitive-only DSLs (cubes, spheres, cylinders) cannot represent intricate real parts, and reports better shape-to-code reconstruction with semantic parts. It trains a model and takes point clouds, which rules it out here (search summary only). — [MeshCoder](https://arxiv.org/pdf/2508.14879)
- [Vendor/author] SceneCraft stores common functions in a reusable library, and LL3M uses instancing and parenting for hierarchy. — [SceneCraft](https://proceedings.mlr.press/v235/hu24g.html); [LL3M](https://threedle.github.io/ll3m/)
- [Vendor/author] MineBench (MIT per an aggregator) ranks voxel builds by head-to-head votes, and VoxelCodeBench has LLMs write Python in an Unreal voxel environment. I read neither in depth. — [MineBench summary](https://www.sourcepulse.org/projects/31138598); [VoxelCodeBench](https://arxiv.org/abs/2604.02580)

### Inferences
- **Why decomposition likely helps, by elimination:** WorldBench's largest loss was unimplemented content (48.0%), and a part inventory is a direct check against skipped items. Placement solved by attachment points, Procedura's idea, addresses the reported weakness in spatial precision. Both are reasoned links, not measured effects.
- **A vanilla three.js version of this:** one factory function per part, named `Group`s with pivots at joints, a shared unit scale, constants at the top, placement computed from parent bounds, and a check after each part that it touches its parent. This is cheap to adopt and needs no model training.
- **Explicit parameters beat vague prompts.** The agent can expand a brief into numbers before coding, since parametric text outscored image input. The comparison crosses input types, so treat this as suggestive.
- **Part count needs a floor and a stop.** Low part counts read as crude, and part recovery is weak, so the inventory should be written first and held to, with detail added only once the blockout passes.
- **Benchmarks reward different things.** WorldCoder-Bench's low numbers partly reflect hidden state contracts rather than look, so they should not be quoted as "only 28% of three.js works". Schema drift against a required state object may be partly a harness effect.

### Gaps
- No ablation was found that removes decomposition and measures the change in quality.
- No third-party replication of Procedura's claims was found, and its result tables were not read.
- ShapeCraft and Proc3D were only seen through search summaries. The ShapeCraft PDF did not parse through the fetch tool.
- No large three.js-specific benchmark judges visual appeal for single objects.

## Q4. Which styles make code-built models look intentional, and which hide primitive modelling best?

### Takeaway
I found no measured study of style against perceived quality. The ranking below is judgement, supported by API facts. Abstract, clay/matcap, low-poly and toon are the most forgiving, while realism is the least. Glass and iridescence look impressive on simple forms but need an environment map and cost more per pixel.

### Cited Findings
- [Docs] Toon: `gradientMap` needs `NearestFilter` for both `minFilter` and `magFilter`, and `NoColorSpace`. It defaults to `null`. — [MeshToonMaterial docs](https://threejs.org/docs/pages/MeshToonMaterial.html)
- [Anecdote] A tutorial site says `flatShading`, `shininess` and `specular` no longer apply to `MeshToonMaterial`. I did not confirm this in the docs. — [sbcode.net](https://sbcode.net/threejs/meshtoonmaterial/)
- [Docs] Matcap: the texture encodes baked lighting, so `MeshMatcapMaterial` ignores lights and does not self-shadow or receive shadows, though it can cast shadows. LDR textures need `SRGBColorSpace`. — [MeshMatcapMaterial docs](https://threejs.org/docs/pages/MeshMatcapMaterial.html)
- [Docs] Glass: `transmission` runs 0-1 and the docs say to keep `opacity` at 1. `thickness` 0 means thin-walled. `ior` defaults to 1.5. `attenuationColor`, `attenuationDistance` and `dispersion` add depth. — [MeshPhysicalMaterial docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- [Docs] Iridescence: `iridescence` 0-1, `iridescenceIOR` default 1.3, thickness 100-400 nm by default. — [MeshPhysicalMaterial docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- [Docs] Costs: the physical material costs more per pixel than other materials, each enabled effect adds cost, and the docs advise always specifying an environment map. — [MeshPhysicalMaterial docs](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- [Docs] `RoomEnvironment` builds a procedural room from boxes and emissive meshes with no external files. `PMREMGenerator.fromScene()` turns it into a `scene.environment`, which meets the no-download limit. — [RoomEnvironment source](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/jsm/environments/RoomEnvironment.js)
- [Anecdote] A forum reply suggests a reference scene's look comes from low-poly models with flat shading and maybe a toon effect. — [three.js forum](https://discourse.threejs.org/t/how-to-create-a-scene-like-this/51835.md)
- [Vendor/author] Procedura's authors say native generators give soft edges, one sign that crisp edges are a valued property of code-built output. — [Procedura](https://arxiv.org/abs/2608.26238)
- [Docs] Study examples: `webgl_materials_toon`, `webgl_materials_matcap`, `webgl_materials_physical_transmission`, `webgl_materials_physical_clearcoat`, and their WebGPU versions. — [three.js files.json](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)

### Inferences
Ranking of how well each style hides primitive modelling limits (my judgement, not measured):

| Rank | Style | Why it hides limits | What it exposes | Recipe | Reliability |
|---|---|---|---|---|---|
| 1 | Abstract (shader-led, particles, SDF) | No reference to fail against | Weak composition and motion | Few forms, one strong shader, restrained palette | High if GPU cost is capped |
| 2 | Clay / matcap | Unified surface reads as a sculpt; lighting cannot go wrong | Bad proportions; no shadows received | Canvas-drawn matcap, `RoundedBox`, subdivision on soft parts, ground contact fake | High; no lights to tune |
| 3 | Low-poly, flat shaded | Facets become the style; few vertices are expected | Pure default primitives with uniform size | `flatShading: true` on a standard material, jittered vertices, limited palette, hemisphere + one directional light | High |
| 4 | Toon / gradient map | Removes surface detail demands | Silhouette, so primitive outlines show; needs an outline for full effect | 3-band `DataTexture`, inverted-hull or post outline, flat colours | Medium; filter setup is easy to miss |
| 5 | Glass / iridescent | Simple forms look expensive | Empty environment looks dead; heavy on GPUs; refractions hide or reveal interior errors | `RoomEnvironment`, `transmission: 1`, `thickness`, `roughness` low, dark backdrop | Medium; cost and env dependent |
| Last | Photoreal PBR | Hides nothing | Everything: edges, textures, scale, contact | Avoid unless the subject is simple hard-surface | Low |

- **Commit to one style per scene.** Mixed material families are likely a major cause of a "crude" look, but this is a hypothesis. No source measured it.
- **Common signs of unintentional work** (hypotheses to test): sharp box edges with smooth lighting, default grey, no environment map, no contact shadow, uniform scale and spacing, and evenly lit scenes. Rounded edges, palette limits, jitter, and an environment map address these.
- **Which style for which subject:** low-poly or toon for scenes and characters, clay for product-like and character busts, glass for logos and abstract hero objects, and shader or particles for backgrounds.
- **On a page-embedded userscript canvas,** transmission and raymarching add per-pixel cost, so cap pixel ratio and pause offscreen. This is reasoned from the docs' cost note, not benchmarked.

### Gaps
- No user study or benchmark was found comparing styles for perceived quality on LLM output.
- Practitioner write-ups with results on "why AI three.js looks crude" were not found. The search returned mostly API docs and copies of skill pages.
- Mobile and integrated GPU cost of each style was not measured.

## Q5. Which open-source examples and shader collections can the agent study, and under what licenses?

### Takeaway
Three.js, drei, maath, troika, three-subdivide and tsl-textures are all MIT and safe to adapt with notices kept. Do not copy from Shadertoy unless the specific shader says otherwise, because the reported default is non-commercial and share-alike. LYGIA looks open but is Prosperity-licensed, which limits commercial use to a 30-day trial without a separate licence. Three.js Journey's terms could not be found, so treat its course code as not reusable.

### Cited Findings

| Source | URL | License as stated | Commercial reuse? | Grade and flag |
|---|---|---|---|---|
| three.js (library, addons, examples) | [LICENSE](https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE) | MIT, © 2010-2026 three.js authors | Yes; keep the notice | [Docs]. Maintainer says examples are MIT but some "inspired from" code has extra attribution needs, per [forum](https://discourse.threejs.org/t/question-about-examples-license/60). Some examples load assets with their own terms (general caution, not checked) |
| drei | [LICENSE](https://raw.githubusercontent.com/pmndrs/drei/master/LICENSE) | MIT, © 2020 react-spring | Yes; shaders must be adapted out of React (inference) | [Docs] |
| maath | [LICENSE](https://raw.githubusercontent.com/pmndrs/maath/main/LICENSE) | MIT, © 2026 Isaac Mason | Yes | [Docs] |
| troika-three-text | [LICENSE](https://raw.githubusercontent.com/protectwise/troika/main/LICENSE) | MIT, © 2019 ProtectWise, © 2021 Jason Johnston | Yes; fonts carry separate licences | [Docs]. Default CDN fetches, see Q1 |
| three-subdivide | [repo](https://github.com/stevinz/three-subdivide) | MIT | Yes | [Docs] |
| tsl-textures | [LICENSE](https://raw.githubusercontent.com/boytchev/tsl-textures/main/LICENSE) | MIT, © 2024 Pavel Boytchev | Yes | [Docs]. TSL API may change |
| threejs-skills | [repo](https://github.com/CloudAI-X/threejs-skills) | MIT | Yes | [Vendor/author]. Targets r186, so check newer changes |
| img2threejs | [repo](https://github.com/img2threejs/img2threejs) | Apache-2.0 | Yes, with Apache notice and change terms | [Vendor/author]. Has a private plugin and an optional hosted product, which are separate |
| blender-mcp | [repo](https://github.com/ahujasid/blender-mcp) | MIT | Yes, pattern only here | [Vendor/author]. Not usable without Blender |
| Bruno Simon folio-2025 | [repo](https://github.com/brunosimon/folio-2025) | MIT label on the repo | Code probably; **assets unverified** | [Docs]. Check `license.md` before copying anything in `static/` or `resources/` |
| Inigo Quilez articles and algorithm code | [iquilezles.org](https://iquilezles.org/) | MIT for algorithm code, copyright for artwork code | Algorithms yes, artworks **no** | Search result only. Check the header of any shader |
| **LYGIA** | [LICENSE](https://raw.githubusercontent.com/patriciogonzalezvivo/lygia/main/LICENSE.md) | Prosperity Public License 3.0.0, with Patron License for sponsors | **30-day commercial trial only**, per company, unless licensed | [Docs]. Noncommercial use is free. README mentions sponsorship and a per-version commercial licence, per [README](https://raw.githubusercontent.com/patriciogonzalezvivo/lygia/main/README.md) |
| **Shadertoy** | [terms](https://www.shadertoy.com/terms) (blocked, 403) | Reported default CC BY-NC-SA 3.0 Unported unless the author says otherwise | **No by default**; check each shader | Secondhand only, see below |
| **Three.js Journey** | [site](https://threejs-journey.com/) | Not found | **Assume no** | `/terms` returned 404, and no statement was found |

- [Anecdote/secondhand] Third-party sites report that Shadertoy shaders without a stated licence fall under CC BY-NC-SA 3.0 Unported. — [Godot Shaders](https://godotshaders.com/shader/creation-by-silexars/); [third-party notice](https://raw.githubusercontent.com/ogarza/ogarza.plugins.weather/main/THIRD_PARTY_NOTICES.md)
- [Anecdote] A forum post argues authors alone set licence terms and complains of shaders being re-uploaded under MIT without permission, so an MIT label on a copy elsewhere is not proof. — [Vidvox forum](https://discourse.vidvox.net/t/user-bennoh-is-stealing-shaders-and-uploading-them-online-with-mit-license/2682)
- [Anecdote] A forum thread quotes a Quilez shader header claiming sole copyright and forbidding hosting or distribution, despite the MIT statement for algorithms. So headers need checking case by case. — [Future of Coding thread](https://linen.futureofcoding.org/t/12355754/my-overall-goal-for-the-year-is-to-finally-learn-how-to-do-r)
- [Docs] Blender's source attributes some Voronoi code to MIT, © 2013 Inigo Quilez, an example of the terms applied in practice. — [Blender commit](https://developer.blender.org/rB3848507511a7546ab396c80f069b48de3332860f)
- [Docs] Example families worth studying are listed under Q1 and Q4, all from the MIT three.js repo. — [three.js files.json](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json)

### Inferences
- **Safe default for shader code:** adapt from MIT sources (three.js examples, drei, tsl-textures, Quilez algorithms), keep notices, and write the rest from first principles. Basic techniques such as fresnel rim or smooth-minimum blending are widely known, though this is not legal advice.
- **The agent should never paste Shadertoy or LYGIA code into user output by default.** If the user's script is shared, sold or used by a business, NC and Prosperity terms may be breached, and share-alike could also reach the user's own code. A userscript distributed free is not automatically noncommercial, so a lawyer would be needed for edge cases.
- **LYGIA's server route does not change this.** Resolving includes at runtime would still be use of the code, and would add a network dependency.
- **Studying versus copying:** reading restricted code to learn an idea differs from copying it, but close paraphrase carries risk. An agent rule of "cite the source and licence for any adapted shader" would make this reviewable.
- **Fonts and assets are separate from code.** MIT on a repo does not automatically cover bundled fonts, HDRIs or models.

### Gaps
- **Shadertoy's own terms could not be read** (`/terms` and `/howto` both returned 403), so the CC BY-NC-SA 3.0 default rests on third-party statements and the brief's premise. Confirm it in a normal browser. The version (3.0 against the 4.0 seen in one community template) also needs checking.
- **Three.js Journey:** no licence or terms were found. Ask the author or read the course's terms directly.
- **drei and maath:** only the repo licence was read, and individual files could carry other notices.
- **Quilez:** the statement was seen through search results only, as direct fetches failed.
- This is not legal advice, and all licences above can change, so re-check before shipping.
