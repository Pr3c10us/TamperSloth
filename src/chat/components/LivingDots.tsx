import {useEffect, useRef, useState} from "react";
import {cn} from "@/lib/utils";
import {createSwarm, DOT_COUNT} from "../lib/livingDots";

const WIDTH = 26;
const HEIGHT = 14;
const DOT = 4;

function usePrefersReducedMotion() {
    const [reduced, setReduced] = useState(() =>
        typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
    useEffect(() => {
        const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
        if (!query) return;
        const update = () => setReduced(query.matches);
        query.addEventListener("change", update);
        return () => query.removeEventListener("change", update);
    }, []);
    return reduced;
}

/**
 * Small inline loader: three accent dots performing choreographies in simulated depth.
 * Frames write transforms straight to the DOM, so React never re-renders and
 * nothing triggers layout.
 */
export function LivingDots({className}: { className?: string }) {
    const reduced = usePrefersReducedMotion();
    const slots = useRef<(HTMLSpanElement | null)[]>([]);

    useEffect(() => {
        if (reduced) return;
        const swarm = createSwarm();
        let frame = 0;
        let last = performance.now();
        const tick = (now: number) => {
            const views = swarm.step(now - last);
            last = now;
            views.forEach(view => {
                const element = slots.current[view.id];
                if (!element) return;
                // Coordinates peak around ±1.4 after perspective; scale them to stay inside the box.
                const x = WIDTH / 2 - DOT / 2 + view.x * (WIDTH / 2 - DOT / 2) * 0.75;
                const y = HEIGHT / 2 - DOT / 2 + view.y * (HEIGHT / 2 - DOT / 2) * 0.85;
                element.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scale(${view.scale.toFixed(3)})`;
                element.style.opacity = view.opacity.toFixed(3);
                element.style.filter = view.blur > 0.05 ? `blur(${view.blur.toFixed(2)}px)` : "";
                // Nearer dots draw over farther ones.
                element.style.zIndex = String(Math.round(view.scale * 100));
            });
            frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [reduced]);

    if (reduced) {
        return (
            <span aria-hidden className={cn("inline-flex shrink-0 items-center gap-[3px]", className)} style={{height: HEIGHT}}>
                {[0, 1, 2].map(i => (
                    <span key={i} className="ts-calm-pulse size-1 rounded-full bg-accent" style={{animationDelay: `${i * 0.4}s`}}/>
                ))}
            </span>
        );
    }
    return (
        // isolate keeps the per-dot depth z-index from stacking above other UI, such as the composer.
        <span aria-hidden className={cn("relative isolate inline-block shrink-0", className)} style={{width: WIDTH, height: HEIGHT}}>
            {Array.from({length: DOT_COUNT}, (_, i) => (
                <span
                    key={i}
                    ref={element => { slots.current[i] = element; }}
                    className="absolute left-0 top-0 rounded-full bg-accent opacity-0 will-change-transform"
                    style={{width: DOT, height: DOT}}
                />
            ))}
        </span>
    );
}
