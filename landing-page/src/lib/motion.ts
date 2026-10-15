import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { prefersReducedMotion } from "./pen";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

/** Smooth scrolling driven from GSAP's ticker so ScrollTrigger stays in step. */
export function startSmoothScroll() {
  if (lenis || prefersReducedMotion()) return () => {};
  lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.95 });
  lenis.on("scroll", ScrollTrigger.update);
  const tick = (time: number) => lenis?.raf(time * 1000);
  gsap.ticker.add(tick);
  gsap.ticker.lagSmoothing(0);

  // In-page links go through Lenis too.
  const onClick = (e: MouseEvent) => {
    const a = (e.target as Element | null)?.closest?.("a[href^='#']") as HTMLAnchorElement | null;
    if (!a) return;
    const id = a.getAttribute("href")!.slice(1);
    const el = id === "top" ? document.body : document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    scrollToTarget(el);
  };
  document.addEventListener("click", onClick);
  return () => {
    document.removeEventListener("click", onClick);
    gsap.ticker.remove(tick);
    lenis?.destroy();
    lenis = null;
  };
}

export function scrollToTarget(target: number | HTMLElement) {
  if (lenis) {
    lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  } else {
    const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }
}

export { gsap, ScrollTrigger };
