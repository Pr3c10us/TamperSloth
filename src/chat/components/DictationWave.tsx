import { useEffect, useRef, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { WAVE_BARS } from "../hooks/useDictation";

const MIN_HEIGHT = 2;
const MAX_HEIGHT = 18;

/**
 * The mic's recent loudness as a row of bars, newest on the right: silence reads
 * as dots, speech as bars. Heights are written straight to the DOM each frame.
 */
export function DictationWave({ levels, className }: { levels: RefObject<number[]>; className?: string }) {
    const barsRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        let frame = 0;
        const draw = () => {
            const bars = barsRef.current?.children;
            const values = levels.current ?? [];
            if (bars) {
                for (let i = 0; i < bars.length; i++) {
                    const level = values[values.length - bars.length + i] ?? 0;
                    (bars[i] as HTMLElement).style.height = `${MIN_HEIGHT + level * (MAX_HEIGHT - MIN_HEIGHT)}px`;
                }
            }
            frame = requestAnimationFrame(draw);
        };
        frame = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(frame);
    }, [levels]);

    return (
        <span ref={barsRef} aria-hidden className={cn("flex h-5 shrink-0 items-center justify-end gap-[2px] overflow-hidden", className)}>
            {Array.from({ length: WAVE_BARS }, (_, i) => (
                <span
                    key={i}
                    className="w-[2px] rounded-full bg-foreground/70 transition-[height] duration-75 ease-out"
                    style={{ height: MIN_HEIGHT }}
                />
            ))}
        </span>
    );
}
