## Start here

Add 3D only when it helps someone understand or enjoy something a flat page can't show as well. Most pages should get no 3D. Decide first, and say your decision in one line.

| Decision | Signals in the request | Signals on the page |
|---|---|---|
| **Use 3D** | Names a physical object, product viewer, globe, molecule, floor plan, game or toy. Says rotate, spin, explore or look around. Explicitly asks for a 3D logo, hero or background | Product page where shape or fit matters. A `.glb` or `.gltf` link. True spatial data |
| **Don't use 3D** | "Make this chart 3D" on abstract data. "Make it pop" on a data page. Asks for readability, speed or density | Dashboard, table, form, checkout, admin tool, long article or docs. Motion behind body text |
| **Ask with askUser** | "Add some wow" with no object. A 3D chart where the data may be truly spatial | Landing page with no obvious object. Decorative effect behind readable text |

- An explicit request can override a "don't" on the user's own terms. Say what they lose, such as readability, and keep the 2D version or data reachable.
- Evidence is narrower than vendors claim. Peer-reviewed work finds the average sales effect of AR small, and strongest for expensive, niche or uncertain products [S1]. 83% of users skipped 360 views where offered [S2]. Bar charts lose about 10% accuracy in 3D [S3]. Abstract spaces and navigation suit 3D poorly [S4]. I found no study showing that hero visuals help, so treat them as a brand choice that must earn its cost.
- Try the cheaper tool first. A flat card, tilt, flip or parallax of real page elements needs CSS, not WebGL: use the card tilt recipe. Real lighting, reflections and meshes need WebGL.

Then choose a build route:

| Need | Route |
|---|---|
| Logo, icon, UI-bound or abstract shape, simple object | Code it: workflow B |
| A specific object from an image | Code it: workflow A, and warn that it will be a stylised interpretation |
| Character, rigged animal or animation, or photographic realism | Load a CC0 GLB: workflow C |
| Realistic reflections on metal or glass | Keep code-built geometry and load a 1k HDRI |

Tell the user before starting if a request can't be met well, such as a photoreal portrait.

## Stack and loading

**Primary: Three.js r187 with `WebGLRenderer`, in the USER_SCRIPT world, loaded through the kit's linker.** MIT. About 216 KB gzipped with six addons, and it rendered on a page with a strict CSP [S5]. **Fallback: raw WebGL2** with nothing to load, or CSS when that's enough.

These are tested facts about where your scripts run [S5]. Don't try to work around them:

| Works in this world | Refused or broken |
|---|---|
| `fetch` as text, then `new Function` | `import()` of any URL, `<script src>`, `blob:` and `data:` modules, even on pages with no CSP |
| Fetches from CORS hosts, on strict pages too. They carry the page's origin | `customElements` is `null`, so `<model-viewer>` and A-Frame fail |
| Canvas, WebGL2 and shadow roots on strict pages | WASM and blob Workers on strict pages, so treat Draco, KTX2 and Meshopt GLBs as unavailable there |
| Your own copy of Three, with no clash with the page's | Images from hosts without CORS can't become textures |

Rules:
- **Your file:** one script, with your main function as the very first function in the file, because the runner calls the first `function name(` it finds. Everything else goes inside it. Don't put the word "function" followed by a name and bracket in a comment above it.
- **Writing it:** the kit is long, so write it once with appendToFile in pieces of about 150 lines, copied exactly, then add your recipe. Change only the recipe afterward, with strReplaceTool or replaceLines. Never retype the kit.
- **Don't use:** `WebGPURenderer` (`ShaderMaterial` and `EffectComposer` don't work on it), `three.module.min.js` (pulls the unminified core, 379 KB), `three.cjs` (a stub since r186), `three.min.js` (gone since r161), or esm.sh `?bundle` addons (each carries its own Three).
- **Avoid in your code:** the words `localStorage`, `sessionStorage`, `document.cookie` and `credentials`. With `fetch` in the same script they trigger the secrets approval screen. Don't pass `credentials` to `fetch`.
- **Saved changes:** use saveScript with `document_idle`. The library loads from the CDN on each page load, and the browser caches it. Tell the user it's local to their browser.

*Likely to change:* jsDelivr's `+esm` output is what the linker parses, and Chrome doesn't document this world's behavior. Pin the version, and treat load failure as normal.

## Kit

Paste this unchanged as the first lines inside your function, then add one recipe or your own `return stage3d(...)`. It's about 20 KB, and it handles loading, checks, mounting, resizing, pausing off-screen, context loss, cleanup and rerunning.

```js kit
// ===== KIT (three.js r187, MIT). Runs in the USER_SCRIPT world. =====
const CDN = 'https://cdn.jsdelivr.net/npm/three@0.187.0';
const kit = globalThis.__ts3d ??= {mods: new Map(), stages: new Map()};

// Links jsDelivr +esm files with fetch + new Function, since import() is refused here. One Three instance per world.
const esm = url => {
  if (kit.mods.has(url)) return kit.mods.get(url);
  const job = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} loading ${url}`);
    const deps = [], ns = {};
    const list = (names, fn) => names.split(',').map(s => s.trim()).filter(Boolean).map(s => fn(...s.split(/\s+as\s+/)));
    const src = (await res.text()).replace(/\/\/# sourceMappingURL=.*$/m, '')
      .replace(/import\s*(?:\*\s*as\s+([\w$]+)|\{([^}]*)\}|([\w$]+))\s*from\s*"([^"]+)"\s*;?/g, (_, star, names, def, spec) => {
        const i = deps.push(new URL(spec, url).href) - 1;
        if (star) return `const ${star}=__d[${i}];`;
        if (def) return `const ${def}=__d[${i}].default;`;
        return `const {${list(names, (a, b) => `${a}:${b || a}`).join(',')}}=__d[${i}];`;
      })
      .replace(/export\s+default\s+/g, '__e.default=')
      .replace(/export\s*\{([^}]*)\}\s*;?/g, (_, names) => list(names, (a, b) => `__e[${JSON.stringify(b || a)}]=${a};`).join(''));
    const loaded = await Promise.all(deps.map(esm));
    new Function('__d', '__e', `"use strict";${src}`)(loaded, ns);
    return ns;
  })();
  job.catch(() => kit.mods.delete(url)); // a failed load can be retried
  kit.mods.set(url, job);
  return job;
};
const addon = path => esm(`${CDN}/examples/jsm/${path}.js/+esm`);
const within = (ms, job, what) => Promise.race([job, new Promise((_, no) => setTimeout(() => no(new Error(`timed out: ${what}`)), ms))]);

// Any CSS color to THREE.Color. THREE.Color can't parse oklch(), lab() or color() from computed styles.
const paint = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
const cssRgb = value => { paint.clearRect(0, 0, 1, 1); paint.fillStyle = value; paint.fillRect(0, 0, 1, 1); return [...paint.getImageData(0, 0, 1, 1).data]; };
const cssColor = (THREE, value) => { const [r, g, b] = cssRgb(value); return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace); };

// The page's real colors: effective background, text, and an accent from its main button or link.
const pageColors = THREE => {
  let bg = 'rgb(255,255,255)';
  for (let el = document.body; el; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (cssRgb(c)[3] > 0) { bg = c; break; } }
  const btn = [...document.querySelectorAll('button,[role=button],a[class*=btn],a[class*=button]')].find(el => { const c = cssRgb(getComputedStyle(el).backgroundColor); return c[3] > 0 && Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) > 25; });
  const accent = btn ? getComputedStyle(btn).backgroundColor : getComputedStyle(document.querySelector('a') || document.body).color;
  const [r, g, b] = cssRgb(bg);
  return {bg: cssColor(THREE, bg), text: cssColor(THREE, getComputedStyle(document.body).color), accent: cssColor(THREE, accent), dark: 0.2126 * r + 0.7152 * g + 0.0722 * b < 128};
};

