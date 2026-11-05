# Open 3D assets loadable by URL at runtime, and browser-usable open 3D generation (tested 2026-11-04)

Test method, applying to everything marked "tested": run 2026-11-04, 21:37 to 21:48 UTC, from one Windows machine, using curl and Python `urllib` with `Origin: https://example.com`. Requests were HEAD or GET with `Range: bytes=0-0`, and each redirect hop was checked by hand. No asset was saved to the repo. These are header checks, not real browser fetches: nothing was run through `fetch()`, a three.js loader, or `@gradio/client` in an actual browser or on a CSP-protected page. "Docs say" marks a claim that was not tested.

Size caveat, tested: jsDelivr `Range` responses and `Accept-Encoding: br` responses report the brotli size, and HEAD returned no Content-Length. Example: `Horse.glb` is 181,808 B with `identity` and 55,118 B with `br`. Tables label sizes "raw" (uncompressed file) or "br" (jsDelivr wire size).

## Which providers can be fetched directly by URL: license, CORS, URL stability, terms

### Takeaway
Three sources really work as keyless, CORS-open runtime URLs: Poly Haven (CC0, mutable paths), jsDelivr or raw GitHub mirrors of Khronos and three.js (immutable when pinned, but licenses vary per file), and Poly Pizza's static GLBs (per-model license, and finding the URL is the hard part). ambientCG works only through a hashed URL and ships ZIPs. Kenney, Quaternius and Sketchfab are not usable as runtime URLs even though their licenses are fine.

### Cited Findings

**Provider matrix (tested unless noted)**

| Provider | License | Keyless direct URL | ACAO | Content type | Cache-Control | Stability |
|---|---|---|---|---|---|---|
| Poly Haven `dl.polyhaven.org` | CC0 | Yes, 200 | `*` | `image/vnd.radiance` or `application/octet-stream` for `.hdr`, `image/jpeg` for textures | `max-age=14400` | Unversioned path, contents can change |
| Poly Haven `api.polyhaven.com` | Assets CC0, credit line requested for API | Yes, 200 | `*` | JSON | not recorded | Returns md5 and size per file |
| jsDelivr `gh/KhronosGroup/glTF-Sample-Assets@<sha>` | Per model | Yes, 206 | `*` | `model/gltf-binary` | `public, max-age=31536000, s-maxage=31536000, immutable` | Best: commit pinned |
| jsDelivr `gh/mrdoob/three.js@r170` | Assets vary per file (see below) | Yes, 206 | `*` | `model/gltf-binary`, `application/octet-stream` for `.hdr` | Same immutable header | Tag pinned |
| jsDelivr `npm/three@0.170.0/examples/textures/...` | n/a | **No, 404** | `*` | text | `max-age=86400` | The npm path does not serve these textures; use `gh/` |
| jsDelivr `npm/three@0.170.0/examples/jsm/libs/...` | Not re-read (library code) | Yes, 206 | `*` | `application/wasm`, JS | Immutable | Good for decoders |
| `raw.githubusercontent.com/<repo>/<sha>/...` | As repo | Yes, 200/206 | `*` | `application/octet-stream` | `max-age=300` | Pinned, short cache |
| `github.com/.../raw/<sha>/...` | As repo | 302 to raw | **hop has empty ACAO** | n/a | `no-cache` | Avoid in CORS mode |
| `threejs.org/examples/...` | Varies | Yes, 200 | `*` | correct | `max-age=600` | Mutable; follows latest site |
| `modelviewer.dev/shared-assets/...` | Not checked | Yes, 206 | `*` | `model/gltf-binary` | `max-age=600` | Mutable |
| ambientCG `ambientcg.com/get?file=...` | CC0 | 302 | **none on the first hop** | n/a | n/a | Browser CORS should fail at this hop |
| ambientCG `acg-download.struffelproductions.com/.../<id>_<hash>/...zip` | CC0 | Yes, 206 | reflects Origin | `application/zip` | `max-age=57600` | Undocumented hash in path |
| ambientCG API `ambientcg.com/api/v2`, `/api/v3` | n/a | 200 | **none** | JSON | none | Not callable from a page without a CORS-bypassing fetch |
| Kenney `kenney.nl` | CC0 | **No** (see below) | none | HTML | n/a | No stable file URL found |
| Quaternius `quaternius.com` | CC0 per site | **No file URLs** | `*` on HTML | HTML | `max-age=600` | Pack pages point to Google Drive and Patreon |
| Poly Pizza `static.poly.pizza/<uuid>.glb` | Per model | Yes, 206 | `*` | `gltf-binary` or `binary/octet-stream` | `max-age=604800` | UUID path, looks stable, no documented guarantee |
| Poly Pizza `api.poly.pizza/v1/search/tree` | n/a | **401** | none | JSON | n/a | Key required |
| Sketchfab search API | Filter `license=cc0` | Yes, GET 200 (HEAD returned 401) | reflects Origin | JSON | `no-store` on the 401 | Metadata only |
| Sketchfab `/v3/models/<uid>/download` | n/a | **401** | reflects Origin | JSON | n/a | Auth required, so no keyless model file |
| Smithsonian Open Access API | not checked | **403 `API_KEY_MISSING`** | `*` | JSON | n/a | Key required |
| PMNDRS Market `market.pmnd.rs`, `api.pmnd.rs` | n/a | **404 `DEPLOYMENT_NOT_FOUND`** | none | text | n/a | Appears dead; older `market-assets` URL failed DNS |
| `github.khronos.org/glTF-Sample-Assets/Models/...` | n/a | **404** on the Avocado path | `*` | HTML | n/a | Do not use |

