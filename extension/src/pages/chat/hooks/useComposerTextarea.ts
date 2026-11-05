import { useEffect, useRef } from "react";

/** The composer's input: grows with its text up to six lines, and takes focus when the panel opens. */
export function useComposerTextarea(draft: string) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const fitTextarea = () => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.style.height = "auto";
        const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20;
        const maxHeight = lineHeight * 6;
        ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`;
        ta.style.overflowY = ta.scrollHeight > maxHeight ? "auto" : "hidden";
    };

    useEffect(fitTextarea, [draft]);

    // Opening the panel puts the caret in the input, so the user can type right away.
    // The panel window can gain focus after mount, so focus again then unless something else has it.
    useEffect(() => {
        const focusInput = () => {
            const active = document.activeElement;
            if (active && active !== document.body) return;
            textareaRef.current?.focus({ preventScroll: true });
        };
        focusInput();
        const frame = requestAnimationFrame(focusInput);
        window.addEventListener("focus", focusInput);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("focus", focusInput);
        };
    }, []);

    // The side panel can mount this while still opening (near-zero width), which wraps
    // the placeholder into many lines; refit whenever the width settles.
    useEffect(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        let lastWidth = ta.clientWidth;
        const observer = new ResizeObserver(() => {
            if (ta.clientWidth === lastWidth) return;
            lastWidth = ta.clientWidth;
            fitTextarea();
        });
        observer.observe(ta);
        return () => observer.disconnect();
    }, []);

    return textareaRef;
}