// Material presets. All need scene.environment except toon, which needs direct light from s.light('toon').
const mats = (THREE, color) => ({
  clay: () => new THREE.MeshStandardMaterial({color, roughness: 0.85, metalness: 0}),
  satin: () => new THREE.MeshStandardMaterial({color, roughness: 0.45, metalness: 0}),
  lowPoly: () => new THREE.MeshStandardMaterial({color, roughness: 0.8, flatShading: true}),
  metal: () => new THREE.MeshStandardMaterial({color, roughness: 0.25, metalness: 1}),
  glossy: () => new THREE.MeshPhysicalMaterial({color, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08}),
  glass: () => new THREE.MeshPhysicalMaterial({color, roughness: 0.04, transmission: 1, thickness: 0.6, ior: 1.45}),
  iridescent: () => new THREE.MeshPhysicalMaterial({color, roughness: 0.2, metalness: 0.4, iridescence: 1, clearcoat: 1}),
  toon: (bands = 3) => {
    const tex = new THREE.DataTexture(Uint8Array.from({length: bands}, (_, i) => 90 + (i * 165) / (bands - 1)), bands, 1, THREE.RedFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.needsUpdate = true;
    return new THREE.MeshToonMaterial({color, gradientMap: tex});
  },
});

async function createStage({id, into, before, height = '420px', label = '3D view', decorative = false, software = false, maxDpr = 2, fov = 30, env = 0.9, layer = 0}) {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (decorative && still) throw new Error('reduced motion is on, and this effect is decorative');
  if (decorative && navigator.connection?.saveData) throw new Error('data saver is on, and this effect is decorative');
  const probe = document.createElement('canvas').getContext('webgl2', {failIfMajorPerformanceCaveat: !software});
  if (!probe) throw new Error(software ? 'WebGL2 is unavailable' : 'no hardware-accelerated WebGL2');
  const info = probe.getExtension('WEBGL_debug_renderer_info'), gpu = info ? String(probe.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  if (!software && /swiftshader|llvmpipe|software|basic render/i.test(gpu)) throw new Error('only software rendering is available');
  probe.getExtension('WEBGL_lose_context')?.loseContext();

  if (!into && before?.getAttribute?.('data-ts-ui') === id) before = before.nextElementSibling; // a rerun's target may be its own old host
  if (!into && !before) throw new Error('no element found to place the 3D next to');
  kit.stages.get(id)?.dispose(); // reruns replace the last version
  const THREE = await within(15000, esm(`${CDN}/+esm`), 'three.js');
  const {RoomEnvironment} = await within(15000, addon('environments/RoomEnvironment'), 'RoomEnvironment');

  const quit = new AbortController(), signal = quit.signal;
  const host = document.createElement('div');
  host.setAttribute('data-ts-ui', id);
  host.style.cssText = 'display:block;width:100%;';
  if (into) {
    if (getComputedStyle(into).position === 'static') into.style.position = 'relative';
    into.style.isolation = 'isolate';
    host.style.cssText = `display:block;position:absolute;inset:0;z-index:${layer};pointer-events:${decorative ? 'none' : 'auto'};`;
    into.prepend(host);
  } else {
    host.style.height = height; // reserved up front, so nothing shifts when the canvas appears
    before.before(host);
  }
  if (decorative) host.setAttribute('aria-hidden', 'true');
  const root = host.attachShadow({mode: 'open'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`:host{contain:layout paint}.box{position:relative;width:100%;height:100%}
    canvas{display:block;width:100%;height:100%;opacity:0;transition:opacity .4s;outline-offset:-3px}
    .bar{position:absolute;right:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;pointer-events:auto}
    button{font:500 13px/1 system-ui,sans-serif;min-height:34px;padding:0 12px;border-radius:8px;border:1px solid #8886;background:#ffffffd9;color:#111;cursor:pointer}
    button:hover{background:#fff}button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
    .dark button{background:#1c1c1ed9;color:#fff}.dark button:hover{background:#2c2c2e}`);
  root.adoptedStyleSheets = [sheet];
  const box = root.appendChild(document.createElement('div')); box.className = 'box';
  const canvas = box.appendChild(document.createElement('canvas'));
  canvas.textContent = label;
  if (!decorative) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label); }
  const bar = box.appendChild(document.createElement('div')); bar.className = 'bar';

  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: decorative ? 'low-power' : 'default'});
  renderer.toneMapping = THREE.NeutralToneMapping; // keeps brand colors. AgX is softer, ACES more contrast with hue shifts.
  const scene = new THREE.Scene(), rig = new THREE.Group(); scene.add(rig);
  const camera = new THREE.PerspectiveCamera(fov, 1, 0.01, 200);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04); // no download, and the largest visual gain per KB
  scene.environment = envTarget.texture;
  scene.environmentIntensity = env;

  let raf = 0, last = 0, visible = true, dead = false, paused = false, dpr = 0, resized = true, shown = false, slow = 0, count = 0;
  const frames = [], autos = [];
  const want = () => { if (!raf && !dead && visible && !document.hidden && shown) raf = requestAnimationFrame(tick); };
  const cap = () => Math.min(devicePixelRatio, innerWidth < 768 ? Math.min(maxDpr, 1.5) : maxDpr);
  const applySize = () => {
    const w = box.clientWidth || 1, h = box.clientHeight || 1;
    renderer.setPixelRatio(dpr || (dpr = cap()));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    s.onResize?.();
    resized = false;
  };
  const tick = t => {
    raf = 0;
    if (dead || !visible || document.hidden) return;
    const dt = last ? Math.min((t - last) / 1000, 0.1) : 0;
    last = t;
    if (resized) applySize();
    const playing = autos.length && !paused && !still;
    if (playing) for (const fn of autos) fn(dt, t / 1000);
    let more = false;
    for (const fn of frames) if (fn(dt, t / 1000) === true) more = true;
    renderer.render(scene, camera);
    if (dt) { slow = slow * 0.95 + dt * 0.05; if (++count > 60 && slow > 0.03 && dpr > 1) { dpr = Math.max(1, dpr * 0.75); resized = true; count = 0; } } // drop resolution when struggling
    if (playing || more || resized) want(); else last = 0;
  };

  const s = {
    THREE, scene, rig, camera, renderer, canvas, host, root, bar, still, signal, id,
    colors: pageColors(THREE), mats: color => mats(THREE, color),
    invalidate: want,
    onFrame: fn => frames.push(fn),                 // fn(dt, seconds). Return true to request another frame.
    animate(fn) {                                   // automatic motion: gets a Pause button, and never runs under reduced motion
      autos.push(fn);
      if (autos.length === 1 && !still) { const b = s.button('Pause animation', () => { paused = !paused; b.textContent = paused ? 'Play animation' : 'Pause animation'; last = 0; want(); }); }
    },
    button(text, fn) { const b = bar.appendChild(document.createElement('button')); b.type = 'button'; b.textContent = text; b.addEventListener('click', fn, {signal}); return b; },
    light(preset = 'studio') {                      // studio: env + soft key. soft: env only. toon: direct light for MeshToonMaterial.
      if (preset === 'soft') return;
      const key = new THREE.DirectionalLight(0xffffff, preset === 'toon' ? 3 : 1.2); key.position.set(3, 5, 4); scene.add(key);
      if (preset === 'toon') scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.2));
    },
    fit(obj, {margin = 1.15, dir = [0.5, 0.3, 1], tight = false} = {}) { // frames from every angle, or tight to the box for logos and words
      const bounds = new THREE.Box3().setFromObject(obj), size = bounds.getSize(new THREE.Vector3());
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      s.frame = {sphere, margin, dir};
      s.onResize = () => {
        const v = THREE.MathUtils.degToRad(camera.fov) / 2, h = Math.atan(Math.tan(v) * camera.aspect);
        const d = tight ? Math.max(size.y / 2 / Math.tan(v), size.x / 2 / Math.tan(h)) * margin + size.z / 2 : (sphere.radius / Math.sin(Math.min(v, h))) * margin;
        camera.position.copy(sphere.center).add(new THREE.Vector3(...dir).normalize().multiplyScalar(d));
        camera.near = d / 50; camera.far = d * 10; camera.updateProjectionMatrix(); camera.lookAt(sphere.center);
        s.controls?.target.copy(sphere.center);
      };
      s.onResize();
      return sphere;
    },
    shadow(obj, {opacity = 0.28, spread = 1.5} = {}) { // soft fake ground shadow: nearly free, and stops objects floating
      const b = new THREE.Box3().setFromObject(obj), size = b.getSize(new THREE.Vector3()), c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      grad.addColorStop(0, `rgba(0,0,0,${opacity})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(size.x * spread, size.z * spread), new THREE.MeshBasicMaterial({map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, toneMapped: false}));
      plane.rotation.x = -Math.PI / 2; plane.position.set((b.min.x + b.max.x) / 2, b.min.y + 0.001 * size.y, (b.min.z + b.max.z) / 2);
      plane.name = 'shadow';
      scene.add(plane);
      return plane;
    },
    parallax(group = rig, amount = 0.14) {          // cursor parallax on a parent group, not on a camera that controls own
      if (still || !matchMedia('(hover:hover)').matches) return;
      let tx = 0, ty = 0;
      addEventListener('pointermove', e => { tx = (e.clientX / innerWidth) * 2 - 1; ty = (e.clientY / innerHeight) * 2 - 1; want(); }, {passive: true, signal});
      frames.push(dt => {
        group.rotation.y = THREE.MathUtils.damp(group.rotation.y, tx * amount, 5, dt);
        group.rotation.x = THREE.MathUtils.damp(group.rotation.x, ty * amount * 0.6, 5, dt);
        return Math.abs(group.rotation.y - tx * amount) > 0.001;
      });
    },
    scrollProgress() {                              // 0 to 1 as the stage crosses the viewport. Read, never hijack, the scroll.
      const r = host.getBoundingClientRect();
      return THREE.MathUtils.clamp(1 - (r.bottom / (innerHeight + r.height)), 0, 1);
    },
    async orbit({views} = {}) {                     // drag to rotate; the wheel and vertical swipes still scroll the page
      const {OrbitControls} = await within(10000, addon('controls/OrbitControls'), 'OrbitControls');
      const c = s.controls = new OrbitControls(camera, canvas);
      Object.assign(c, {enableDamping: !still, enableZoom: false, enablePan: false});
      canvas.style.touchAction = 'pan-y'; // must come after the constructor, which sets none
      canvas.style.cursor = 'grab'; canvas.tabIndex = 0;
      c.target.copy(s.frame?.sphere.center ?? new THREE.Vector3());
      c.addEventListener('change', want);
      let goal = null;
      const offset = new THREE.Vector3(), sph = new THREE.Spherical();
      const turn = (dTheta, dPhi) => { offset.copy(camera.position).sub(c.target); sph.setFromVector3(offset); sph.theta += dTheta; sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.15, Math.PI - 0.15); camera.position.copy(c.target).add(offset.setFromSpherical(sph)); want(); };
      frames.push(dt => {
        if (goal) {
          offset.copy(camera.position).sub(c.target); sph.setFromVector3(offset);
          let dT = goal[0] - sph.theta; dT = Math.atan2(Math.sin(dT), Math.cos(dT));
          const k = still ? 1 : 1 - Math.exp(-6 * dt);
          turn(dT * k, (goal[1] - sph.phi) * k);
          if (Math.abs(dT) < 0.003 && Math.abs(goal[1] - sph.phi) < 0.003) goal = null;
        }
        if (dt) c.dampingFactor = 1 - Math.exp(-7 * dt);
        return c.update() || !!goal;
      });
      canvas.addEventListener('keydown', e => { // keyboard and buttons cover WCAG 2.5.7. Tab still leaves.
        const step = {ArrowLeft: [0.25, 0], ArrowRight: [-0.25, 0], ArrowUp: [0, -0.2], ArrowDown: [0, 0.2]}[e.key];
        if (step) { e.preventDefault(); turn(...step); }
      }, {signal});
      s.view = (theta, phi) => { goal = [THREE.MathUtils.degToRad(theta), THREE.MathUtils.degToRad(phi)]; want(); }; // eases to an angle in degrees
      s.button('Rotate left', () => turn(0.5, 0));
      s.button('Rotate right', () => turn(-0.5, 0));
      for (const [name, [theta, phi]] of Object.entries(views ?? {})) s.button(name, () => s.view(theta, phi));
      return c;
    },
    pick(objects, onHit) {                          // click to explore: a real click, not the end of a drag
      const ray = new THREE.Raycaster(); let down = null;
      canvas.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; }, {signal});
      canvas.addEventListener('pointerup', e => {
        if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
        const b = canvas.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
        const hit = ray.intersectObjects(objects, true)[0];
        if (hit) { onHit(hit); want(); }
      }, {signal});
    },
    async useHdri(url) {                            // swaps the code-built light for a real one. On failure, keep the old light.
      const {HDRLoader} = await addon('loaders/HDRLoader');
      const tex = await within(10000, new HDRLoader().loadAsync(url), url);
      const next = pmrem.fromEquirectangular(tex); tex.dispose();
      envTarget.dispose(); envTarget = next; scene.environment = next.texture; want();
    },
    async loadGlb(url) {                            // uncompressed GLB only on strict pages
      const {GLTFLoader} = await addon('loaders/GLTFLoader');
      return within(10000, new GLTFLoader().loadAsync(url), url);
    },
    async show() {                                  // compile, draw, then fade in, so no half-built frame appears
      if (resized) applySize();
      await within(8000, renderer.compileAsync(scene, camera), 'shaders').catch(() => {});
      renderer.render(scene, camera);
      canvas.style.opacity = '1';
      shown = true; last = 0; resized = false;
      new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) { last = 0; want(); } }, {rootMargin: '100px'}).observe(host);
      s.observers.push(new ResizeObserver(() => { resized = true; want(); }));
      s.observers[0].observe(box);
      want();
    },
    observers: [],
    report() {                                      // read this with evaluateJavaScript after each pass, alongside a screenshot
      const parts = [], b = new THREE.Box3(), v = new THREE.Vector3(), r = n => +n.toFixed(2);
      scene.traverse(o => { if (o.name && parts.length < 40) { b.setFromObject(o); parts.push({name: o.name, size: b.getSize(v).toArray().map(r), center: b.getCenter(v).toArray().map(r)}); } });
      const {calls, triangles} = renderer.info.render, {geometries, textures} = renderer.info.memory;
      return {id, calls, triangles, geometries, textures, dpr, canvas: [canvas.width, canvas.height], fps: slow ? Math.round(1 / slow) : null, still, parts};
    },
    dispose() {
      if (dead) return;
      dead = true; quit.abort(); cancelAnimationFrame(raf); clearInterval(watch);
      s.observers.forEach(o => o.disconnect());
      s.controls?.dispose();
      scene.traverse(o => {
        o.geometry?.dispose(); o.skeleton?.dispose();
        for (const m of [o.material].flat().filter(Boolean)) { for (const v of Object.values(m)) if (v?.isTexture) v.dispose(); m.dispose(); }
        if (o.isInstancedMesh) o.dispose();
      });
      envTarget.dispose(); pmrem.dispose(); renderer.dispose();
      if (!renderer.getContext().isContextLost()) renderer.forceContextLoss(); // dispose alone keeps the context, and 16 live contexts evict the page's own canvas
      host.remove(); kit.stages.delete(id);
    },
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); s.dispose(); }, {signal}); // leave the page as it was
  document.addEventListener('visibilitychange', () => { last = 0; want(); }, {signal});
  const start = location.pathname;
  const watch = setInterval(() => { if (!host.isConnected || location.pathname !== start) s.dispose(); }, 1000); // SPA navigation or removal
  box.classList.toggle('dark', s.colors.dark);
  kit.stages.set(id, s);
  return s;
}

// Runs a build and always leaves the page usable. Returns a status for you to read.
async function stage3d(options, build) {
  let s;
  try {
    s = await createStage(options);
    await build(s);
    await s.show();
    return JSON.stringify(s.report());
  } catch (error) {
    s?.dispose();
    return `3D skipped, page unchanged: ${error.message}`;
  }
}
// ===== END KIT =====
```

Each recipe's `build(s)` gets the stage. Key members: `s.THREE`, `s.scene`, `s.rig` (a parent group for your object), `s.camera`, `s.colors` (`accent`, `bg`, `text`, `dark`), `s.mats(color)` (the presets), `s.light()`, `s.fit(obj)`, `s.shadow(obj)`, `s.animate(fn)`, `s.onFrame(fn)`, `s.parallax()`, `s.orbit()`, `s.view(theta, phi)` after orbit, `s.pick()`, `s.button()`, `s.useHdri(url)`, `s.loadGlb(url)`, `s.report()`, `s.dispose()`. Rerunning with the same `id` replaces the last version. Read a live stage from another script or evaluateJavaScript with `globalThis.__ts3d.stages.get('id').report()`.

## Build workflows

Name every part with `.name`, because `s.report()` lists each named part's real size and position. Running code isn't correct code: in one benchmark 48% of lost points were features never built [S6], and models scored about 0.8 on looking like the right kind of thing but only 0.35 on matching the actual shape [S7]. Code-only and visual judges each miss things [S6], so check both `report()` and a screenshot.

**Workflow A: reference image to code.** A single image is the hardest input. The closest benchmark scored 0.725 from one view with three refine rounds, in Blender rather than Three.js [S8]. Set the user's expectations.
1. **Classify.** Hard-surface objects (bottle, lamp, chair, gadget) work best [S9]. For soft organic subjects such as faces and animals, offer a stylised version or a CC0 model instead.
2. **Write a spec before any code:** silhouette, height-to-width ratio for the whole and each part, a part tree, material per part, palette sampled from the image, light direction, and what's hidden and must be guessed. Measurements measurably reduce error [S8].
3. **Match the camera first.** Set field of view and angle to the reference, since camera cues gave the largest single gain [S8].
4. **Build in passes,** with one screenshot and one `report()` after each: blockout in flat `satin` with correct proportions, then structure, then materials, then lighting and detail.
5. **Compare** the render beside the reference, list the differences, and fix one at a time. Stop after three rounds, or sooner if you've made the same fix twice. Say what doesn't match.

**Workflow B: description to code.**
1. **Expand the brief into numbers:** real-world size, part list, ratios and materials. Explicit parameters scored higher than images [S7].
2. **Write the part tree first** and hold to it, so nothing gets skipped. Aim for at least 5 to 8 parts on an object, because too few reads as crude.
3. **One factory function per part,** returning a named `Group` with its pivot at the joint. Use one unit scale with constants at the top, and place parts from their parent's measured bounds rather than by guessing.
4. **Choose one style** from the table below and use it everywhere.
5. **Check** that each part exists, touches its parent and is visible, then refine as in A.

**Workflow C: load an open asset by URL.** Load when code can't compete: rigs, animation, photographic surfaces. Render a code-built placeholder or nothing first, and treat failure as normal. Keep to the table in Open assets, check each file's license, and don't exceed the budgets.

```js workflow-c
// Inside build(s): loads a CC0 rigged robot, and plays its first animation.
const gltf = await s.loadGlb('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb');
gltf.scene.name = 'robot';
s.rig.add(gltf.scene);
s.fit(gltf.scene); s.shadow(gltf.scene); s.light();
const mixer = new s.THREE.AnimationMixer(gltf.scene);
mixer.clipAction(gltf.animations[0]).play();
s.animate(dt => mixer.update(dt));
```

**Techniques.** Quality limits here are my judgment, since no benchmark compares them [S9].

| Technique | Best for | Example | Limit and common mistake |
|---|---|---|---|
| Primitives and groups | Furniture, robots, gadgets | `Group` with parts pivoted at joints | Silhouette. Floating parts, one scale missing |
| `RoundedBoxGeometry` | Anything boxy | `addon('geometries/RoundedBoxGeometry')`, then `new RoundedBoxGeometry(1, .4, 1, 4, .04)` | Sharp box edges are the top sign of a crude model |
| Lathe | Bottles, vases, wheels | `new LatheGeometry(pointsArray, 64)` | Profile x values must not go negative |
| Extrude and SVG | Logos, icons, panels | `new ExtrudeGeometry(shape, {depth: .2, bevelSize: .02, bevelThickness: .02, bevelSegments: 3})` | Bevels grow the outline, and SVG needs a Y flip. `SVGLoader.createShapes` is deprecated, so use `path.toShapes()` |
| Noise displacement | Terrain, rocks | Displace `PlaneGeometry` vertices, then `computeVertexNormals()` | Needs several octaves and fresh normals |
| Instancing | Forests, debris, tiles | `InstancedMesh(geo, mat, 5000)`, jittering each matrix | Set `instanceMatrix.needsUpdate`. Uniform grids look fake |
| Particles | Dust, galaxies, backgrounds | `Points` with a small `ShaderMaterial`: see the background recipe | Square points without a round mask. Additive blowout |
| GLSL shaders | Gradients, fresnel, water | `ShaderMaterial`. End with `#include <tonemapping_fragment>` and `#include <colorspace_fragment>` | Highest gain per line. Check the console for compile errors |
| SDF raymarching | Smooth blobby hero art | See Fallback | Doesn't mix with meshes. Cap steps and resolution |
| Text | Hero words | `FontLoader` plus `TextGeometry`: see the logo recipe | Default size is huge. Keep all real text in the DOM |

**Styles that look intentional,** most to least forgiving (my judgment): abstract shader or particles, clay, low-poly flat shaded, toon, glass or iridescent, then photoreal. Avoid photoreal for code-built objects. Don't mix material families in one scene.

| Page mood (my judgment) | Material | Tone mapping and light | Camera |
|---|---|---|---|
| Clean sans, white, SaaS | `satin`, accent from the page | Neutral, `studio`, faint shadow | FOV 25 to 35 |
| Serif, editorial, luxury | `metal` or `glossy`, sparse color | Neutral or AgX, one strong key | FOV 20 to 30, low angle |
| Mono, dark, technical | Dark `metal`, thin emissive lines | AgX | FOV 35 to 50 |
| Rounded, playful | `clay` or `toon`, saturated | Neutral, broad soft shadow | FOV 30 to 40 |
| Brutalist, flat | `toon` or `MeshBasicMaterial` | None, hard edges | Low FOV |

**What to spend on,** ranked by visual gain per KB and ms, from measurements on one RTX 4070 laptop with my estimates for weak GPUs [S10]:
1. Almost free, always do: correct color handling, capped pixel ratio, tone mapping, `RoomEnvironment` (1.2 KB), material tuning, a blob shadow, default antialiasing. All of these are already in the kit.
2. Worth it when it fits: clearcoat, a static contact shadow, one directional light.
3. Only for a reason: a 1k HDRI (1.4 to 1.7 MB) for real reflections, glass (`transmission` re-renders the scene), PCF shadows.
4. Avoid in embedded 3D: `EffectComposer` (loses default antialiasing, adds at least 6 KB and a pass cost). Bloom only on dark pages with emissive objects. SSAO and GTAO: GTAO cost about 20 times bloom, and could consume a whole 60 fps budget on a weak GPU. SMAA is about 45 KB.

**Studying other code.** Three.js, drei, maath, troika, three-subdivide and tsl-textures are MIT, so adapt them and keep the notice. Inigo Quilez's algorithm code is reported as MIT, though his artwork shaders are copyrighted. **Don't copy from Shadertoy** (reported default CC BY-NC-SA, so non-commercial and share-alike unless a shader says otherwise), **LYGIA** (Prosperity, 30-day commercial trial), or Three.js Journey (terms not found) [S9]. Useful official examples: `webgl_geometry_extrude_shapes`, `webgl_loader_svg`, `webgl_instancing_scatter`, `webgl_points_waves`, `webgl_materials_physical_transmission`, `webgl_shadow_contact`.

## Open assets

Tested with header checks on 2026-11-04 (keyless, `Access-Control-Allow-Origin: *`) [S11]. CC0 needs no credit. Show the credit next to the element for anything else.

| Asset | URL | Size | License |
|---|---|---|---|
| Robot, 14 animations | `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r170/examples/models/gltf/RobotExpressive/RobotExpressive.glb` | 464 KB | CC0 |
| Low-poly adventurer | `https://static.poly.pizza/bbe369ee-a686-42c7-adad-14356f5f2f15.glb` | 1.9 MB | CC0 per its page |
| Lantern (over budget for decoration) | `https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Assets@8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Lantern/glTF-Binary/Lantern.glb` | 9.6 MB | CC0 |
| Studio HDRI, 1k | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_09_1k.hdr` | 1.6 MB | CC0 |
| Sunset HDRI, 1k | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/venice_sunset_1k.hdr` | 1.4 MB | CC0 |
| Sky HDRI, 1k | `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr` | 1.4 MB | CC0 |
| Brick color, normal, packed maps, 1k | `https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_` + `diffuse_1k.jpg`, `nor_gl_1k.jpg`, `arm_1k.jpg` | 1 MB total | CC0 |

- **Other sources:** Poly Haven has about 1,000 HDRIs and 870 textures with the same URL pattern. Its paths aren't versioned, so contents can change. Poly Pizza has keyless GLBs, but license varies per model, so read each page.
- **Not usable by URL:** ambientCG (ZIPs), Kenney, Quaternius, Sketchfab downloads, and the PMNDRS Market. Poly Pizza's search API needs a key.
- **Not free to reuse, despite being common examples:** Duck (SCEA), Soldier (Mixamo), Horse, Parrot and Flamingo (unconfirmed). DamagedHelmet is CC-BY and needs credit.
- **Textures:** set `texture.colorSpace = THREE.SRGBColorSpace` on color maps only, and `crossOrigin` is handled by the loaders. `github.com/.../raw/` URLs fail CORS, so use jsDelivr or `raw.githubusercontent.com`.

**Generating a model with AI:** don't. Public Hugging Face Spaces can answer from a browser, and one Shap-E job took 2 seconds, but 6 of 20 probed Spaces were down, including TripoSR and the original TRELLIS, and anonymous users get 2 GPU minutes a day [S11]. Hunyuan3D's license excludes the EU, UK and South Korea. In-browser options need a roughly 485 MB model download, which is outside this playbook's rules. Only if a user explicitly asks should you attempt one, as a user-triggered extra with a code-built fallback, and warn that it may fail.

## Recipes

Each recipe is a complete body to place after the kit. Change the target selector, label, colors and parts. All of these ran on a strict-CSP page.

**Hero object** (code-built, accent from the page, parallax, pausable):

```js recipe-hero
return stage3d({id: 'hero-3d', before: document.querySelector('main > *, h1'), height: 'min(60vh, 520px)', label: 'A slowly turning gyroscope with brass rings around a colored core', fov: 28}, async s => {
  const {THREE, rig, colors} = s;
  const orbital = s.mats(new THREE.Color(0xd8b878)).metal(), core = s.mats(colors.accent).glossy();
  const gyro = new THREE.Group(); gyro.name = 'gyroscope';
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 64, 48), core); ball.name = 'core'; gyro.add(ball);
  const rings = [[1.0, 0.05, 0.5, 0], [1.28, 0.042, -0.7, 0.6], [1.56, 0.034, 1.15, -0.5]].map(([r, t, x, z], i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 24, 160), orbital);
    ring.name = `ring-${i + 1}`; ring.rotation.set(x, 0, z); gyro.add(ring); return ring;
  });
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 16, 12), orbital, 3); // a bead rides each ring
  beads.name = 'beads'; beads.frustumCulled = false; gyro.add(beads);
  const m = new THREE.Matrix4(), p = new THREE.Vector3();
  const place = t => { rings.forEach((ring, i) => { const a = t * (0.5 + i * 0.2), r = ring.geometry.parameters.radius; p.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyEuler(ring.rotation); m.setPosition(p); beads.setMatrixAt(i, m); }); beads.instanceMatrix.needsUpdate = true; };
  place(0);
  gyro.position.y = 1.8; rig.add(gyro);
  s.fit(gyro, {dir: [0.25, 0.22, 1], margin: 0.72}); // the bounding sphere is loose around rings, so a margin under 1 fills the frame
  s.shadow(gyro, {spread: 0.8, opacity: colors.dark ? 0.5 : 0.16}).position.y = 0.05;
  s.light();
  s.parallax();
  s.animate((dt, t) => { rings.forEach((ring, i) => { ring.rotation.y += dt * (0.25 - i * 0.14); }); place(t); });
});
```

**Product-style viewer** (a ceramic mug from a lathe and a tube, with orbit, preset views and click to focus):

```js recipe-viewer
return stage3d({id: 'viewer-3d', before: document.querySelector('main > *, h1'), height: '440px', label: 'Ceramic mug. Drag or use the buttons to rotate.', fov: 26}, async s => {
  const {THREE, rig, colors} = s;
  const mug = new THREE.Group(); mug.name = 'mug';
  const glaze = s.mats(colors.accent).glossy(), inner = s.mats(new THREE.Color(0xf4f1ea)).glossy();
  const P = (x, y) => new THREE.Vector2(x, y);
  const body = new THREE.Mesh(new THREE.LatheGeometry([P(0, 0), P(0.74, 0), P(0.8, 0.05), P(0.82, 0.14), P(0.84, 1.5), P(0.86, 1.62), P(0.84, 1.66)], 96), glaze); body.name = 'body';
  const lining = new THREE.Mesh(new THREE.LatheGeometry([P(0.84, 1.66), P(0.79, 1.62), P(0.77, 1.5), P(0.75, 0.2), P(0.68, 0.12), P(0, 0.12)], 96), inner); lining.name = 'lining';
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.76, 64), new THREE.MeshStandardMaterial({color: 0x1c0d05, roughness: 0.3, envMapIntensity: 0.35})); coffee.name = 'coffee'; coffee.rotation.x = -Math.PI / 2; coffee.position.y = 1.32;
  const curve = new THREE.CatmullRomCurve3([[0.8, 1.32, 0], [1.2, 1.3, 0], [1.42, 0.98, 0], [1.3, 0.56, 0], [0.82, 0.38, 0]].map(v => new THREE.Vector3(...v)));
  const handle = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.09, 20, false), glaze); handle.name = 'handle';
  mug.add(body, lining, coffee, handle); rig.add(mug);
  s.fit(mug, {dir: [0.6, 0.45, 1], margin: 1.2});
  s.shadow(mug, {spread: 1.25, opacity: colors.dark ? 0.55 : 0.3});
  s.light();
  await s.orbit({views: {Front: [0, 75], Handle: [90, 70], Top: [0, 18]}});
  s.pick([handle], () => s.view(90, 70)); // clicking the handle turns to show it
});
```

To show a real model instead, replace the mug with `s.loadGlb(url)` as in workflow C.

**Interactive background** (a particle field behind a section's content, decorative, follows the cursor):

```js recipe-background
const section = document.querySelector('section') || document.querySelector('main') || document.body;
return stage3d({id: 'bg-3d', into: section, label: 'Decorative particle field', decorative: true, layer: -1, maxDpr: 1.5, fov: 40}, async s => {
  const {THREE, colors, signal} = s;
  const cols = 90, rows = 44, pos = new Float32Array(cols * rows * 3);
  for (let i = 0; i < cols * rows; i++) pos.set([(i % cols) / (cols - 1) - 0.5, Math.floor(i / cols) / (rows - 1) - 0.5, Math.random()], i * 3);
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const u = {uTime: {value: 0}, uMouse: {value: new THREE.Vector2(99, 99)}, uColor: {value: colors.accent}, uOpacity: {value: colors.dark ? 0.7 : 0.42}, uSize: {value: 4.5 * s.renderer.getPixelRatio()}, uSpan: {value: new THREE.Vector2(12, 7)}};
  const mat = new THREE.ShaderMaterial({uniforms: u, transparent: true, depthWrite: false,
    vertexShader: `uniform float uTime, uSize; uniform vec2 uMouse, uSpan; varying float vGlow, vEdge;
      void main() { vec3 p = vec3(position.xy * uSpan, 0.);
        p.z = sin(p.x * .55 + uTime * .5) * .35 + cos(p.y * .8 + uTime * .35 + position.z * 2.) * .35;
        float near = smoothstep(2.6, 0., distance(p.xy, uMouse)); p.z += near * .9; vGlow = near;
        vEdge = smoothstep(.5, .34, abs(position.x)) * smoothstep(.5, .3, abs(position.y));
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uSize * (1. + near * 1.4) * (9. / -mv.z); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vGlow, vEdge;
      void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard;
        gl_FragColor = vec4(uColor, smoothstep(.5, .2, d) * uOpacity * vEdge * (.5 + vGlow * .5));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const field = new THREE.Points(geo, mat); field.name = 'field'; field.frustumCulled = false; s.scene.add(field);
  s.camera.position.set(0, 0, 9.5);
  s.onResize = () => { const h = 2 * 9.5 * Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2)); u.uSpan.value.set(h * s.camera.aspect * 1.08, h * 1.08); }; // always fills the box
  const target = new THREE.Vector2(99, 99);
  addEventListener('pointermove', e => {
    const b = s.host.getBoundingClientRect();
    target.set(((e.clientX - b.left) / b.width - 0.5) * u.uSpan.value.x, -((e.clientY - b.top) / b.height - 0.5) * u.uSpan.value.y); s.invalidate();
  }, {passive: true, signal});
  s.onFrame(dt => { u.uMouse.value.x = THREE.MathUtils.damp(u.uMouse.value.x, target.x, 4, dt); u.uMouse.value.y = THREE.MathUtils.damp(u.uMouse.value.y, target.y, 4, dt); });
  s.animate(dt => { u.uTime.value += dt; });
});
```

Check text contrast afterward, keep the field faint behind text, and don't place this behind long body copy. Transmission needs something behind it, so use `glass` over a solid or textured object, not over an empty transparent canvas. Under reduced motion or data saver the kit skips it, which is correct for decoration.

**3D card tilt** (CSS only. No kit, library or WebGL, and text stays selectable):

```js recipe-tilt
const cards = [...document.querySelectorAll('.card, article')];
if (matchMedia('(prefers-reduced-motion: reduce)').matches || !matchMedia('(hover:hover)').matches) return 'Tilt skipped: reduced motion or no hover.';
for (const card of cards) {
  if (card.dataset.tsTilt) continue;
  card.dataset.tsTilt = '1';
  card.style.transition = 'transform .18s ease-out, box-shadow .18s ease-out';
  card.style.backgroundImage = 'radial-gradient(circle at var(--ts-x, 50%) var(--ts-y, 50%), rgba(255,255,255,var(--ts-glare, 0)), transparent 55%)';
  let frame = 0;
  card.addEventListener('pointermove', e => {
    const b = card.getBoundingClientRect(), x = (e.clientX - b.left) / b.width, y = (e.clientY - b.top) / b.height;
    frame ||= requestAnimationFrame(() => {
      frame = 0;
      card.style.transform = `perspective(800px) rotateX(${(0.5 - y) * 8}deg) rotateY(${(x - 0.5) * 8}deg) scale(1.015)`;
      card.style.setProperty('--ts-x', `${x * 100}%`); card.style.setProperty('--ts-y', `${y * 100}%`); card.style.setProperty('--ts-glare', '.22');
    });
  });
  card.addEventListener('pointerleave', () => { card.style.transform = ''; card.style.setProperty('--ts-glare', '0'); });
}
return `Tilt added to ${cards.length} cards.`;
```

**Animated logo or text** (extrudes the page's SVG logo, or a word if it has none, and plays once for under 5 seconds):

```js recipe-logo
const logo = document.querySelector('header svg, nav svg, svg');
const word = document.querySelector('h1')?.textContent.trim().split(/\s+/)[0] || 'Hello';
return stage3d({id: 'logo-3d', before: document.querySelector('main > *, h1'), height: '320px', label: logo ? 'Animated 3D version of the site logo' : `Animated 3D word: ${word}`, fov: 24}, async s => {
  const {THREE, rig, colors} = s;
  const mat = s.mats(colors.accent).glossy(), mark = new THREE.Group(); mark.name = 'mark';
  if (logo) {
    const {SVGLoader} = await addon('loaders/SVGLoader');
    const box = logo.viewBox.baseVal, unit = box.width || logo.getBoundingClientRect().width || 100;
    for (const path of new SVGLoader().parse(logo.outerHTML).paths) for (const shape of path.toShapes(true)) {
      const geo = new THREE.ExtrudeGeometry(shape, {depth: unit * 0.12, bevelEnabled: true, bevelSize: unit * 0.008, bevelThickness: unit * 0.012, bevelSegments: 4, curveSegments: 24});
      mark.add(new THREE.Mesh(geo, mat));
    }
    mark.scale.set(2 / unit, -2 / unit, 2 / unit); // SVG's Y axis points down
  } else {
    const {FontLoader} = await addon('loaders/FontLoader'), {TextGeometry} = await addon('geometries/TextGeometry');
    const font = await within(10000, new FontLoader().loadAsync('https://cdn.jsdelivr.net/gh/mrdoob/three.js@r187/examples/fonts/droid/droid_sans_bold.typeface.json'), 'font');
    const geo = new TextGeometry(word, {font, size: 1, depth: 0.28, curveSegments: 6, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.02, bevelSegments: 2});
    mark.add(new THREE.Mesh(geo, mat));
  }
  const center = new THREE.Box3().setFromObject(mark).getCenter(new THREE.Vector3());
  mark.position.sub(center); rig.add(mark);
  s.fit(mark, {dir: [0, 0.16, 1], margin: 1.35, tight: true});
  s.light();
  const rest = -0.5; // ends at an angle, because a head-on extrusion reads as flat
  rig.rotation.y = s.still ? rest : rest - Math.PI * 1.5;
  if (!s.still) { let t = 0; s.onFrame(dt => { t = Math.min(t + dt / 1.6, 1); rig.rotation.y = rest - Math.PI * 1.5 * (1 - t) ** 3; return t < 1; }); }
});
```

## Avoid

Most of these fail silently, leaving a dull, dark or broken result.

| Mistake | Fix |
|---|---|
| `import`, `<script src>` or `<model-viewer>` | Use the kit's linker. They're refused here |
| `RGBELoader`, `PCFSoftShadowMap`, `outputEncoding`, `sRGBEncoding`, `useLegacyLights`, `THREE.Clock`, `SVGLoader.createShapes`, `iridescenceThicknessRange`, `new RoomEnvironment(renderer)` | `HDRLoader`, `PCFShadowMap`, `outputColorSpace`, `SRGBColorSpace`, nothing, your own `dt`, `path.toShapes()`, the defaults, `new RoomEnvironment()` |
| Metal with no environment | It renders near black. The kit sets `scene.environment` |
| Lights copied from pre-r155 code | Fix the environment first, and don't just raise intensity |
| Color map with no `colorSpace` | `map.colorSpace = THREE.SRGBColorSpace`. Normal and roughness maps stay as they are |
| `new THREE.Color(getComputedStyle(el).color)` | Use `cssColor`, because `oklch()` and `lab()` silently keep the old color |
| `antialias: true` under `EffectComposer` | Jagged, because the composer's target has no samples. Skip the composer |
| `ShaderMaterial` without the tone-mapping and color-space chunks | Add the two includes, or colors won't match |
| `pos.lerp(t, 0.1)` each frame | `THREE.MathUtils.damp(a, b, lambda, dt)`. Otherwise speed follows refresh rate |
| Setting `touchAction` before creating controls | The constructor overwrites it. `s.orbit` handles the order |
| Zoom left on | The wheel gets captured. Keep `enableZoom = false` unless the user opens a full viewer |
| Moving a camera that controls own | Animate a parent group, or the controls overwrite it |
| Window size used for a raycast | Use the canvas rectangle. `s.pick` does |
| Scroll animation from `wheel` events | Read position with `s.scrollProgress()`. Scrolljacking disorients most users [S12] |
| Uncapped `devicePixelRatio` | A 3x phone draws 9 times the pixels. The kit caps it |
| Creating several renderers | Up to 16 live contexts are allowed per process, and the oldest is evicted, which can be the page's own canvas [S5]. Use one stage per feature |
| `dispose()` without `forceContextLoss()` | Tested: this evicted the host page's context [S5]. `s.dispose()` does both |
| Default grey, sharp boxes, no shadow, even lighting, uniform spacing | Rounded edges, a limited palette from the page, jitter and a blob shadow |
| Removing the original image or content when adding 3D | Keep it. Prices, specs and data must stay in DOM text |
| Motion that auto-starts and never stops | Use `s.animate`, which adds Pause. Starting on scroll into view still counts as automatic under WCAG 2.2.2 [S13] |
| Copying Shadertoy or LYGIA code | Write it from first principles, or adapt MIT sources |
| Treating a console "Refused to load the script .../+esm" as failure | It's a harmless preload hint from jsDelivr's headers, and rendering still works. Judge by the status `stage3d` returns |

## Fallback

Every failure must leave the page as it was. `stage3d` already removes the host and returns `3D skipped, page unchanged: <reason>`. Read that and tell the user what happened in plain words. Don't retry in a loop.

| Failure | What to do |
|---|---|
| No hardware WebGL2 (the default, `software: false`) | Decoration: skip it. If the user asked for this exact 3D, ask whether to run on the slow software path with `software: true` |
| Three.js blocked or CDN down | Use the raw WebGL2 template below, or CSS |
| GLB or HDRI fails or times out | Keep the code-built object or `RoomEnvironment` |
| A GLB needs Draco, KTX2 or Meshopt on a strict page | Pick an uncompressed file (check `extensionsRequired`), or build it in code |
| Page image has no CORS headers | It can't be a texture. Use a code-built material, or a CSS-only effect |
| Context lost | The kit disposes itself. Don't remount automatically |
| Saved script on a single-page app | The kit disposes on route change. Remount with a small `setInterval` that compares `location.pathname`, and only on the routes in scope |
| Under budget and still slow | Reduce in this order: pixel ratio, particle or instance count, glass, shadows, then drop to CSS |

**Raw WebGL2 fallback** (no kit or library, works with any CDN or CSP problem). This is an original raymarched blob, with its own pause, resize and cleanup:

```js recipe-rawgl
const old = globalThis.__tsBlob; if (old) old();
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const target = document.querySelector('main > *, h1');
const host = document.createElement('div'); host.setAttribute('data-ts-ui', 'blob'); host.style.cssText = 'width:100%;height:340px;';
const canvas = document.createElement('canvas'); canvas.style.cssText = 'display:block;width:100%;height:100%;';
canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', 'An abstract glossy shape, slowly changing');
const gl = canvas.getContext('webgl2', {alpha: true, antialias: false, premultipliedAlpha: true});
if (!gl) return '3D skipped, page unchanged: WebGL2 is unavailable';
const cs = getComputedStyle(document.querySelector('button') || document.body);
const paint = document.createElement('canvas').getContext('2d', {willReadFrequently: true}); paint.fillStyle = cs.backgroundColor; paint.fillRect(0, 0, 1, 1);
const [cr, cg, cb, ca] = paint.getImageData(0, 0, 1, 1).data, tint = ca ? [cr / 255, cg / 255, cb / 255] : [0.25, 0.4, 0.9];
const shader = (type, text) => { const sh = gl.createShader(type); gl.shaderSource(sh, text); gl.compileShader(sh); return sh; };
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2. - 1., 0., 1.); }`));
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float; uniform vec2 uRes; uniform float uTime; uniform vec3 uTint; out vec4 outColor;
float blend(float a, float b, float k){ float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
float map(vec3 p){ float t = uTime * .5;
  float d = length(p - vec3(sin(t) * .55, cos(t * .8) * .25, 0.)) - .52;
  d = blend(d, length(p - vec3(cos(t * .7) * .6, sin(t * 1.1) * .4, sin(t) * .3)) - .38, .45);
  return blend(d, length(p + vec3(sin(t * .6) * .5, cos(t * .5) * .5, 0.)) - .32, .45); }
vec3 normalAt(vec3 p){ vec2 e = vec2(.002, 0.); return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx))); }
void main(){ vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y; vec3 ro = vec3(0., 0., 4.), rd = normalize(vec3(uv, -1.5)); float t = 0.; bool hit = false;
  for (int i = 0; i < 48 && t < 7.; i++) { float d = map(ro + rd * t); if (d < .002) { hit = true; break; } t += d; }
  if (!hit) { outColor = vec4(0.); return; }
  vec3 n = normalAt(ro + rd * t), l = normalize(vec3(.5, .9, .7)), h = normalize(l - rd);
  float diff = max(dot(n, l), 0.), spec = pow(max(dot(n, h), 0.), 60.), rim = pow(1. - max(dot(n, -rd), 0.), 3.);
  outColor = vec4(uTint * (.28 + .72 * diff) + vec3(spec * .9 + rim * .25), 1.); }`));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return `3D skipped, page unchanged: ${gl.getProgramInfoLog(prog)}`;
