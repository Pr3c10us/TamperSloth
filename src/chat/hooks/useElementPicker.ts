import { useCallback } from "react";
import { runPickerOverlay } from "../../background/pickerOverlay";

/** Removes every picked-element mark (and the overlay) from the tab. */
export function clearPickedMarkers(tabId: number) {
    void runPickerOverlay(tabId, { action: "clear" });
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
        await runPickerOverlay(tabId, { action: "stop" });
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
        await runPickerOverlay(tabId, { action: "start" });
    }, [isPicking, cancel, tabId, setIsPicking, setPickedElements]);

    // Marks are kept in pick order on the page, matching the chips' indexes.
    const remove = useCallback(
        (index: number) => {
            setPickedElements((prev) => prev.filter((_, j) => j !== index));
            void runPickerOverlay(tabId, { action: "remove", index });
        },
        [tabId, setPickedElements],
    );

    return { start, cancel, remove };
}
