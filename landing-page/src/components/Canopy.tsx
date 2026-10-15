import { useEffect, useRef } from "react";

/**
 * A slow, domain-warped moss field: light through a canopy, moving at sloth
 * speed. Rendered at reduced resolution and paused when offscreen.
 */
const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime * 0.03;

  vec2 q = vec2(fbm(p * 1.3 + vec2(0.0, t)), fbm(p * 1.3 + vec2(5.2, -t)));
  vec2 r = vec2(fbm(p * 1.6 + 2.2 * q + vec2(1.7, 9.2) + t * 1.2),
                fbm(p * 1.6 + 2.2 * q + vec2(8.3, 2.8) - t));
  float f = fbm(p * 1.1 + 2.6 * r);

  vec3 night = vec3(0.051, 0.055, 0.047);
  vec3 moss  = vec3(0.118, 0.145, 0.086);
  vec3 deep  = vec3(0.075, 0.09, 0.06);
  vec3 sage  = vec3(0.659, 0.741, 0.522);

  vec3 col = mix(night, deep, smoothstep(0.2, 0.7, f));
  col = mix(col, moss, smoothstep(0.55, 0.95, f) * 0.8);

  // Leaf-vein ridges catch a little light.
  float ridge = 1.0 - abs(2.0 * fbm(p * 2.6 + r * 1.4) - 1.0);
  col += sage * pow(ridge, 10.0) * 0.07 * smoothstep(0.35, 0.9, f);

  // A pool of light from above, nudged by the pointer.
  vec2 lp = vec2(uMouse.x * 0.35, 0.62 + uMouse.y * 0.06);
  float glow = exp(-length((p - lp) * vec2(0.75, 1.35)) * 2.1);
  col += sage * glow * (0.05 + 0.13 * f);

  // Fade into the page at the bottom and the edges.
  col = mix(col, night, smoothstep(0.42, 0.0, uv.y));
  float vig = smoothstep(1.25, 0.35, length((uv - vec2(0.5, 0.6)) * vec2(1.25, 1.0)));
  col = mix(night, col, vig);

  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = `attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

export function Canopy({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false, powerPreference: "low-power" });
    if (!gl) return;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    let visible = true;
    let raf = 0;
    const start = performance.now() - 40_000;

    const resize = () => {
      // Soft, organic image: half resolution is plenty and keeps it cheap.
      const scale = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
      const w = Math.max(1, Math.round(canvas.clientWidth * scale));
      const h = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    const draw = (now: number) => {
      resize();
      mouse.x += (mouse.tx - mouse.x) * 0.03;
      mouse.y += (mouse.ty - mouse.y) * 0.03;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      draw(now);
      if (visible && !reduced) raf = requestAnimationFrame(loop);
    };

    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = -(e.clientY / window.innerHeight - 0.5) * 2;
    };

    const io = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && !reduced) raf = requestAnimationFrame(loop);
    });
    io.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", () => draw(performance.now()));
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