gl.useProgram(prog); gl.uniform3fv(gl.getUniformLocation(prog, 'uTint'), tint);
const uRes = gl.getUniformLocation(prog, 'uRes'), uTime = gl.getUniformLocation(prog, 'uTime');
host.append(canvas); target.before(host);
let raf = 0, visible = true, dead = false;
const draw = t => { raf = 0; if (dead || !visible || document.hidden) return;
  const dpr = Math.min(devicePixelRatio, 1), w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
  gl.uniform2f(uRes, w, h); gl.uniform1f(uTime, still ? 4 : t / 1000); gl.drawArrays(gl.TRIANGLES, 0, 3);
  if (!still) raf = requestAnimationFrame(draw); };
const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) raf = requestAnimationFrame(draw); }); io.observe(host);
canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); globalThis.__tsBlob?.(); });
globalThis.__tsBlob = () => { dead = true; cancelAnimationFrame(raf); io.disconnect(); gl.getExtension('WEBGL_lose_context')?.loseContext(); host.remove(); delete globalThis.__tsBlob; };
raf = requestAnimationFrame(draw);
return 'Raw WebGL2 blob added.';
```

## Done check

Run these before saying it's done. Report anything you couldn't verify. Budgets below are proposals, except the triangle, texture and file limits, which come from Google and Khronos [S14].

| Metric | Decorative or hero | Viewer or scene |
|---|---|---|
| Frame rate | 30 fps or more, 0 when idle | 30 on mobile, 60 target on desktop |
| Draw calls (`report().calls`) | Under 50 | Under 100 |
| Triangles (`report().triangles`) | Under 50k | Under 100k |
| Textures | 1K | 2K at most |
| Assets downloaded | Under 1 MB | Under 5 MB, hard stop at 10 MB |
| Pixel ratio | 1.5 at most | 2 at most |
| First visible frame | Within 2 to 3 s, or stay on the page as it was | Same, with progress |

**Visual.** Take a screenshot, and read `report()`:
- Every part in your tree exists, has a sensible size, touches its parent, and is visible. Match each claim you plan to make against the screenshot.
- The result looks intentional: rounded edges, one style, palette from the page, grounded with a shadow, framed with nothing cut off.
- It sits well in the page, with spacing, alignment and transparent edges that look right.
- Compared with the reference, if there is one. Say what's different.
- If the screenshot shows nothing, wait and retake it: the canvas fades in, and loops pause while off-screen.

**Performance:**
- `report()` is inside the budgets. Scroll away and confirm rendering stops, and static scenes draw only on change.
- Run the script twice. There's still only one `[data-ts-ui]` host.
- Run `s.dispose()` from another script, and check that the host is gone and the page's own canvases still work.
- You can't test weak devices or phones from here, so tell the user. Software rendering hides real GPU cost.

**Accessibility:**
- Informative canvas has `role="img"` and a real `aria-label`. Decorative is `aria-hidden` with no focus stop.
- Reduced motion: no auto-rotation, parallax or camera moves, and rotation by hand still works. To test, emulate it or reason through `s.still`.
- Autoplay has a working Pause button, or ends within 5 seconds.
- Dragging has a non-drag option (`s.orbit` adds buttons and arrow keys), and Tab can always leave.
- The wheel and vertical swipes still scroll the page. No text or data lives only inside the canvas, and text over a background still meets contrast.

**Then report:** the decision and why, what you built, parts and budget numbers from `report()`, any asset with its license and credit, what couldn't be checked, and how to remove it. Close with the fact that it's a local change in this browser.

## Sources

Checked 2026-11-04. Items marked *may change* should be rechecked when updating `lastVerified`. Library code: three.js [MIT](https://raw.githubusercontent.com/mrdoob/three.js/dev/LICENSE), used at r187. The kit and recipes are original to this playbook. The text recipe's Droid Sans font is [Apache-2.0](https://cdn.jsdelivr.net/gh/mrdoob/three.js@r187/examples/fonts/droid/NOTICE).

- **S1** Tan, Chandukala and Reddy, Journal of Marketing 2022: [Kellogg summary](https://www.kellogg.northwestern.edu/academics-research/research/detail/2022/augmented-reality-in-retail-and-its-impact-on-sales/), [AMA summary](https://www.ama.org/2021/04/20/augmented-reality-in-retail-and-its-impact-on-sales-2/). AR on one retailer's app, read through summaries. Vendor figures such as [Shopify's 94%](https://changelog.shopify.com/posts/shop-adds-3d-and-augmented-reality-ar-previews) give no method.
- **S2** [Baymard, video and 360 views](https://baymard.com/ecommerce-design-examples/video-and-360-views). 360 views, which are adjacent to WebGL viewers.
- **S3** [Hughes 2001](https://research.universityofgalway.ie/en/publications/just-noticeable-differences-in-2d-and-3d-bar-charts-a-psychophysi-3/), [Munzner, "no unjustified 3D"](https://cs.ubc.ca/~tmm/talks/vad/VAD-rules.pdf). Disputed in part by [Kosara](https://eagereyes.org/blog/2016/3d-bar-charts-considered-not-that-harmful).
- **S4** [NN/g, 2D is better than 3D](https://www.nngroup.com/articles/2d-is-better-than-3d/), 1998.
- **S5** First-hand tests in this project: Chrome for Testing 141 in a probe extension with TamperSloth's CSP strings, and this kit on a strict-CSP page. See `research_notes/Web 3D rendering for userscripts/frameworks_and_loading.md`. *May change:* undocumented Chrome behavior. Not retested on current stable. Docs: [userScripts API](https://developer.chrome.com/docs/extensions/reference/api/userScripts), [three.js migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [WebGPURenderer manual](https://threejs.org/manual/pages/webgpurenderer.html). Sizes measured from [jsDelivr](https://cdn.jsdelivr.net/npm/three@0.187.0/+esm).
- **S6** [WorldBench](https://arxiv.org/html/2610.10622v1), one prompt per model.
- **S7** [P3D-Bench](https://arxiv.org/html/2606.11152v1).
- **S8** [3DHarnessBench](https://arxiv.org/html/2609.06535), Blender rather than Three.js.
- **S9** [img2threejs](https://github.com/img2threejs/img2threejs) (Apache-2.0, no fidelity metrics), [three.js docs](https://threejs.org/docs/), [three.js examples](https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/files.json). Licenses: [drei](https://raw.githubusercontent.com/pmndrs/drei/master/LICENSE), [maath](https://raw.githubusercontent.com/pmndrs/maath/main/LICENSE), [troika](https://raw.githubusercontent.com/protectwise/troika/main/LICENSE), [three-subdivide](https://github.com/stevinz/three-subdivide), [tsl-textures](https://raw.githubusercontent.com/boytchev/tsl-textures/main/LICENSE), [LYGIA](https://raw.githubusercontent.com/patriciogonzalezvivo/lygia/main/LICENSE.md). [Quilez](https://iquilezles.org/) and [Shadertoy](https://www.shadertoy.com/terms) terms were read second-hand, so confirm them.
- **S10** [Khronos PBR Neutral](https://github.com/KhronosGroup/ToneMapping/blob/main/PBR_Neutral/README.md), [model-viewer docs](https://modelviewer.dev/examples/tone-mapping), [MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html), and a benchmark run for this project (`beauty_and_interaction.md`). Visual-gain scores are judgment.
- **S11** Header checks for this project (`open_assets_and_generation.md`), not rendered except where noted. Licenses: [Poly Haven](https://polyhaven.com/license), [RobotExpressive](https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/RobotExpressive/README.md), [Lantern](https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/8f492390ddc7a2ae221a1369ef560589cf8c70fb/Models/Lantern/metadata.json), [Poly Pizza adventurer](https://poly.pizza/m/5EGWBMpuXq). Quotas: [ZeroGPU](https://huggingface.co/docs/hub/spaces-zerogpu), [Hunyuan3D license](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2/main/LICENSE). *May change:* Space status, quotas, Poly Haven paths, Poly Pizza terms, [jsDelivr terms](https://raw.githubusercontent.com/jsdelivr/jsdelivr/master/Terms%20of%20Use.md). No provider's terms address hotlinking directly.
- **S12** [NN/g, scrolljacking](https://www.nngroup.com/articles/scrolljacking-101/).
- **S13** WCAG 2.2: [2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html), [2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html), [1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content.html), [2.1.2](https://www.w3.org/WAI/WCAG22/Understanding/no-keyboard-trap.html). Applying them to orbit controls is an interpretation.
- **S14** [Google Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer), [Khronos limits via the three.js forum](https://discourse.threejs.org/t/maximum-3d-model-size-to-load/46077/7), [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices). FPS, draw-call and pixel-ratio numbers are conventions, not standards.
