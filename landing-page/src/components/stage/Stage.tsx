import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Frame, NARROW, WIDE } from "./Frame";
import { gsap, ScrollTrigger, scrollToTarget } from "../../lib/motion";
import "../../styles/stage.css";

const STEPS: { n: string; label: string; title: ReactNode; sub: string }[] = [
  {
    n: "01",
    label: "Do it",
    title: (
      <>
        Consider it <span className="accent">handled.</span>
      </>
    ),
    sub: "Ask in plain words. Sloth clicks, types and drags through the page for you, and shows every step as it goes.",
  },
  {
    n: "02",
    label: "Show me",
    title: (
      <>
        A little guidance. <span className="accent">Right on the page.</span>
      </>
    ),
    sub: "Rather learn it yourself? Sloth draws the next step on the page, then waits for you to take it.",
  },
  {
    n: "03",
    label: "Keep it",
    title: (
      <>
        Teach it once. <span className="accent">Keep it forever.</span>
      </>
    ),
    sub: "Turn any fix into a script that runs every time you visit. Pause it, edit it or bin it whenever you like.",
  },
];

/**
 * The product stage. It rises out of the hero tilted back, flattens as it
 * arrives, then pins while the three modes play one after another.
 */
export function Stage() {
  const section = useRef<HTMLElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const fit = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const bars = useRef<(HTMLSpanElement | null)[]>([]);
  const pin = useRef<ScrollTrigger | null>(null);
  const stepRef = useRef(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [layout, setLayout] = useState({ narrow: false, scale: 0.8 });

  // Scale the fixed-size frame into whatever room the viewport leaves.
  useLayoutEffect(() => {
    const el = fit.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      const narrow = w < 700;
      const d = narrow ? NARROW : WIDE;
      const scale = Math.max(0.2, Math.min(w / d.w, h / d.h, 1.12));
      setLayout((prev) => (prev.narrow === narrow && Math.abs(prev.scale - scale) < 0.002 ? prev : { narrow, scale }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Publish the header's height so the hero can overlap it.
  useLayoutEffect(() => {
    const el = head.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--stage-head-h", `${el.offsetHeight}px`);
      ScrollTrigger.refresh();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = section.current;
    if (!el) return;
    const ctx = gsap.context(() => {
      pin.current = ScrollTrigger.create({
        trigger: el,
        start: "top top",
        end: () => `+=${Math.round(window.innerHeight * 3.3)}`,
        pin: true,
        anticipatePin: 1,
        onUpdate: (self) => {
          const p = self.progress * 3;
          const i = Math.min(2, Math.floor(p));
          if (i !== stepRef.current) {
            stepRef.current = i;
            setStep(i);
          }
          bars.current.forEach((b, j) => {
            if (b) b.style.transform = `scaleX(${Math.max(0, Math.min(1, p - j))})`;
          });
        },
      });

      gsap.fromTo(
        tilt.current,
        { rotateX: 24, scale: 0.88, yPercent: 4 },
        {
          rotateX: 0,
          scale: 1,
          yPercent: 0,
          ease: "none",
          scrollTrigger: { trigger: el, start: "top bottom", end: "top top", scrub: true },
        },
      );
      // The hero's copy and ink step back as the stage arrives, then the stage header takes over.
      const heroBits = document.querySelectorAll(".hero-inner, .hero-annot");
      gsap.to(heroBits, {
        autoAlpha: 0,
        y: -60,
        ease: "none",
        // Measured from the top of the page, so a short hero (phones) starts fully visible.
        scrollTrigger: { trigger: document.querySelector(".hero"), start: "top top", end: "bottom 30%", scrub: true },
      });
      gsap.fromTo(
        head.current,
        { autoAlpha: 0, y: 24 },
        { autoAlpha: 1, y: 0, ease: "none", scrollTrigger: { trigger: el, start: "top 22%", end: "top 0%", scrub: true } },
      );
    }, el);
    return () => ctx.revert();
  }, []);

  const goTo = (i: number) => {
    const st = pin.current;
    if (!st) return;
    scrollToTarget(Math.round(st.start + ((i + 0.08) / 3) * (st.end - st.start)));
  };

  const d = layout.narrow ? NARROW : WIDE;

  return (
    <section id="stage" ref={section} className="stage-sec" aria-label="What Tampersloth does">
      <div ref={head} className="stage-head container">
        <div className="stage-tabs" role="tablist" aria-label="Modes">
          {STEPS.map((s, i) => (
            <button key={s.n} role="tab" aria-selected={step === i} className={`stage-tab ${step === i ? "is-on" : ""}`} onClick={() => goTo(i)}>
              <span className="stage-tab-label">
                <span className="num">{s.n}</span> {s.label}
              </span>
              <span className="stage-tab-track">
                <span ref={(b) => void (bars.current[i] = b)} className="stage-tab-bar" />
              </span>
            </button>
          ))}
        </div>
        <div className="stage-copy">
          <div className="stage-titles">
            {STEPS.map((s, i) => (
              <h2 key={s.n} className={`stage-title ${step === i ? "is-on" : ""}`} aria-hidden={step !== i}>
                {s.title}
              </h2>
            ))}
          </div>
          <div className="stage-subs">
            {STEPS.map((s, i) => (
              <p key={s.n} className={`stage-sub ${step === i ? "is-on" : ""}`} aria-hidden={step !== i}>
                {s.sub}
              </p>
            ))}
          </div>
        </div>
      </div>

      <div ref={fit} className="stage-fit">
        <div className="stage-persp">
          <div ref={tilt} className="stage-tilt" style={{ width: d.w * layout.scale, height: d.h * layout.scale }}>
            <div className="stage-scale" style={{ transform: `scale(${layout.scale})` }}>
              <Frame step={step} playing={playing} narrow={layout.narrow} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
