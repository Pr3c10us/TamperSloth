import { cn } from "@/lib/utils";

export const CARD_EASE = "cubic-bezier(.22,.61,.36,1)";
export const CARD_DUR = 240;

// One-time keyframe injection. Multiple <style> tags with the same
// rules are harmless, but we key off id to keep DevTools tidy.
const STYLE_ID = "tampersloth-card-keyframes";
function ensureStyles() {
    if (typeof document === "undefined") return;
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = `
@keyframes cardItemEnter {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
@keyframes cardEnter {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
}
`;
    document.head.appendChild(el);
}
ensureStyles();

export function Eyebrow({
                            children,
                            className,
                            tone = "muted",
                        }: {
    children: React.ReactNode;
    className?: string;
    tone?: "muted" | "foreground" | "background";
}) {
    const toneClass =
        tone === "background"
            ? "text-background/70"
            : tone === "foreground"
                ? "text-foreground"
                : "text-muted-foreground";
    return (
        <span
            className={cn(
                "font-mono text-[10px] uppercase tracking-[.14em]",
                toneClass,
                className,
            )}
        >
            {children}
        </span>
    );
}
