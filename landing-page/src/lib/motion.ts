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

/** immediate jumps without the glide, as a browser does for a link from another page. */
export function scrollToTarget(target: number | HTMLElement, { immediate = false } = {}) {
  if (lenis) {
    lenis.scrollTo(target, immediate ? { immediate: true } : { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  } else {
    const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: immediate || prefersReducedMotion() ? "auto" : "smooth" });
  }
}

/**
 * Arriving with a #section (from the pricing page's nav), the browser jumps
 * before React has drawn anything, so it lands on the hero. Go there once the
 * page has its full height: after load, when pinned sections have their spacers.
 */
export function scrollToHashOnLoad() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || id === "top") return () => {};
  let cancelled = false;
  const go = () =>
    setTimeout(() => {
      const el = document.getElementById(id);
      if (cancelled || !el) return;
      ScrollTrigger.refresh();
      scrollToTarget(el, { immediate: true });
    });
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", go);
  };
}

export { gsap, ScrollTrigger };