**Poly Haven**
- Assets are CC0, attribution is not required, and use for any purpose including commercial is allowed. Other site content (logos, example renders, text) needs permission, and the Terms prohibit scraping and data mining without permission — [Poly Haven license](https://polyhaven.com/license).
- The API is free for any purpose. Projects using the live API are asked to credit it with a short line, given as "Powered by Poly Haven" — [Public-API README](https://raw.githubusercontent.com/Poly-Haven/Public-API/master/README.md).
- Tested catalogue counts: 997 HDRIs, 869 textures, 521 models — [api.polyhaven.com/assets](https://api.polyhaven.com/assets?t=hdris).
- No rate limit, hotlinking or User-Agent rule appears on the license page, in the README, or in the API's `swagger.json` (searched by keyword) — [license](https://polyhaven.com/license), [swagger](https://api.polyhaven.com/api-docs/swagger.json). The guessed `TOS.md` URL returned 404.
- **Paths are mutable (tested evidence):** `venice_sunset_1k.hdr` is 1,440,400 B on [Poly Haven](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr) and 1,397,783 B in the [three.js r170 copy](https://threejs.org/examples/textures/equirectangular/venice_sunset_1k.hdr), under the same filename.
- **Model layout trap (tested):** the API's `include` map for `rock_moss_set_01` 1k keys files as relative paths like `textures/..._nor_gl_1k.jpg` but serves them from `Models/jpg/1k/...`, and the `.bin` comes from `Models/gltf/8k/...`. So the served tree does not match the `.gltf`'s expected layout — [files API](https://api.polyhaven.com/files/rock_moss_set_01). The model is 9,987 B of glTF plus 4 included files totalling 1,927,078 B.
- Textures also ship as separate JPG maps, which means no unzip step — [files API](https://api.polyhaven.com/files/brick_wall_001).

**Khronos glTF Sample Assets**
- Licenses vary per model and live in each `metadata.json` (tested on commit `8f492390ddc7a2ae221a1369ef560589cf8c70fb`):
  - CC0: Avocado, Lantern, BoomBox, WaterBottle, ToyCar
  - CC-BY 4.0: Box (Cesium), DamagedHelmet (the "rebuild and conversion" entry credits ctxwing; the file has further entries that were cut off in my output, so check the full `legal` list)
  - **SCEA Shared Source License:** Duck, which is not CC0 despite being the classic example
  - Source: [Box metadata example](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Box/metadata.json)
- Most GLBs carry no license in the file: `asset.copyright` was absent on Box, Duck, DamagedHelmet, Avocado, Lantern, BoomBox and WaterBottle. ToyCar is the exception and states CC0 inline (tested, GLB JSON chunk read by range request).

**three.js example assets**
- Licenses are not uniform, and the mix is easy to miss:
  - RobotExpressive: CC0 1.0, model by Tomás Laulhé, modified by Don McCurdy — [README](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/RobotExpressive/README.md)
  - LittlestTokyo: described as "CC Attribution" — [example page](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/webgl_animation_keyframes.html)
  - Soldier: credited to mixamo.com, no open license stated there — [example page](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/webgl_animation_skinning_blending.html)
  - IridescentDishWithOlives: CC BY 4.0, Wayfair, stated in the GLB's own `asset.copyright` (tested)
- The npm package path for `examples/textures/...` returned 404, while the same file under `gh/mrdoob/three.js@r170` returned 200 (tested).

**jsDelivr**
- Terms (effective date shown: October 5, 2026): soft limit of 10,000 actively accessed files per repository and 100,000 for GitHub proxy projects, hard file and package limits with no numbers given, general file or media hosting prohibited, no availability guarantee — [Terms of Use](https://raw.githubusercontent.com/jsdelivr/jsdelivr/master/Terms%20of%20Use.md).
- An older project README gives 50 MB per package and 20 MB per GitHub file as default limits; this could be out of date — [jimaek/jsdelivr](https://github.com/jimaek/jsdelivr).
- Tested: the data API refused `gh/nasa/NASA-3D-Resources@master` with "Package size exceeded the configured limit of 50 MB", yet the README file from that same repo returned 206 — [data API](https://data.jsdelivr.com/v1/packages/gh/nasa/NASA-3D-Resources@master). Large repos like Khronos and three.js served files without trouble, so the limit evidently does not block every single-file request. The rule's mechanism is not established.
- Tested: branch URLs get a much shorter edge cache (`@master`: `max-age=604800, s-maxage=43200`), while tag and SHA URLs got `immutable`.
- Tested reliability blip: the first request to the model-viewer Astronaut on jsDelivr failed with a connection reset (WinError 10054); the retry returned 206 at 2,725,814 B (br).

**GitHub raw**
- GitHub announced updated unauthenticated limits on 2025-05-08, explicitly covering downloads from raw.githubusercontent.com, without numbers in the sources I could read — [GitHub changelog](https://github.blog/changelog/2025-05-08-updated-rate-limits-for-unauthenticated-requests/). Users reported 429s afterwards — [community discussion](https://github.com/orgs/community/discussions/159123). A figure of about 5,000 requests per hour per IP predates that change and is unverified — [Eclipse ticket](https://gitlab.eclipse.org/eclipsefdn/helpdesk/-/issues/912).

**ambientCG**
- All assets are CC0 and credit is optional. The docs recommend linking to asset pages rather than files — [ambientCG license](https://docs.ambientcg.com/license).
- Tested: delivery is ZIP (`Bricks097_1K-JPG.zip` 5,172,084 B, `Ground037_1K-JPG.zip` 10,574,958 B). A guessed non-hashed path returned 404, and the hash (`Bricks097_Me9gjfCa`) only appears through the redirect.
- API terms are said to exist separately, per a third-party crate's documentation, but I did not find them — [assetforge docs](https://docs.rs/assetforge).

**Kenney**
- Assets are CC0, attribution is optional, and the logo is reserved — [Kenney support](https://kenney.nl/support). That page does not address hotlinking.
- Tested: default curl user agent got 403 from `kenney.nl`; a browser user agent got 200. An old ZIP URL redirected to the HTML asset page. The asset page contains no ZIP URL in its HTML, because the download sits behind an inline dialog. No ACAO on any response.

**Quaternius**
- Site metadata states CC0 — [quaternius.com](https://quaternius.com/).
- Tested: no `.zip`, `.glb` or `.gltf` links on the home page, and a sample pack page links to Google Drive and Patreon — [pack page](https://quaternius.com/packs/ultimatemodularruins.html). Google Drive is not a viable runtime host.

**Poly Pizza**
- Tested: API returned 401 without a key. A third-party doc says it needs a free-account token in `X-Auth-Token` — [skills.sh](https://skills.sh/editframe/skills/poly-pizza-api).
- The site's fact sheet says the API is free for hobby use and pay-as-you-go for commercial use — [press page](https://poly.pizza/docs/press). That page's age is unknown, and it does not cover hotlinking.
- Tested: model pages expose keyless `static.poly.pizza/<uuid>.glb` URLs with `ACAO: *`. Licenses vary (CC0 1.0 and CC-BY 3.0 seen on pages) — [example CC0 page](https://poly.pizza/m/5EGWBMpuXq). A third-party listing also mentions CC-BY-SA and CC-BY-NC, so each model's field must be read — [LobeHub listing](https://lobehub.com/en/mcp/matthewhallcom-polypizza-mcp).

**Sketchfab**
- Tested: the search API answered keyless with CC0 filtering (first hit: uid `8176f16fab554f8ba2b28c559bbd15c9`, "CC0 Public Domain", downloadable), but `/download` returned `401 Authentication credentials were not provided` — [search](https://api.sketchfab.com/v3/search?type=models&license=cc0&downloadable=true&count=1). Keyless file loading is not possible.

### Inferences
- Default order for production URLs: jsDelivr `gh/` with a commit SHA, then raw GitHub with a SHA, then Poly Haven's direct path. The SHA is the only pin here that cannot move.
- Loading Poly Haven's multi-file glTF needs a URL rewrite (for example three's `LoadingManager.setURLModifier`, not tested) because of the layout mismatch. HDRIs and JPG textures are simpler.
- A userscript with a CORS-bypassing request API could reach ambientCG's API and first hop, which a plain page `fetch` should not. Not tested in TamperSloth. It still gets a ZIP, which needs an unzip library.
- Mirroring one chosen CC0 file in the owner's own GitHub repo and serving it by SHA through jsDelivr would give a stable URL for it. Redistribution is permitted by CC0, and jsDelivr's ban on general media hosting is a matter of scale, though the terms do not set a threshold. This is my reading, not a jsDelivr statement.
- The three.js repo should be treated as "check per file", not as an MIT asset library.

### Gaps
- No provider's terms explicitly address hotlinking of files. Poly Haven, Kenney and ambientCG are silent on the pages I could read, so "not prohibited" is the strongest available claim and is not permission.
- Poly Haven's full Terms of Service was not retrieved. The README reportedly links to one, but my guessed URL returned 404 and a link search found none.
- No published numeric rate limits for Poly Haven, Poly Pizza's static host, or raw GitHub. No 429s were seen, but this was a light test.
- Sketchfab's terms and Poly Pizza's official API docs were not read; `poly.pizza/docs/api` returned 404.
- Licenses for Horse, Parrot, Flamingo, coffeemat and the model-viewer Astronaut were not confirmed. `asset.copyright` is absent on the first three, so treat them as unknown.
- NASA and Smithsonian model files were not tested. NASA usage rules were not read. `3d-api.si.edu` returned an HTML page with a `/TSPD/` loader, which looks like bot mitigation.

## Ready-to-use asset URLs (tested 2026-11-04)

### Takeaway
All URLs below answered 200 or 206 with permissive CORS. The pinned choices are the two three.js HDRIs and the RobotExpressive model, which together are the safest starting kit; Poly Haven has more variety but mutable paths. Only the listed compressed models need decoders, and none of the recommended set does.

### Cited Findings

Khronos prefix: `https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/`
three.js prefix: `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/`

**HDRIs, 1k**

| Asset | URL | Size | ACAO | Content type | License |
|---|---|---|---|---|---|
| Venice Sunset | [three.js prefix + `textures/equirectangular/venice_sunset_1k.hdr`](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/equirectangular/venice_sunset_1k.hdr) | 1,397,783 raw, 963,946 br | `*` | octet-stream | CC0 by provenance (see inference) |
| Royal Esplanade | [three.js prefix + `textures/equirectangular/royal_esplanade_1k.hdr`](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/textures/equirectangular/royal_esplanade_1k.hdr) | 1,243,218 br | `*` | octet-stream | CC0 by provenance (see inference) |
| Studio Small 09 | [dl.polyhaven.org](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr) | 1,615,248 | `*` | `image/vnd.radiance` | CC0 |
| Kloofendal Partly Cloudy (sky only) | [dl.polyhaven.org](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr) | 1,435,119 | `*` | octet-stream | CC0 |
| Moonless Golf (night) | [dl.polyhaven.org](https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/moonless_golf_1k.hdr) | 1,672,754 | `*` | octet-stream | CC0 |

Also tested: `studio_small_09_1k.exr` at 1,319,434 B, `image/aces`, ACAO `*`.

**Models, no decoder required (`extensionsRequired` absent, tested by reading the GLB JSON chunk)**

| Asset | URL | Size | Notes | License |
|---|---|---|---|---|
| RobotExpressive | [three.js prefix + `models/gltf/RobotExpressive/RobotExpressive.glb`](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb) | 463,988 raw, 125,388 br | 14 animations, 14 meshes, no images | [CC0 1.0](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/RobotExpressive/README.md) |
| Poly Pizza "Adventurer" | [static.poly.pizza](https://static.poly.pizza/bbe369ee-a686-42c7-adad-14356f5f2f15.glb) | 1,944,116 | `Content-Type: gltf-binary` (nonstandard); structure not read | [CC0 1.0 per page](https://poly.pizza/m/5EGWBMpuXq) |
| Avocado | [Khronos prefix + `Avocado/glTF-Binary/Avocado.glb`](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Avocado/glTF-Binary/Avocado.glb) | 8,110,040 raw, 8,094,277 br | 1 mesh, 3 images; heavy for what it is | [CC0](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Avocado/metadata.json) |
| Lantern | [Khronos prefix + `Lantern/glTF-Binary/Lantern.glb`](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Lantern/glTF-Binary/Lantern.glb) | 9,564,264 raw, 9,393,642 br | 3 meshes, 4 images | [CC0](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Lantern/metadata.json) |
| Box (test geometry) | [Khronos prefix + `Box/glTF-Binary/Box.glb`](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Box/glTF-Binary/Box.glb) | 1,664 raw, 608 br | No images | [CC-BY 4.0, Cesium](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Box/metadata.json) |
| DamagedHelmet | [Khronos prefix + `DamagedHelmet/glTF-Binary/DamagedHelmet.glb`](https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb) | 3,773,916 raw, 3,280,947 br | 5 images, classic PBR showcase | [CC-BY 4.0, attribution required](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/DamagedHelmet/metadata.json) |

Tested but not recommended on license grounds: Duck at 120,484 B raw (SCEA license). ToyCar at 5,422,412 B (CC0, 8 images, uses clearcoat, transmission and sheen but requires none) checked through raw GitHub only.

**Models needing decoders (tested from `extensionsRequired`)**

| Asset | Requires | Size | License |
|---|---|---|---|
| [LittlestTokyo.glb](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/LittlestTokyo.glb) | `KHR_draco_mesh_compression` | 4,133,072 raw, 3,526,281 br | "CC Attribution" |
| [IridescentDishWithOlives.glb](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/IridescentDishWithOlives.glb) | `KHR_draco_mesh_compression` | 4,095,320 raw | CC BY 4.0, Wayfair |
| [coffeemat.glb](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/coffeemat.glb) | `KHR_mesh_quantization`, `EXT_meshopt_compression`, `KHR_texture_basisu` | 4,780,672 raw | Not confirmed |

The extension data above is from raw GitHub at tag r170. CORS on `IridescentDishWithOlives` and `coffeemat` was not recorded individually; other files on that host and tag returned `*`.

**Decoders (tested, ACAO `*` on all, sizes as reported, jsDelivr ones are br)**
- [draco_decoder.wasm via three@0.170.0](https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/draco_decoder.wasm): 59,333 B br, `application/wasm`
- [meshopt_decoder.module.js](https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/meshopt_decoder.module.js): 6,426 B br
- [basis_transcoder.wasm](https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/basis/basis_transcoder.wasm): 245,398 B br
- [gstatic Draco 1.5.7](https://www.gstatic.com/draco/versioned/decoders/1.5.7/draco_decoder.wasm): 285,948 B, `max-age=31536000`

**PBR texture sets**

| Set | URL | Size | License |
|---|---|---|---|
| Poly Haven `brick_wall_001` 1k, base color | [diffuse](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diffuse_1k.jpg) | 574,381 | CC0 |
| Normal (OpenGL convention) | [nor_gl](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_nor_gl_1k.jpg) | 295,279 | CC0 |
| AO, roughness, metalness packed | [arm](https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_arm_1k.jpg) | 123,384 | CC0 |
| ambientCG Bricks097 1K, all maps | [ZIP (hashed path)](https://acg-download.struffelproductions.com/file/ambientCG-Web/download/Bricks097_Me9gjfCa/Bricks097_1K-JPG.zip) | 5,172,084 | CC0 |

The three Poly Haven maps total 993,044 B. All returned `image/jpeg`, ACAO `*`, `max-age=14400`. API-reported sizes for `brick_wall_001` maps not fetched directly: rough 211,093, AO 269,071, displacement 172,991 — [files API](https://api.polyhaven.com/files/brick_wall_001).

### Inferences
- Venice Sunset and Royal Esplanade share names with Poly Haven's CC0 assets, and both also exist on `dl.polyhaven.org`, so CC0 is likely. The r170 copy states no license at file level, and the byte counts differ. For strict provenance use the Poly Haven URL and accept that it can change.
- Pinned HDRI copy for `venice_sunset` also exists at `pmndrs/drei-assets` by commit `456060a26bbeb8fdf79326f224b6d99b8bcce736` (tested 206 at the same 963,946 B br), if a SHA pin is wanted over a tag.
- Brotli helps meshes and animation a lot (Horse is 70% smaller, RobotExpressive 73%) and helps JPEG-heavy GLBs almost none (Avocado 0.2%). Budget by image count, not by geometry.
- Textures dominate model weight in this list: Khronos showcase GLBs run 8 to 13 MB, which is large for a userscript. RobotExpressive has no textures and is under 0.5 MB raw.

### Gaps
- URLs were not rendered, so visual suitability, scale, orientation and correct decoding in three.js are unverified.
- Exact raw size of the `royal_esplanade` r170 copy not measured.
- ToyCar, Corset, BoomBox, WaterBottle and BarramundiFish had partial checks only. jsDelivr br sizes for the latter: BoomBox 10,513,764, WaterBottle 8,818,334, BarramundiFish 12,442,958, Corset 13,175,012 (all ACAO `*`).
- Whether jsDelivr's br size holds for every browser or region. It depends on `Accept-Encoding`.

## Can open 3D generation be used from browser JS without local install or keys?

### Takeaway
It technically works, but it isn't dependable enough to build on. Many Spaces are up and CORS-open, and one anonymous Shap-E call returned a real GLB in about 2 seconds, yet 6 of the 20 probed Space entries were down, including well-known ones (TripoSR, the original TRELLIS). Anonymous users get only 2 minutes of GPU a day, and there's no SLA. Use it at most as an opt-in, user-triggered extra with a non-generated fallback, never as a required part of a page. In-browser generation is impractical: nothing in transformers.js does it, and the realistic option downloads about 485 MB.

### Cited Findings

**Live Space status (tested 2026-11-04 via `huggingface.co/api/spaces/<id>` and `<host>/config`, read-only)**

| Space | Stage | Hardware | Gradio | `/config` | Card license | Last modified |
|---|---|---|---|---|---|---|
| microsoft/TRELLIS.2 | RUNNING | zero-a10g | 6.1.0 | 200 | MIT | 2026-05-20 |
| trellis-community/TRELLIS | RUNNING | zero-a10g | 5.34.2 | 200 | MIT | 2026-05-24 |
| tencent/Hunyuan3D-2 | RUNNING | zero-a10g | 4.44.0 | 200 | none on card | 2025-06-02 |
| tencent/Hunyuan3D-2.1 | RUNNING | zero-a10g | 4.44.0 | 200 | none on card | 2025-08-11 |
| tencent/Hunyuan3D-2mini-Turbo | RUNNING | zero-a10g | 4.44.1 | 200 | none on card | 2026-07-14 |
| tencent/Hunyuan3D-2mv | RUNNING | zero-a10g | 4.44.1 | 200 | none on card | 2025-09-23 |
| TencentARC/InstantMesh | RUNNING | zero-a10g | 5.50.0 | 200 | Apache-2.0 | 2026-05-22 |
| stabilityai/stable-fast-3d | RUNNING | zero-a10g | 4.41.0 | 200 | "other" | 2026-05-23 |
| VAST-AI/TripoSG | RUNNING | zero-a10g | 5.23.1 | 200 | none on card | 2025-05-15 |
| VAST-AI/MIDI-3D | RUNNING | zero-a10g | 4.44.1 | 200 | Apache-2.0 | 2026-07-14 |
| ashawkey/LGM | RUNNING | zero-a10g | 5.49.1 | 200 | MIT | 2026-05-26 |
| dylanebert/LGM-mini | RUNNING | zero-a10g | 5.49.1 | 200 | MIT | 2026-05-26 |
| hysts/Shap-E | RUNNING | zero-a10g | 6.15.0 | 200 | MIT | 2026-05-27 |
| frogleo/Image-to-3D | RUNNING | zero-a10g | 4.44.1 | 200 | none on card | 2026-05-14 |
| **stabilityai/TripoSR** | **RUNTIME_ERROR** | requested zero-a10g | n/a | 503 | MIT | 2026-05-24 |
| **microsoft/TRELLIS** | **CONFIG_ERROR** | requested zero-a10g | n/a | 503 | MIT | 2025-06-05 |
| **JeffreyXiang/TRELLIS** | **CONFIG_ERROR**, same host as microsoft/TRELLIS | as above | n/a | 503 | MIT | 2025-06-05 |
| **tencent/Hunyuan3D-1** | **RUNTIME_ERROR** | requested l40sx1 | n/a | 503 | none on card | 2025-09-16 |
| **stabilityai/stable-point-aware-3d** | **BUILD_ERROR** | requested l4x1 | n/a | 503 | none on card | 2026-04-28 |
| **Zhengyi/CRM** | **RUNTIME_ERROR** | requested zero-a10g | n/a | 503 | MIT | 2025-10-05 |

Totals: 14 running and 6 in error, with one error row being the same host listed twice. The 503 body says the Space is in error. Sources: [TRELLIS.2 API record](https://huggingface.co/api/spaces/microsoft/TRELLIS.2), [TripoSR API record](https://huggingface.co/api/spaces/stabilityai/TripoSR). `openai/shap-e` and `Wan-AI/Wan-3D` were guessed IDs and returned 401, so they say nothing about availability.

HF search for similar names showed the same pattern among community Spaces: many `RUNTIME_ERROR`, `CONFIG_ERROR` or `PAUSED` entries, for example under "triposr" 4 of 6 were broken — [Spaces API](https://huggingface.co/api/spaces?search=triposr&sort=likes&direction=-1&limit=6).

**CORS (tested)**
- `/config` reflected the `Origin` as ACAO on every Space, including 503s.
- Preflight on `hysts-shap-e` `/gradio_api/call/text-to-3d` and on `microsoft-trellis-2` `/gradio_api/queue/join` returned 200 with `access-control-allow-methods: POST`, `access-control-allow-headers: content-type`, reflected origin, `max-age: 600`.

**Output and API shape (tested from `/gradio_api/info` or `/info`; paths differ by Gradio major version)**
- Hunyuan3D-2 `/shape_generation`: returns File, Html, Mesh Stats Json, Seed.
- TRELLIS.2 is multi-step and session-bound: `/start_session`, `/image_to_3d` (returns Html preview), then `/extract_glb`, which takes only `decimation_target` and `texture_size` and returns Model3d. So it can't be a single stateless call.
- trellis-community/TRELLIS `/generate_and_extract_glb`: Video, Litmodel3d, Downloadbutton.
- InstantMesh: `/preprocess`, `/generate_mvs`, `/make3d`, returning OBJ and GLB.
- stable-fast-3d `/run_button`: Image plus Litmodel3d.
- Shap-E `/text-to-3d` (`prompt, seed, guidance_scale, num_inference_steps`): Model3d. Hunyuan3D-2's `/shape_generation` also has a `caption` parameter alongside image inputs, though I did not test it. TRELLIS, InstantMesh and stable-fast-3d take images.

**Single live generation test: one job only, anonymous, on hysts/Shap-E, prompt "a small red chair"**
- POST returned an `event_id` in 0.7 s; the SSE `complete` event arrived at 2.2 s total with a `.glb` file URL under `/gradio_api/file=/tmp/gradio/...` — [Space](https://hysts-shap-e.hf.space).
- The file was 1,169,056 B, began with the `glTF` magic bytes, `Content-Type: application/octet-stream`, `Content-Disposition: attachment`, reflected ACAO. It was fetched once to a temp file to check those bytes and then deleted.
- First attempt to read that file from Python timed out at the 25 s read limit, and a later curl took 2.8 s.
- Quality not assessed. One sample on the simplest model says nothing about TRELLIS or Hunyuan latency.
- `microsoft-trellis-2` `/gradio_api/queue/status` showed `queue_size: 0` at test time. `tencent-hunyuan3d-2` returned 404 at that path, consistent with its Gradio 4 path layout.

**Quotas and limits**
- Daily ZeroGPU quota: unauthenticated 2 minutes (low queue priority), free account 5 minutes, PRO and Team 40 minutes, Enterprise 60. It resets 24 hours after first use, and remaining quota affects queue priority. Default GPU duration is 60 s, and `xlarge` costs double — [ZeroGPU docs](https://huggingface.co/docs/hub/spaces-zerogpu). A search-result summary gave 3.5 and 25 minutes, which conflicts; I took the live page's figures. They have clearly changed before and may again.
- Spaces' `gcTimeout` read 172800 s (48 h) for ZeroGPU Spaces and 3600 or 86400 for others (tested). Idle Spaces can therefore be asleep on first call.
- Calls without the `X-IP-Token` header are rate limited as unauthenticated — [Gradio docs](https://gradio.app/main/docs/python-client/using-zero-gpu-spaces). A Space commit message claims a proxy injects this header on browser requests but not raw JS `fetch()`, and that the token lasts about 170 s; that is one author's observation — [commit](https://huggingface.co/spaces/JackIsNotInTheBox/Generate_Audio_for_Video/commit/8b3b1910e115051aeadffb6ce6be3fbe6d160074).
- Hub limits for anonymous users, per IP over 5 minutes as of September 2025: 500 API, 3,000 resolver, 100 page requests, subject to change. HTTP 429 when exceeded — [HF rate limits](https://huggingface.co/docs/hub/rate-limits). That page does not state these apply to `*.hf.space`.
- The Gradio JS client can be imported from jsDelivr, the docs advise pinning a version, public Spaces may be rate limited, and `Client.duplicate` makes a private copy billed to the user's account when GPUs are used, which breaks the "no key, no paid" constraint — [Gradio JS client guide](https://www.gradio.app/guides/getting-started-with-the-js-client).
- Tested: `@gradio/client` is 2.7.2, ISC license — [npm](https://registry.npmjs.org/@gradio/client/latest). `dist/index.min.js` at that version is 66,832 B br, and `dist/browser.js` is 19,449 B br, both ACAO `*`.

**Licenses beyond the Space card**
- Hunyuan3D-2 uses the Tencent Hunyuan 3D 2.0 Community License: excludes the EU, UK and South Korea, requires a separate license over 1 million monthly active users, and prohibits using Outputs to improve other AI models — [LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2/main/LICENSE). The owner should check this against where users are.
- Output rights for TRELLIS, InstantMesh and Shap-E were read only from Space cards, which describe the demo rather than the output.

**In-browser inference**
- transformers.js supported-task tables list no image-to-3D or 3D generation task. The nearest is `depth-estimation`, which outputs depth, not a mesh. WebGPU is supported with `device: 'webgpu'` and the docs warn it is still experimental in many browsers — [transformers.js docs](https://huggingface.co/docs/transformers.js/en/index).
- TripoSR ONNX WebGPU exists outside transformers.js, via onnxruntime-web: tested `triplane_q8.onnx.data` 483,785,728 B plus `triplane_q8.onnx` 885,712 B and `decoder.onnx` 173,796 B; the resolver returned ACAO `*` — [HF model tree](https://huggingface.co/api/models/cgb/triposr-onnx-webgpu/tree/main). The card states MIT plus Apache-2.0. It requires cut-out input on mid-grey, and leaves `grid_sample` and mesh extraction to the caller, with no timings published — [model card](https://huggingface.co/cgb/triposr-onnx-webgpu).
- TripoSplat WebGPU outputs Gaussian splats rather than meshes, has about a 6.47 GB bundle, and its author says it isn't production-ready — [model page](https://huggingface.co/Yosun/TripoSplat-WebGPU/).

### Inferences
- **Practicality judgment: not suitable as a dependency.** Reasons: Spaces fail with no notice (including Stability's own TripoSR, 835 likes), each is a third party's demo that can change endpoints, three different Gradio major versions are in play, and 2 GPU-minutes a day could cover just a few jobs when a default duration is 60 s, and possibly only one or two (the exact charge per job isn't documented in what I read).
- **If offered at all:** a user-pressed "generate" action only, tried against an ordered list of Spaces after reading `/config`, with visible progress, a timeout, and a code-built or CC0 fallback. Fetch the GLB right after completion rather than storing its URL, because `/tmp/gradio/...` suggests the file is temporary (not tested over time).
- Best first candidates for an image-to-3D attempt: Hunyuan3D-2mini-Turbo (config lists `shape_generation`; its parameters were read only on Hunyuan3D-2) or trellis-community/TRELLIS (`generate_and_extract_glb`, though it also exposes session endpoints), subject to the Hunyuan territory limits. For text input, Shap-E is the only one directly verified working, and its quality is unjudged.
- A userscript shipping generated output into many sites would mostly send each visitor's IP-bucketed quota, but people on shared IPs could compete for one bucket. HF forum and docs wording suggests IP-based fallback, yet this is not officially detailed.
- A ~485 MB model download is effectively a local model install, even though it runs on "normal fetch" and browser cache. It should be ruled out under the owner's constraints. TripoSplat's 6.47 GB is out of the question.
- Depth estimation with transformers.js could give a depth-parallax effect from a photo, but that is not 3D generation, and the model size wasn't checked.

### Gaps
- `@gradio/client` was not run in a real browser against any Space, and not on a strict-CSP page, so end-to-end browser behaviour including `X-IP-Token` handling is unverified.
- Latency for TRELLIS.2, Hunyuan, InstantMesh and SF3D was not measured, because job submission was kept to one. Queue time under load is unknown.
- How anonymous ZeroGPU quota is attributed (per IP or otherwise) from a third-party page has no official statement I could find.
- Actual quota charge per job, and the response format on quota exhaustion, were not observed.
- The `zero-a10g` hardware label from the API disagrees with the docs' RTX Pro 6000 description, and I found no explanation.
- The stable-fast-3d "other" license text and the licenses on Spaces with no card license were not read.
- Space status is one point-in-time snapshot. Sleep and wake duration was not observed because every RUNNING Space answered `/config` in 0.9 to 3.1 s.

## When does loading an asset beat building it in code?

### Takeaway
Load image-based lighting, photographic materials and rigged characters, because code cannot match them cheaply. Build abstract, branded, small or must-always-work visuals in code. Either way, the page must render acceptably before and without the asset, because every runtime URL can fail.

### Cited Findings
- Real sizes to budget against (tested): 1k HDRI 1.4 to 1.7 MB raw; 3-map 1k PBR set about 1 MB; rigged animated character 464 KB raw; showcase PBR GLB 8 to 13 MB; ambientCG 1K ZIP 5 to 10.5 MB.
- Compressed models add decoder fetches (tested): Draco about 59 KB br, Basis about 245 KB br, Meshopt about 6 KB br, as above.
- CC0 sources need no credit: [Poly Haven](https://polyhaven.com/license), [ambientCG](https://docs.ambientcg.com/license), [Kenney](https://kenney.nl/support). CC-BY sources do, and DamagedHelmet, Box, LittlestTokyo and many Poly Pizza models fall in that group — see [DamagedHelmet metadata](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/DamagedHelmet/metadata.json).
- Most GLBs don't embed their license (tested above), so metadata must be tracked by whoever picks the asset.
- Observed failure modes (tested): 404 from an assumed path (npm three textures, `github.khronos.org`); dead host (PMNDRS Market); broken Space (503); CORS-less redirect hop (ambientCG `/get`, `github.com/raw`); connection reset on one jsDelivr call; user-agent 403 (Kenney); same-name file changing (Poly Haven `venice_sunset`).
- jsDelivr gives no availability guarantee — [Terms](https://raw.githubusercontent.com/jsdelivr/jsdelivr/master/Terms%20of%20Use.md).

### Inferences

**Decision guide (my judgment)**

| Need | Prefer | Reason |
|---|---|---|
| Realistic reflections and ambient light | Load a 1k HDRI | About 1 to 1.7 MB, big visual gain; hard to fake on metal or glass |
| Stylized or abstract lighting | Code | Fits the look, zero network; a code-built environment is often enough |
| Photographic surface (brick, wood, rust) | Load JPG PBR maps | About 1 MB; procedural versions cost shader work and often look synthetic |
| Clean, graphic, gradient or toon surface | Code | Matches the site's style, resolution independent |
| Character, creature, or animated rig | Load GLB | Rigging and animation are impractical in code; RobotExpressive is 464 KB |
| Recognisable real object (camera, lantern) | Load if a suitable CC0 file exists | But showcase GLBs are heavy; check low-poly sources first |
| Logos, icons, charts, text, UI-bound shapes | Code | Must match exact brand or data; no asset will fit |
| Simple forms (boxes, rings, particles, terrain from noise) | Code | Kilobytes of code, exact control, scales and animates freely |
| Generated from arbitrary user text or image | Space, opt-in only | Otherwise not attainable with no key, and unreliable |

**Style fit.** Mixing a photoreal PBR asset into a flat or illustrated page usually looks wrong regardless of quality. Sticking to one source family for a scene helps; for example, low-poly Poly Pizza items with one HDRI. Check in a real render, as none of these were viewed.

**Userscript-specific risk (general web behaviour, not tested in TamperSloth).**
- The host page's CSP can block `connect-src`, `img-src` or worker and WASM use, so the same URL may work on one site and fail on the next. An extension-level or `GM_xmlhttpRequest`-style fetch can avoid some of that, but textures and decoders still have to reach the page's context in a usable form, for example as blob URLs, which CSP can also block.
- ACAO only matters for page-context fetches, and the extension may have other routes. This is for the report's CSP and runtime sections to reconcile.

**Offline, blocked or failed behaviour.**
1. Always render a code-built version first, then swap in the asset on success. Never leave a blank canvas waiting on a CDN.
2. Time-box each fetch (roughly 5 to 10 s on normal networks) and treat failure as a normal path, not an error state.
3. Lighting failure should fall back to a code-built environment or plain lights; model failure to a simple placeholder shape; texture failure to a flat colour.
4. Offer at most one mirror for each asset (for example, jsDelivr then raw GitHub at the same SHA).
5. Browser HTTP cache helps repeat visits (jsDelivr 1 year, Poly Pizza 7 days, Poly Haven 4 hours, raw GitHub 5 minutes, per tested headers) but cannot be relied on for first-time offline use.
6. Validate after pinning: check `glTF` magic bytes or use a loader error handler, because an HTML error page can arrive where a binary is expected.

**Attribution handling.** Prefer CC0 so no credit UI is needed. Where CC-BY is used, show the credit near the 3D element, and store title, author and license with the URL. Exclude SCEA, Mixamo-sourced and unconfirmed files (Duck, Soldier, Horse, Parrot, Flamingo, coffeemat) from any default set.

**Things likely to change, so re-check before shipping:** ZeroGPU quotas and Space status (highest risk), Poly Haven file contents, Poly Pizza's terms and URL scheme, ambientCG's hashed paths, GitHub raw limits, and jsDelivr terms (the current version took effect only in October 2026).

### Gaps
- No measured load, parse or GPU upload times; the comparison is based on size only.
- The size of equivalent code-built versions was not measured, so "kilobytes of code" is my estimate.
- Fallback behaviour and CSP failures were not exercised on real target sites.
- Visual quality and style fit were not reviewed, since no asset was rendered.
