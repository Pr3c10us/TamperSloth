# Web 3D frameworks and how they load in a TamperSloth userscript (checked 2026-11-04)

Evidence labels used throughout:
- **[Measured]**: I fetched the real CDN file with curl on 2026-11-04. Sizes are raw bytes and `gzip -9` of the body, so wire size with brotli will be smaller. CORS was checked by sending `Origin: https://example.com`.
- **[Probe]**: I ran it in a throwaway MV3 extension using `chrome.userScripts.execute` with the same world CSP strings as TamperSloth. Browser was Chrome for Testing 141.0.7390.78, headless, SwiftShader. Host pages were local test pages with a CSP. Harness and raw results: `C:\Users\owopr\AppData\Local\Temp\claude\4457f3e905c798b4\de7f4484-9fb8-4346-b08d-7dcca3aeaef3\scratchpad\uswtest\` (`results.json`, `results2.json`).
- **[Code]**: read from the TamperSloth repo (read-only).
- **[Source]**: what a linked page says. I did not verify it independently.

Probe limits, which apply to every [Probe] line:
- The browser was Chrome 141. TamperSloth's minimum is 138 and the machine's installed stable Chrome is 156, which I did not test. Playwright's Chromium 151 refused to launch ("Permission denied"). **Re-run on current stable before relying on it.**
- It was not run inside TamperSloth itself. The world CSP strings and API calls match, but the GM shim was not exercised.
- SwiftShader offered no WebGPU adapter, so real WebGPU rendering is untested.

## Which framework should be the primary stack and which the fallback?

### Takeaway
**Primary: Three.js r187 (`0.187.0`, MIT) using the classic `WebGLRenderer`, loaded in the USER_SCRIPT world from pinned jsDelivr `+esm` files through a small fetch-and-`new Function` linker.** It needs no extension change, and it rendered on a page with a strict CSP [Probe]. Medium term, the owner should bundle Three as an IIFE inside the extension package and inject it with `js:[{file}]`, which removes both the CDN and the policy question.

**Lightweight fallback: raw WebGL2 inside the single self-contained function, with no library.** It is the only option with no load path that can fail. OGL is the runner-up if a scene graph is wanted and 39 KB of network is acceptable.

Do not default the agent to `WebGPURenderer` or to `<model-viewer>`.

### Cited Findings

**Comparison at current versions.** Versions and licenses come from the npm registry (e.g. [three](https://registry.npmjs.org/three/latest)). Sizes are [Measured]. "Render" is [Probe] on a strict-CSP page in the USER_SCRIPT world under TamperSloth's CSP.

| Framework | Version, license | No-build file | Raw / gzip | Non-ESM? | Render on strict page |
|---|---|---|---|---|---|
| Three.js | 0.187.0 (r187, 2026-10-30), MIT | [`three@0.187.0/+esm`](https://cdn.jsdelivr.net/npm/three@0.187.0/+esm) | 753,603 / 190,746 | No, see next section | Yes, via linker |
| Three.js + 6 addons | same | core + Orbit, GLTF, RoomEnvironment, HDR, EffectComposer, RoundedBox | about 216 KB gzip total | No | Yes |
| Three.js WebGPU build | same | [`build/three.webgpu.js/+esm`](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.webgpu.js/+esm) | 1,126,924 / 307,272 | No | Loaded, fell back to WebGL2 |
| Babylon.js | 9.33.2, Apache-2.0 | [`babylonjs@9.33.2/babylon.js`](https://cdn.jsdelivr.net/npm/babylonjs@9.33.2/babylon.js) (minified despite its name) | 8,851,580 / 1,911,484 | Yes, UMD | Yes (7.1 s) |
| Babylon loaders | 9.33.2, Apache-2.0 | [`babylonjs.loaders.min.js`](https://cdn.jsdelivr.net/npm/babylonjs-loaders@9.33.2/babylonjs.loaders.min.js) | 880,233 / 215,655 | Yes | Not tested |
| `<model-viewer>` | 4.4.0, Apache-2.0 | [`dist/model-viewer-umd.min.js`](https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer-umd.min.js) (bundles Three) | 1,072,040 / 288,717 | Yes, UMD | **Fails in USER_SCRIPT** |
| `<model-viewer>` module | 4.4.0 | [`dist/model-viewer-module.min.js`](https://cdn.jsdelivr.net/npm/@google/model-viewer@4.4.0/dist/model-viewer-module.min.js) (Three external, peer `^0.183.0`) | 475,465 / 143,068 | ESM | Not tested |
| OGL | 1.0.11, Unlicense | [`ogl@1.0.11/+esm`](https://cdn.jsdelivr.net/npm/ogl@1.0.11/+esm) | 133,629 / 39,358 | No (`src/` and `types/` only, no `dist`) | Yes, via linker (0.5 s) |
| PlayCanvas | 2.23.3, MIT | [`build/playcanvas.min.js`](https://cdn.jsdelivr.net/npm/playcanvas@2.23.3/build/playcanvas.min.js) | 2,554,078 / 655,585 | Yes | Yes (3.2 s) |
| A-Frame | 1.8.0, MIT | [`dist/aframe-master.min.js`](https://cdn.jsdelivr.net/npm/aframe@1.8.0/dist/aframe-master.min.js) | 1,323,403 / 348,461 | Yes | Not tested |
| Filament | 1.53.4, Apache-2.0 | [`filament.js`](https://cdn.jsdelivr.net/npm/filament@1.53.4/filament.js) + [`filament.wasm`](https://cdn.jsdelivr.net/npm/filament@1.53.4/filament.wasm) | 3,781,288 / 2,015,989 combined | Yes, but needs WASM | Not tested |
| regl | 2.1.1, MIT | [`dist/regl.min.js`](https://cdn.jsdelivr.net/npm/regl@2.1.1/dist/regl.min.js) | 86,652 / 28,436 | Yes | Not tested |
| twgl | 7.0.0, MIT | [`dist/7.x/twgl-full.min.js`](https://cdn.jsdelivr.net/npm/twgl.js@7.0.0/dist/7.x/twgl-full.min.js) | 106,052 / 29,348 | Yes | Not tested |
| Raw WebGL2 / WebGPU | browser API | none | 0 | n/a | WebGL2 context works in a closed shadow root; no WebGPU adapter in the probe |

Every 200 row above returned `Access-Control-Allow-Origin: *` [Measured]. Timings are indicative only: software GL, including network.

**Is WebGPU/TSL now the default in Three.js? No.**
- [Measured] `build/three.module.min.js` has zero matches for `WebGPURenderer`. [`package.json`](https://cdn.jsdelivr.net/npm/three@0.187.0/package.json) exposes `./webgpu` and `./tsl` as separate entries, so plain `three` is still the WebGL build.
- [Source] The [manual](https://threejs.org/manual/pages/webgpurenderer.html) says WebGLRenderer "is still maintained and the recommended choice for pure WebGL 2 applications". It says new feature work is focused on WebGPURenderer and still calls that renderer experimental.
- [Source] `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile` and `EffectComposer` are not supported under WebGPURenderer. It falls back automatically to a WebGL2 backend, and needs `await renderer.init()` unless you use `setAnimationLoop` ([manual](https://threejs.org/manual/pages/webgpurenderer.html)).
- [Probe] `three.webgpu.js/+esm` loaded through the linker and `init()` succeeded. With no adapter it warned that it was running under WebGL2. `three.tsl.js/+esm` also loaded, with 819 exports.
- [Source] WebGPU ships in Chrome and Edge 113+, Firefox 141+ on Windows and 145+ on Apple Silicon macOS, and Safari 26 ([web.dev, Nov 2025](https://web.dev/blog/webgpu-supported-major-browsers)).

**How easy is it for an LLM to write correct code?**
- **Three.js:** best training coverage among these libraries by my judgement, but monthly revisions break things. [Source, [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)]:
  - `examples/js` removed at r148.
  - `outputEncoding`/`sRGBEncoding` became `outputColorSpace`/`SRGBColorSpace` at r152.
  - `useLegacyLights` deprecated at r155.
  - `build/three.js` and `three.min.js` removed at r161.
  - WebGL1 dropped at r163.
  - `RGBELoader` renamed `HDRLoader` at r180.
  - `PCFSoftShadowMap` deprecated at r182. `PCFShadowMap` is now soft.
  - `Source` renamed `TextureSource` at r186.
  - PMREM reworked and `CubeUVReflectionMapping` removed at r187.
- [Source] [r187 release notes](https://github.com/mrdoob/three.js/releases) also remove code deprecated in r177, so old API shims keep disappearing.
- **Three TSL:** moving fast. TSL functions were renamed or changed in each of the r185, r186 and r187 migration entries ([guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). This is the largest staleness risk.
- **Babylon:** [Source] the [docs](https://doc.babylonjs.com/setup/frameworkPackages/frameworkVers) promise no public API breaks between minor versions, with breaks saved for major versions. The [breaking changes page](https://doc.babylonjs.com/breaking-changes) still lists 9.x items, but they are narrow (decorators, UMD now ES2015).
- **OGL:** [Source] the [README](https://raw.githubusercontent.com/oframe/ogl/master/README.md) expects you to write your own shaders and be comfortable with native WebGL calls. Its claimed 29 KB minzip total differs from the 39 KB `+esm` I measured, because `+esm` includes everything.
- **Raw WebGL2:** verbose, but no library version to get wrong.

**Visual quality ceiling.**
- Three `WebGLRenderer`: PBR materials, image-based lighting via PMREM/RoomEnvironment, EffectComposer post-processing. A rounded PBR box with RoomEnvironment through EffectComposer rendered correctly in the probe, with a white centre pixel on the lit box [Probe].
- Three `WebGPURenderer`: higher ceiling. [Source] SSGI, SSS and improved DoF are only available there ([manual](https://threejs.org/manual/pages/webgpurenderer.html)).
- Babylon 9: [Source] clustered lighting, Frame Graph and volumetric lighting on WebGPU and WebGL2 ([secondary summary](https://gamefromscratch.com/babylon-game-engine-v9-release/)). Comparable or higher ceiling, at about 9 times the download of Three.
- `<model-viewer>`: a glTF viewer rather than a scene engine, so it only suits showing a model.
- OGL and raw WebGL2: whatever you write. Without shader work there is no PBR out of the box. The OGL README mentions neither PBR nor a glTF loader in what I read.

### Inferences
- **Why Three on WebGLRenderer:** smallest full-featured option that loads cleanly, and the code LLMs write by default (`ShaderMaterial`, `EffectComposer`) works there and fails under WebGPURenderer. Add a system-prompt list of stale APIs to avoid.
- **Why raw WebGL2 as fallback rather than OGL:** a library fallback fails the same way Three does when the CDN or `fetch` is unavailable, and OGL has no non-ESM build, so it needs the same linker anyway. Raw WebGL2 needs no network, no `eval`, and no world-CSP allowance, so it also works in MAIN on strict pages.
- **Babylon** is the credible alternative if API stability outweighs size, but about 1.9 MB gzip per page injection is hard to justify for page decoration.
- **A-Frame** should not work in USER_SCRIPT, because it is built on custom elements and `customElements` is null there.

### Gaps
- No current market-share figure for WebGPU. The only 2026 number I found (about 76%, [enterno.io](https://enterno.io/en/s/research-webgpu-adoption-browsers-2026)) is low quality and contradicts web.dev on dates.
- `@babylonjs/core@9.33.2/+esm` timed out at 60 s in one curl attempt, so I have no size for it. Treat jsDelivr `+esm` on that package as impractical until shown otherwise.
- "LLM accuracy" is judgement from API churn. I found no benchmark comparing these libraries on LLM-written code.
- PlayCanvas and A-Frame quality ceilings were not researched in depth.

## Does Three.js still ship a non-ESM build, and which addon URLs work?

### Takeaway
**No current non-ESM build exists.** r185/r185.1 is the last release with a real `three.cjs`. Since r186 that file is a 631-byte stub, and it cannot be used in a browser. Addons have been ESM-only since r148. jsDelivr `+esm` gives a working single-instance ESM graph at r187, and `@require` cannot consume it.

### Cited Findings

**Non-ESM history [Measured]:**

| Version | `build/three.min.js` | `build/three.cjs` | `examples/js/*` |
|---|---|---|---|
| 0.147.0 | 200 (607,784 / 152,175) | not checked | **200, last release** |
| 0.148.0 | not checked | not checked | 404 |
| 0.160.0 / 0.160.1 | **200, last release** (669,884 / 166,425) | not checked | 404 assumed from r148 |
| 0.161.0 | 404 | 1,291,554 bytes | |
| 0.185.0 | | **2,093,056 / 409,667** | |
| 0.185.1 | | **2,093,053 / 409,665, last real one** | |
| 0.186.0, 0.186.1, 0.187.0 | 404 at 0.187.0 | **631-byte stub** | 404 at 0.187.0 |

- [Measured] The [r187 stub](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.cjs) says "three is ESM-only going forward", warns through `process.emitWarning`, and re-exports `./three.module.js` via `require`. It also says the file will be removed in a future release.
- [Source] The migration guide dates `three.min.js` removal to r161, which matches my 404 at 0.161.0. The part of the guide I could read does not mention the r186 CJS change, and the [r186 release notes](https://github.com/mrdoob/three.js/releases) I read did not either (that list is truncated). The file itself is the evidence.
- [Measured] Forks: [`super-three@latest`](https://cdn.jsdelivr.net/npm/super-three/build/three.cjs) is at 0.185.0 with a full `three.cjs` (2,106,048 / 412,279). `@needle-tools/three` is at 0.185.2-alpha.8. Neither is newer than r185. `three-stdlib` 2.36.1 (MIT) has a CJS addon entry ([npm](https://registry.npmjs.org/three-stdlib/latest)), but I did not test it.

**npm no longer contains minified builds.**
- [Measured] The [jsDelivr file list](https://data.jsdelivr.com/v1/packages/npm/three@0.187.0) for `build/` holds only `three.cjs`, `three.core.js`, `three.module.js`, `three.tsl.js`, `three.webgpu.js` and `three.webgpu.nodes.js`.
- [Measured] `three.module.min.js` on jsDelivr is generated on demand (its header says "Minified by jsDelivr using Terser"). [unpkg's copy](https://unpkg.com/three@0.187.0/build/three.module.min.js) returns 404.
- [Measured] **Trap:** `three.module.min.js` still imports `./three.core.js`, the unminified 1,474,799-byte file. So loading it pulls about 379 KB gzip, not 89 KB. Use `+esm` (191 KB) instead.
- [Measured] `+esm` output says not to use SRI with generated files. Pinned responses carry `Cache-Control: immutable`.

**Verified URLs at r187.** All 200 with `Access-Control-Allow-Origin: *` [Measured]; all prefixed `https://cdn.jsdelivr.net/npm/three@0.187.0/`:

| Item | `+esm` URL suffix | Raw / gzip | Plain ESM `examples/jsm/...` file, raw |
|---|---|---|---|
| Core | `+esm` | 753,603 / 190,746 | `build/three.module.min.js` 392,177 + `build/three.core.min.js` 422,062 |
| OrbitControls | `examples/jsm/controls/OrbitControls.js/+esm` | 20,589 / 4,734 | 40,918 |
| GLTFLoader | `examples/jsm/loaders/GLTFLoader.js/+esm` | 48,149 / 14,426 | 119,861 |
| RoomEnvironment | `examples/jsm/environments/RoomEnvironment.js/+esm` | 2,538 / 1,198 | 4,960 |
| HDRLoader | `examples/jsm/loaders/HDRLoader.js/+esm` | 3,801 / 1,868 | 12,079 |
| RGBELoader | not checked | | 268, a deprecated wrapper that warns and extends HDRLoader |
| EffectComposer | `examples/jsm/postprocessing/EffectComposer.js/+esm` | 6,163 / 2,152 | 8,501 |
| RoundedBoxGeometry | `examples/jsm/geometries/RoundedBoxGeometry.js/+esm` | 2,127 / 1,066 | 6,470 |
| TSL | `build/three.tsl.js/+esm` | 461,663 / 129,326 | |

- [Measured] Addon `+esm` files import `/npm/three@0.187.0/+esm`, so one graph shares a single Three instance.
- [Probe] All of the above plus `RenderPass.js/+esm` linked and rendered together.
- [Measured] Those addon responses also send `link: </npm/three@0.187.0/+esm>; rel="modulepreload"`. See the CSP section for the side effect.

**esm.sh [Measured, all 200 with ACAO `*`]:**
- `https://esm.sh/three@0.187.0` is a 131-byte re-export stub of `/three@0.187.0/es2022/three.mjs`.
- `https://esm.sh/three@0.187.0?bundle` points to `/three@0.187.0/es2022/three.bundle.mjs` (748,933 / 189,752).
- **Trap:** `?bundle` on an addon inlines its own copy of Three: `OrbitControls.bundle.mjs` is 279,870 bytes and `GLTFLoader.bundle.mjs` is 403,841. That means multiple instances and broken `instanceof`. Do not mix `?bundle` addons with a separate core.
- Direct `import()` of esm.sh addons without `?bundle` worked only when the world CSP allowed esm.sh [Probe].

**Legacy non-ESM path (r147, all 200 with ACAO `*`) [Measured]:** `https://cdn.jsdelivr.net/npm/three@0.147.0/build/three.min.js`, plus under `examples/js/`: `controls/OrbitControls.js` (26,660 / 5,484), `loaders/GLTFLoader.js` (103,311 / 21,888), `environments/RoomEnvironment.js` (3,718 / 1,129), `loaders/RGBELoader.js` (12,087 / 3,526), `postprocessing/EffectComposer.js` (6,241 / 1,657), `geometries/RoundedBoxGeometry.js` (4,769 / 1,323).

[Probe] Concatenated the way `@require` does, with `.call(window)`, on a strict page: all defined on `THREE`. EffectComposer also needed `shaders/CopyShader.js`, `postprocessing/Pass.js`, `ShaderPass.js` and `MaskPass.js` first. Note r147 is 40 releases behind current, with the old color and light APIs and no `HDRLoader` or `OutputPass`.

### Inferences
- r185.1 `three.cjs` is the newest core usable through `new Function('module','exports',src)` (verified at r185.0), but its addons are ESM only, so it gives you a core without loaders. It is unminified, at 410 KB gzip. The `+esm` linker is better on every count: newer, half the size, addons included.
- The [`three.cjs` stub text](https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.cjs) signals the path is closing, so expect the file to disappear. **Flag as likely to change.**

### Gaps
- I could not find the PR or release note that announced the r186 CJS change. The closest item is the older [PR #25341](https://github.com/mrdoob/three.js/pull/25341), which proposed removing the non-ES6 builds.
- `three.min.js` at r148 to r159 and `three.cjs` before r161 were not enumerated, as they are not needed for the decision.

## What is actually permitted in a USER_SCRIPT world under TamperSloth's CSP?

### Takeaway
**Under `script-src 'self' 'unsafe-eval' 'unsafe-inline'`, you cannot load remote code as code: `import()`, `<script src>`, `blob:` and `data:` are all refused, even on a page with no CSP at all. You can `fetch()` it as text and run it with `new Function`.** Fetches come from the **page's origin** and CORS applies. Page CSP is bypassed for `fetch`, `eval` and images, but **not for Workers or WebAssembly**.

### Cited Findings

**TamperSloth facts [Code]:**
- `extension/src/background/index.ts:83-86`: default world gets `script-src 'self' 'unsafe-eval' 'unsafe-inline'` with `messaging: true`.
- `index.ts:319`: each saved script's `tsw_<id>` world gets the same.
- **`extension/src/background/browserService.ts:171`: the `evaluate` tool reconfigures the default world to `script-src 'self' 'unsafe-eval'` on every call, dropping `'unsafe-inline'`.**
- `index.ts:258-262`: agent-run scripts use `userScripts.execute` with `world: 'USER_SCRIPT'` and no `worldId`, so they share that default world.
- `extension/src/chat/lib/tools.ts:903-927`: agent scripts must contain a named function.
- `extension/public/manifest.json`: `minimum_chrome_version` 138, `host_permissions` `<all_urls>`.
- `extension/src/scripts/userscript.ts:215-218`: **a saved script runs in MAIN unless it has `@inject-into content`, `@sandbox DOM`, or a GM grant without `unsafeWindow`.** A script with no grants therefore lands in MAIN under the page's CSP.

**Doc basis [Source]:** the [userScripts docs](https://developer.chrome.com/docs/extensions/reference/api/userScripts) say `csp` sets the world's policy and defaults to the ISOLATED world's policy. `worldId` is Chrome 133+, `execute()` is Chrome 135+, and Chrome 138+ uses the per-extension Allow User Scripts toggle. `js` accepts `code` or `file`. The docs do not describe how `import()`, script injection or `fetch` behave, so the matrix below is my own measurement.

**[Probe] matrix.** "Strict" means `default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; worker-src 'self'; font-src 'self'`. Lax has no CSP.

| Operation | USER_SCRIPT, TamperSloth CSP (lax and strict) | USER_SCRIPT, `evaluate` CSP (no unsafe-inline) | MAIN, lax | MAIN, strict |
|---|---|---|---|---|
| `import('https://cdn...')` | **Refused** | Refused | Works | Refused |
| `import(page origin)` | **Refused** (`'self'` is not the page) | Refused | Works | Works |
| `import(blob:)` | **Refused** | Refused | Works | Refused |
| `import(data:)` | **Refused** | Refused | Works | Refused |
| `import('chrome-extension://<id>/war.js')` | **Works** | Works | Works | **Works** |
| `<script src="https://...">` | **Refused** | Refused | Works | Refused |
| `<script src="blob:...">` | **Refused** | Refused | Works | Refused |
| Inline `<script>` text | **Runs, in MAIN world** | Does not run | Runs | Does not run |
| `eval` / `new Function` | **Works** | Works | Works | Refused |
| `fetch()` cross-origin with CORS | **Works** | Works | Works | Refused |
| `fetch()` without CORS headers | **Fails (CORS)** | Fails | Fails | Refused |
| `fetch` then `new Function` | **Works** | Works | Works | Refused |
| `<img crossorigin>` with CORS | **Works** | Works | Works | Refused |
| `WebAssembly.compile` | Works on lax, **fails on strict** | Same | Works | Refused |
| `new Worker(blob:)` | Works on lax, **fails on strict** | Same | Works | Refused |
| `new Worker(data:)` | **Fails on strict**, refused by page `worker-src` | not run | not run | not run |
| `new Worker(cross-origin URL)` | SecurityError | SecurityError | SecurityError | SecurityError |
| `customElements` | **`null`** | `null` | Registry | Registry |

Further [Probe] results:
- **Fetch origin:** the server saw `Origin: http://localhost:8801`, the page's origin, in USER_SCRIPT, not `chrome-extension://`. Cross-origin classic `<script>` loads carried no Origin, and CORS `<img>` carried the page origin.
- **Inline scripts run in MAIN:** injected from USER_SCRIPT on strict and Trusted Types pages, the script set a `window` mark visible only in MAIN, saw a real `customElements` registry, and had no messaging API. **This is a route around the page's CSP.**
- **Trusted Types:** a page with `script-src 'self'; require-trusted-types-for 'script'` did not block `new Function` or `textContent` on a script from USER_SCRIPT. MAIN was blocked.
- **`'wasm-unsafe-eval'`** added explicitly to the world CSP did not fix WASM on the strict page; the same empty `CompileError` occurred. WASM was also blocked on the `script-src 'self'` Trusted Types page.
- **Unconfigured world** (ISOLATED default: `script-src 'self' 'wasm-unsafe-eval' 'inline-speculation-rules' http://localhost:* http://127.0.0.1:* ...`, per the console error): `eval` refused, WASM allowed on lax, `import()` allowed for localhost only. Do not read localhost test success as general success.
- **World CSP widened** to add `https://cdn.jsdelivr.net https://esm.sh blob:`: `import()` of the CDN and of `blob:` worked, even on strict. `<script src>` from jsDelivr loaded on strict too. `data:` remained refused.
  - `import(blob of three.module.min.js)` then fails with `Failed to resolve module specifier "./three.core.js"`.
  - `import(blob of +esm core)` works.
- **Import maps:** in MAIN on lax, inject map then `import('three')` gave r187. In MAIN on strict, the inline map was refused. In USER_SCRIPT with widened CSP, `Failed to resolve module specifier 'three'`, so a world cannot use one.
- **Large payloads and file injection:** 2.09 MB inline `code` through `execute` worked. `js:[{file:'vendor/iife.js'},{code}]` worked in a named USER_SCRIPT world. The second part saw globals from the first, using a small test file only.
- **Syntax errors are silent:** `execute` with `export` or static `import` inside a function returned `result: null` with no error reported to the caller.
- `chrome.runtime.getURL` is undefined in USER_SCRIPT, while `chrome.runtime.id`, `sendMessage` and `connect` exist. Build WAR URLs from the id.

**Working recipe on the current build [Probe].** Three r187, seven addons, closed shadow root, strict page, TamperSloth CSP and the `evaluate` CSP. First run 3.7 s, second run 0.9 s.

```js
// Keep this inside the agent's named function: top-level const collides on re-run in the same world.
const reg = globalThis.__tsEsm ??= new Map();
function esm(url) {
  if (reg.has(url)) return reg.get(url);
  const p = (async () => {
    let src = await (await fetch(url)).text();
    const deps = [], ns = {};
    src = src.replace(/\/\/# sourceMappingURL=.*$/m, '');
    src = src.replace(/import\s*(?:\*\s*as\s+([\w$]+)|\{([^}]*)\}|([\w$]+))\s*from\s*"([^"]+)"\s*;?/g, (_, star, names, def, spec) => {
      const i = deps.push(new URL(spec, url).href) - 1;
      if (star) return `const ${star}=__d[${i}];`;
      if (def) return `const ${def}=__d[${i}].default;`;
      const n = names.split(',').map(s => s.trim()).filter(Boolean).map(s => { const [a, b] = s.split(/\s+as\s+/); return `${a}:${b || a}`; }).join(',');
      return `const {${n}}=__d[${i}];`;
    });
    src = src.replace(/export\s+default\s+/g, '__e.default=');
    src = src.replace(/export\s*\{([^}]*)\}\s*;?/g, (_, names) => names.split(',').map(s => s.trim()).filter(Boolean).map(s => { const [a, b] = s.split(/\s+as\s+/); return `__e[${JSON.stringify(b || a)}]=${a};`; }).join(''));
    const d = await Promise.all(deps.map(esm));
    new Function('__d', '__e', '"use strict";' + src)(d, ns);
    return ns;
  })();
  reg.set(url, p);
  return p;
}
const B = 'https://cdn.jsdelivr.net/npm/three@0.187.0';
const THREE = await esm(B + '/+esm');
const {OrbitControls} = await esm(B + '/examples/jsm/controls/OrbitControls.js/+esm');
```

The probe version used a module-level `const` and a non-cached map; the `globalThis` cache above is my small adaptation and was not separately run. The same linker also loaded OGL `+esm`, `three.webgpu.js/+esm` and `three.tsl.js/+esm`.

[Probe] UMD builds loaded directly: `const m={exports:{}}; new Function('module','exports',src)(m,m.exports)` worked for Babylon 9.33.2, PlayCanvas 2.23.3 and Three r185.

### Inferences
- The linker is regex-based and tuned to jsDelivr's minified output. It passed on everything tested but could break if jsDelivr changes its bundler output, or if a matching string appears inside a file. Pin versions, and treat it as a stopgap rather than a platform.
- **The owner has a cleaner option: vendoring.** Build an IIFE of Three plus chosen addons at extension build time and inject it as `js:[{file:'vendor/three.iife.js'},{code}]`. Since file injection and WAR `import()` both worked, including from MAIN on a strict page, this avoids `eval`, the CDN and the origin leak. The agent still has "no build step". I tested file injection only with a tiny file, and did not build the real bundle.
- WAR ESM is possible but awkward: addons `import from 'three'`, and bare specifiers fail with no import map in a world, so the files would need rewriting. Prefer the IIFE.
- Agent-run scripts share the default world, so the inline-to-MAIN route works or not depending on whether `evaluate` ran first. Any design relying on it will be intermittent until `browserService.ts:171` matches `index.ts:84`.

### Gaps
- I found **no Tampermonkey or Violentmonkey report or doc** that addresses `import()` under a `userScripts` world CSP; [search](https://github.com/Tampermonkey/tampermonkey/issues/700) mostly returned older CSP threads, so the matrix is first-hand only. The [Tampermonkey docs page](https://www.tampermonkey.net/documentation.php) I could fetch returned only its navigation.
- Chrome documents none of this behaviour, so it could change without notice. **Flag as likely to change.** The WASM and Worker results especially deserve a re-test on Chrome 156.
- Why WASM fails on strict pages even with `'unsafe-eval'` in the world CSP: the error message was empty and I did not trace it in Chromium source.
- Firefox and Safari behaviour was not tested. TamperSloth is Chrome-only per its manifest, so this is low priority.

## What practical problems must a 3D userscript handle?

### Takeaway
Stay in USER_SCRIPT: it avoids nearly all CSP and library-clash problems. The remaining hazards are WASM and Worker-based decoders on strict pages (Draco, KTX2, meshopt), the shared limit of 16 WebGL contexts that **can evict the host page's own canvas**, and cleanup that must call `forceContextLoss()`, not only `dispose()`.

### Cited Findings

**CSP and assets on strict pages:**
- [Probe] `GLTFLoader` loaded a [textured GLB](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@main/Models/BoxTextured/glTF-Binary/BoxTextured.glb) in USER_SCRIPT on the strict page, including its embedded texture (256 px `ImageBitmap`). `HDRLoader` loaded a [1 K HDR](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r187/examples/textures/equirectangular/venice_sunset_1k.hdr). Both files returned 200 with ACAO `*` [Measured].
- [Probe] WASM and blob Workers fail on strict pages from USER_SCRIPT, as in the matrix.
- [Source] Three's `DRACOLoader.setDecoderConfig()` is deprecated and Draco will eventually always use WASM ([migration guide, r185](https://github.com/mrdoob/three.js/wiki/Migration-Guide)).
- [Measured] Decoder asset: [`draco_decoder.wasm`](https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/draco_decoder.wasm), 192,420 bytes, 200 with ACAO `*`.
- [Probe] **Side effect of addon `+esm`:** fetching them logged a page-level `Refused to load the script '.../+esm'` under the page's `script-src 'self'`. The likely cause is the `modulepreload` Link header above, since `ogl` and the WebGPU build logged nothing. Rendering was unaffected.

**`@require`, `@resource`, `GM_xmlhttpRequest` in TamperSloth [Code]:**
- `@require` and `@resource` are fetched at install with `credentials: "omit"`, http(s) only, 10 MB limit each (`extension/src/scripts/installUserscript.ts:17-28`). Babylon's 8.85 MB fits, narrowly. A `data:` shim URL is rejected.
- `@require` text is concatenated with the script inside a nested function (`userscriptRuntime.ts:155`, `:185-187`). So ESM syntax kills the whole script at parse time. The outer function never runs, so `SCRIPT_EXECUTION_REPORT` is not sent either.
- [Source] Violentmonkey's guide says ES modules won't work in userscripts ([guide](https://violentmonkey.github.io/guide/creating-a-userscript/)). A [community answer](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/questions/75841515/can-i-require-an-es6-module-in-greasemonkey) says only UMD/IIFE work.
- r185 `three.cjs` needs `exports` defined first: it worked with a `const module={exports:{}},exports=module.exports;` prelude [Probe]. In TamperSloth that prelude would have to be a hosted `@require`, due to the http(s)-only rule.
- `@resource` bytes are inlined as base64 in the registered code (`userscriptRuntime.ts:178`). `GM_getResourceText` decodes them, and `GM_getResourceURL` returns a `data:` URL (`:345-352`). `import(data:)` is refused, so ESM from a resource must go through the linker fed from `GM_getResourceText`. Three's `+esm` would add about 1 MB to the code on every matching page.
- `GM_xmlhttpRequest` runs `fetch` in the background (`extension/src/background/userscriptBridge.ts:80-83`), gated by `@connect` prompts, with **`credentials: "include"` unless `anonymous: true`**. `arraybuffer` and `blob` responses arrive as base64 (`userscriptRuntime.ts:475-490`).

**Shadow DOM:**
- [Probe] A closed shadow root hosting a canvas with a WebGL2 context, and the full Three stack, worked in USER_SCRIPT on strict pages.
- [Probe] `attachShadow` works, but custom elements do not. `customElements` is `null` in USER_SCRIPT, which is deliberate: Chromium's [layout test](https://chromium.googlesource.com/chromium/src/+/ef3e334a185b82752f606768ecd3f4c8083b7275/third_party/WebKit/LayoutTests/custom-elements/isolated-worlds.html) asserts it. [Community reports](https://kiwix.lema.org/stackoverflow.com_en_all_2023-11/a/71782977) describe the same for content scripts.

**`<model-viewer>` specifics [Probe]:**
- UMD in USER_SCRIPT: `TypeError: Cannot read properties of null (reading 'define')`.
- Injected as inline `<script>` from USER_SCRIPT, so it runs in MAIN: on lax and Trusted Types pages it loaded a GLB. On strict, its GLB fetch was refused by the page's `connect-src 'self'`.
- So it works in MAIN only where the host's CSP allows the asset fetch, and it needs the inline route, which agent runs lose after `evaluate` (`browserService.ts:171`).

**Clashes with a host copy of Three [Probe]:**
- With the host's `window.__THREE__='999'` and `window.THREE` set, USER_SCRIPT saw neither, no warning fired, and the host's value was untouched.
- The same load in MAIN logged `THREE.WARNING: Multiple instances of Three.js being imported.`
- A forum thread describes the same warning from mixed CJS and ESM copies ([discourse](https://discourse.threejs.org/t/threejs-cjs-and-esm-confliction-since-r137/38567)).

**WebGL context limits:**
- [Probe] Creating 24 contexts in USER_SCRIPT on a page that already had one host context: 16 stayed alive, 9 were lost (the **host's context** and the script's first 8). The console logged `Too many active WebGL contexts. Oldest context will be lost.` The limit spans worlds.
- [Source] Chromium's [WebGL source](https://chromium.googlesource.com/chromium/blink/+/master/Source/modules/webgl/WebGLRenderingContextBase.cpp) caps active contexts at 16 and force-loses the oldest. A [2013 review](https://codereview.chromium.org/14217005/) set the limit per render process. Those sources are old.
- [Source] A [2020 report](https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/61277222/how-to-determine-number-of-active-webgl-contexts) found 8 on Chrome for Android, and Stack Overflow disagrees on [scope](https://kaweah.freedombox.rocks/kiwix/stackoverflow.com_en_all_2023-11/questions/59140439/allowing-more-webgl-contexts), so test before relying on per-page.

**Cleanup [Probe]:**
- 20 Three renderers with only `renderer.dispose()`: "Too many active" warnings, and the **host's context was lost**.
- The same with `renderer.dispose(); renderer.forceContextLoss();`: no warnings, and the host's context survived.
- [Source] From r186, `Object3D` has its own `dispose()`, and on WebGPU the renderer's `dispose()` is async ([guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [releases](https://github.com/mrdoob/three.js/releases)).

**Canvas security [Probe]:**
- `<img crossorigin="anonymous">` from a CORS host loaded and read back, on the strict page too from USER_SCRIPT.
- An image without CORS tainted 2D (`getImageData` SecurityError) and `texImage2D` threw SecurityError. So a host-page image cannot become a WebGL texture unless its server sends ACAO.
- World isolation does not lift this.

### Inferences
- Agent rules to encode:
  - Stay in USER_SCRIPT, and for saved scripts add `// @inject-into content`, or they may land in MAIN.
  - Reuse one context per script, and never create contexts in a loop.
  - Prefer uncompressed GLB or procedural geometry; treat Draco, KTX2 and meshopt as unavailable on strict pages and catch failure.
  - Always set `crossOrigin='anonymous'`, and catch `SecurityError`. For a host image without CORS, fetch bytes through `GM_xmlhttpRequest` with `anonymous: true` and upload from a blob. I did not test this route.
- SPA cleanup: registered scripts only re-run on real navigations, so a script must watch URL changes itself. A workable pattern is to listen for `navigation`/`popstate`, watch the container with `MutationObserver`, and on teardown cancel the rAF, disconnect observers, dispose controls, geometry, materials, textures and render targets, then `renderer.dispose()`, `forceContextLoss()`, and remove the host. Also pause with `IntersectionObserver` when offscreen. These are design inferences beyond the dispose results above.
- Make scripts idempotent: a second run in the same world shares `globalThis`, so remove the earlier instance first. A second copy of Three loaded in the same world should trigger the multiple-instances warning, by the same mechanism as the MAIN result.

### Gaps
- The official three.js dispose page returned 404 at the two URLs I tried, so the list of disposables is not cited to a primary source.
- Mobile limits and GPU process limits were not measured. Software GL hides memory pressure, so real-GPU cost on heavy host pages is unknown.
- Actual Draco and KTX2 loaders were not run; the conclusion rests on the WASM and Worker primitives failing.
- Pointer interaction with `OrbitControls` inside a shadow root on real sites was constructed, but not exercised with real input.
- An extension-page iframe as a rendering sandbox was not tested. It would give its own CSP, but page `frame-src` could block it.

## How does Chrome Web Store policy apply, and what needs the owner's attention?

### Takeaway
The User Scripts API is an explicit exception to the remote-code ban, but **only for the code it governs and only for its documented purpose, which Chrome describes as user-provided scripts**. An AI agent choosing CDN libraries on its own initiative is a grey area I found no ruling on. Bundling Three in the package removes the question for the library itself.

### Cited Findings
- [Source] MV3 requirements: logic must be self-contained and determinable from the submission. External resources must not carry logic. Prohibited practices include loading outside scripts, `eval` of remote strings, and interpreters for remote commands ([MV3 requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)).
- [Source] Exceptions: remote logic may run only through documented APIs that allow it, namely Debugger and User Scripts, for their stated purpose, and the exemption covers only the code those APIs govern ([same page](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)).
- [Source] The API is described as required for extensions running scripts provided by the user that cannot ship in the package ([userScripts docs](https://developer.chrome.com/docs/extensions/reference/api/userScripts)). The remote-hosted-code guide calls it intended for user-supplied code in script managers, not a general substitute for `scripting.executeScript` ([guide](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)).
- [Source] Remote code there includes JavaScript and WASM loaded from outside the package; data such as JSON and CSS is excluded ([guide](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)).
- [Source] Program policies prohibit obfuscation (minification allowed), expect a single purpose, and limit data use to the disclosed purpose. Unclear behaviour can lead to rejection or removal ([policies](https://developer.chrome.com/docs/webstore/program-policies/policies)).
- [Source] Script managers have long debated this tension with Chrome ([chromium-extensions thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/hQeJzPbG-js/m/U8DSIl6IDAAJ)), and the API proposal notes injecting code outside the package as its purpose ([w3c commit](https://github.com/w3c/webextensions/commit/1d3d2adce859ce9aaaf86c3d16d424176844542e)).
- [Source] Tampermonkey historically rewrote page CSP headers to allow its script elements, which a Violentmonkey maintainer called intrusive ([Bugzilla](https://bugzilla.mozilla.org/show_bug.cgi?id=1645614)).

### Inferences

**Items for the owner, most important first:**

1. **Policy position of agent-chosen CDN code.** Hardcoding a jsDelivr URL or linker in TamperSloth's own prompts or playbooks means the extension, not the user, chose the remote code. Code inside `userScripts` is covered by the exception, but "user-provided" is a stretch, and a reviewer reading the package would see it. Lowest-risk answer: ship Three in the package. Consider asking One Stop Support, which the guide suggests for uncovered cases. **I am not a lawyer or a CWS reviewer; this is my reading of the text.**
2. **Inconsistent world CSP.** `browserService.ts:171` silently removes `'unsafe-inline'` from the default world on every `evaluate`, while `index.ts:84` sets it. Agent-run scripts share that world (`index.ts:258-262`), so inline injection depends on call order. This was not changed; it needs a decision.
3. **`'unsafe-inline'` is a page-CSP bypass into MAIN.** From USER_SCRIPT, inline `<script>` ran in the page's world on strict and Trusted Types pages. It may be intended, as it already makes page-world access easier, but it should be a conscious choice.
4. **Do not widen the world CSP with CDN hosts or `blob:` to make `import()` work.** It works, but also lets `<script src>` from those hosts execute on strict pages, and jsDelivr serves arbitrary npm and GitHub content. Prefer the linker or vendoring.
5. **Privacy.** Page-world `fetch` to a CDN sends the current site's origin to jsDelivr [Probe, on a local server]. Vendoring avoids this. The disclosed data-use text should cover it if CDN loading ships.
6. **Possible CSP reports to sites.** Addon `+esm` fetches logged a page CSP refusal. A site with `report-to` would probably receive it, which reveals the script's activity. I did not test report delivery.
7. **Integrity.** `+esm` output cannot use SRI by jsDelivr's own header note. Pinned responses are immutable-cached, but the CDN is still trusted. For saved scripts, `@resource` pins bytes at install; for agent runs, a hash check before `new Function` is possible.
8. **Silent failure.** A `@require` with ESM syntax produces no execution report. Consider an install-time warning when a `@require` body contains top-level `export` or `import`.

### Gaps
- I found **no CWS statement on AI-generated code run through the User Scripts API**, and no 2026 change to this policy in search. Chrome's policy pages carry no date in what I read. **Flag as likely to change.**
- I found no public record of a review rejection or approval for this pattern.
