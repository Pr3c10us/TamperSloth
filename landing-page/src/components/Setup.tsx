import { useEffect, useRef, useState } from "react";
import { SidePanel } from "./panel/Panel";
import { isMac } from "../lib/site";
import "../styles/setup.css";

const KEYS = [
  { id: "mod", label: isMac ? "⌘" : "Ctrl", sub: isMac ? "command" : "control", wide: true },
  { id: "shift", label: "⇧", sub: "shift", wide: true },
  { id: "s", label: "S", sub: "", wide: false },
];

const STEPS = [
  { n: "01", title: "Add it to Chrome", body: "One click from the Chrome Web Store. Chrome 138 or newer." },
  { n: "02", title: "Paste a key", body: "Use a key from Anthropic, OpenAI, Google or DeepSeek. It stays in the extension's local storage." },
  { n: "03", title: "Press the shortcut", body: "The side panel opens on whatever page you're on. Tell the sloth what to do." },
];

/**
 * Three keycaps that press themselves in sequence when in view, and respond to
 * the visitor's own keyboard. When all three are down, the panel peeks out.
 */
export function Setup() {
  const ref = useRef<HTMLDivElement>(null);
  const [down, setDown] = useState<Record<string, boolean>>({});
  const [opened, setOpened] = useState(false);
  const user = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timers: number[] = [];
    const play = () => {
      if (user.current) return;
      timers.forEach(clearTimeout);
      timers = [];
      const at = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
      at(300, () => setDown({ mod: true }));
      at(650, () => setDown({ mod: true, shift: true }));
      at(1000, () => setDown({ mod: true, shift: true, s: true }));
      at(1150, () => setOpened(true));
      at(1700, () => setDown({}));
      at(5200, () => setOpened(false));
      at(6200, play);
    };
    const io = new IntersectionObserver(([e]) => {
      timers.forEach(clearTimeout);
      if (e.isIntersecting) play();
    });
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    const map = (e: KeyboardEvent) => (e.key === "Control" || e.key === "Meta" ? "mod" : e.key === "Shift" ? "shift" : e.key.toLowerCase() === "s" ? "s" : null);
    const onDown = (e: KeyboardEvent) => {
      const k = map(e);
      if (!k || !ref.current) return;
      const r = ref.current.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      user.current = true;
      setDown((d) => {
        const next = { ...d, [k]: true };
        if (next.mod && next.shift && next.s) setOpened(true);
        return next;
      });
    };
    const onUp = (e: KeyboardEvent) => {
      const k = map(e);
      if (k) setDown((d) => ({ ...d, [k]: false }));
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  return (
    <section id="setup" className="setup container" aria-labelledby="setup-title">
      <div className="setup-grid">
        <div>
          <div className="section-head">
            <div className="eyebrow tick" data-reveal>
              Setup
            </div>
            <h2 id="setup-title" data-reveal style={{ ["--d" as string]: "80ms" }}>
              Three steps. <span className="accent">One shortcut.</span>
            </h2>
          </div>
          <ol className="setup-steps">
            {STEPS.map((s, i) => (
              <li key={s.n} data-reveal style={{ ["--d" as string]: `${160 + i * 90}ms` }}>
                <span className="setup-n">{s.n}</span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div ref={ref} className="keys-stage" data-reveal style={{ ["--d" as string]: "200ms" }}>
          <div className="keys" aria-label={`${KEYS.map((k) => k.sub || k.label).join(" + ")}`}>
            {KEYS.map((k, i) => (
              <span key={k.id} className="key-wrap">
                <span className={`key ${k.wide ? "is-wide" : ""} ${down[k.id] ? "is-down" : ""}`}>
                  <span className="key-top">
                    <b>{k.label}</b>
                    {k.sub && <small>{k.sub}</small>}
                  </span>
                </span>
                {i < KEYS.length - 1 && <span className="key-plus">+</span>}
              </span>
            ))}
          </div>
          {/* Chrome slides the side panel in from the right. */}
          <div className={`peek ${opened ? "is-open" : ""}`} aria-hidden>
            <div className="peek-inner">
              <SidePanel theme="dark" title={null} messages={[]} draft="" loading={false} />
            </div>
          </div>
          <p className="keys-hint">Go on, try it on your keyboard.</p>
        </div>
      </div>
    </section>
  );
}
