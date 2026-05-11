import { useCallback } from "react";

export function clearPickedMarkers(tabId: number) {
    if (typeof chrome === "undefined" || !chrome?.scripting) return;
    chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
            document.querySelectorAll<HTMLElement>("[data-tampersloth-picked]").forEach((el) => {
                el.style.outline = el.dataset.tamperslothPrevOutline || "";
                el.style.outlineOffset = el.dataset.tamperslothPrevOutlineOffset || "";
                el.style.background = el.dataset.tamperslothPrevBackground || "";
                delete el.dataset.tamperslothPicked;
                delete el.dataset.tamperslothPrevOutline;
                delete el.dataset.tamperslothPrevOutlineOffset;
                delete el.dataset.tamperslothPrevBackground;
            }),
    });
}

export interface UseElementPickerArgs {
    tabId: number;
    isPicking: boolean;
    setIsPicking: (v: boolean | ((prev: boolean) => boolean)) => void;
    setPickedElements: (updater: (prev: string[]) => string[]) => void;
}

export function useElementPicker({
    tabId,
    isPicking,
    setIsPicking,
    setPickedElements,
}: UseElementPickerArgs) {
    const cancel = useCallback(async () => {
        setIsPicking(false);
        if (typeof chrome === "undefined" || !chrome?.scripting) return;
        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                document.getElementById("__tampersloth-picker-overlay")?.remove();
                document.getElementById("__tampersloth-picker-highlight")?.remove();
                (window as any).__tamperslothPickerActive = false;
            },
        });
    }, [tabId, setIsPicking]);

    const start = useCallback(async () => {
        if (isPicking) {
            await cancel();
            return;
        }
        if (typeof chrome === "undefined" || !chrome?.scripting) return;

        setIsPicking(true);
        const listener = (message: any) => {
            if (message.type === "ELEMENT_PICKED") {
                setPickedElements((prev) => [...prev, message.outerHTML]);
                setIsPicking(false);
                chrome.runtime.onMessage.removeListener(listener);
            } else if (message.type === "PICKER_CANCELLED") {
                setIsPicking(false);
                chrome.runtime.onMessage.removeListener(listener);
            }
        };
        chrome.runtime.onMessage.addListener(listener);

        await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                if ((window as any).__tamperslothPickerActive) return;
                (window as any).__tamperslothPickerActive = true;

                const overlay = document.createElement("div");
                overlay.id = "__tampersloth-picker-overlay";
                Object.assign(overlay.style, {
                    position: "fixed",
                    inset: "0",
                    zIndex: "2147483647",
                    background: "transparent",
                });

                const highlight = document.createElement("div");
                highlight.id = "__tampersloth-picker-highlight";
                Object.assign(highlight.style, {
                    position: "fixed",
                    pointerEvents: "none",
                    zIndex: "2147483646",
                    border: "2px solid rgb(63, 74, 42)",
                    borderRadius: "4px",
                    background:
                        "repeating-linear-gradient(45deg, rgba(63,74,42,0.06), rgba(63,74,42,0.06) 10px, rgba(63,74,42,0.14) 10px, rgba(63,74,42,0.14) 20px)",
                    backgroundSize: "28px 28px",
                    transition:
                        "top 0.05s ease-out, left 0.05s ease-out, width 0.05s ease-out, height 0.05s ease-out",
                    display: "none",
                });
                document.documentElement.appendChild(highlight);
                document.documentElement.appendChild(overlay);

                let currentEl: Element | null = null;

                const onMove = (e: MouseEvent) => {
                    overlay.style.pointerEvents = "none";
                    const el = document.elementFromPoint(e.clientX, e.clientY);
                    overlay.style.pointerEvents = "auto";
                    if (!el || el === overlay || el === highlight) return;
                    currentEl = el;
                    const rect = el.getBoundingClientRect();
                    Object.assign(highlight.style, {
                        display: "block",
                        top: rect.top + "px",
                        left: rect.left + "px",
                        width: rect.width + "px",
                        height: rect.height + "px",
                    });
                };

                const cleanup = () => {
                    overlay.remove();
                    highlight.remove();
                    (window as any).__tamperslothPickerActive = false;
                };

                const onClick = (e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentEl) {
                        const el = currentEl as HTMLElement;
                        el.dataset.tamperslothPicked = "true";
                        el.dataset.tamperslothPrevOutline = el.style.outline;
                        el.dataset.tamperslothPrevOutlineOffset = el.style.outlineOffset;
                        el.dataset.tamperslothPrevBackground = el.style.background;
                        el.style.outline = "2px solid rgb(63, 74, 42)";
                        el.style.outlineOffset = "-2px";
                        el.style.background =
                            "repeating-linear-gradient(45deg, rgba(63,74,42,0.06), rgba(63,74,42,0.06) 10px, rgba(63,74,42,0.14) 10px, rgba(63,74,42,0.14) 20px)";
                        chrome.runtime.sendMessage({
                            type: "ELEMENT_PICKED",
                            outerHTML: currentEl.outerHTML,
                        });
                    }
                    cleanup();
                };

                const onKeyDown = (e: KeyboardEvent) => {
                    if (e.key === "Escape") {
                        chrome.runtime.sendMessage({ type: "PICKER_CANCELLED" });
                        cleanup();
                    }
                };

                overlay.addEventListener("mousemove", onMove);
                overlay.addEventListener("click", onClick);
                document.addEventListener("keydown", onKeyDown, { once: true });
            },
        });
    }, [isPicking, cancel, tabId, setIsPicking, setPickedElements]);

    const remove = useCallback(
        (index: number) => {
            setPickedElements((prev) => prev.filter((_, j) => j !== index));
            if (typeof chrome === "undefined" || !chrome?.scripting) return;
            chrome.scripting.executeScript({
                target: { tabId },
                func: (idx: number) => {
                    const els = document.querySelectorAll<HTMLElement>("[data-tampersloth-picked]");
                    const el = els[idx];
                    if (el) {
                        el.style.outline = el.dataset.tamperslothPrevOutline || "";
                        el.style.outlineOffset = el.dataset.tamperslothPrevOutlineOffset || "";
                        el.style.background = el.dataset.tamperslothPrevBackground || "";
                        delete el.dataset.tamperslothPicked;
                        delete el.dataset.tamperslothPrevOutline;
                        delete el.dataset.tamperslothPrevOutlineOffset;
                        delete el.dataset.tamperslothPrevBackground;
                    }
                },
                args: [index],
            });
        },
        [tabId, setPickedElements],
    );

    return { start, cancel, remove };
}
