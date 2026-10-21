import { useCallback, useEffect } from "react";
import { runDrawOverlay } from "../../background/drawOverlay";

export interface UseDrawOverlayArgs {
    tabId: number;
    isDrawing: boolean;
    setIsDrawing: (v: boolean) => void;
}

/**
 * Starts and ends the page's drawing overlay. The finished drawing reaches the
 * chat as a panel request, so here only the overlay's lifetime is tracked.
 */
export function useDrawOverlay({ tabId, isDrawing, setIsDrawing }: UseDrawOverlayArgs) {
    // The overlay ends itself on "Add to chat" or Cancel; a page load wipes it.
    useEffect(() => {
        if (!isDrawing || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
        const onMessage = (message: any, sender: chrome.runtime.MessageSender) => {
            if (message?.type === "DRAW_ENDED" && sender.tab?.id === tabId) setIsDrawing(false);
        };
        const onUpdated = (id: number, info: { status?: string }) => {
            if (id === tabId && info.status === "loading") setIsDrawing(false);
        };
        chrome.runtime.onMessage.addListener(onMessage);
        chrome.tabs?.onUpdated.addListener(onUpdated);
        return () => {
            chrome.runtime.onMessage.removeListener(onMessage);
            chrome.tabs?.onUpdated.removeListener(onUpdated);
        };
    }, [isDrawing, tabId, setIsDrawing]);

    /** Resolves false when the page cannot be drawn on (e.g. a chrome:// page). */
    const start = useCallback(async () => {
        setIsDrawing(true);
        // The toolbar follows the panel's theme.
        const ok = await runDrawOverlay(tabId, "start", document.documentElement.classList.contains("dark") ? "dark" : "light");
        if (!ok) setIsDrawing(false);
        return ok;
    }, [tabId, setIsDrawing]);

    const cancel = useCallback(async () => {
        setIsDrawing(false);
        await runDrawOverlay(tabId, "dispose");
    }, [tabId, setIsDrawing]);

    return { start, cancel };
}
