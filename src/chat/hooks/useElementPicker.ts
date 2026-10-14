import { useCallback, useEffect, useRef } from "react";
import { runPickerOverlay } from "../../background/pickerOverlay";
import type { PickedElement } from "../components/PickedElementChip";

/** Removes one chat's picked-element marks (and the overlay, if none are left) from the tab. */
export function clearPickedMarkers(tabId: number, group: string) {
    void runPickerOverlay(tabId, { action: "clear", group });
}

/** Shows one chat's marks on the page and hides every other chat's. */
export function showPickedMarkers(tabId: number, group: string) {
    void runPickerOverlay(tabId, { action: "show", group });
}

export interface UseElementPickerArgs {
    tabId: number;
    /** The chat whose draft receives picks; its marks are kept apart from other chats'. */
    group: string;
    isPicking: boolean;
    setIsPicking: (v: boolean | ((prev: boolean) => boolean)) => void;
    setPickedElements: (updater: (prev: PickedElement[]) => PickedElement[]) => void;
}

export function useElementPicker({
    tabId,
    group,
    isPicking,
    setIsPicking,
    setPickedElements,
}: UseElementPickerArgs) {
    // The pick in progress, removed however picking ends so a later pick isn't delivered twice.
    const listenerRef = useRef<((message: any) => void) | null>(null);
    const detach = useCallback(() => {
        if (listenerRef.current) chrome.runtime.onMessage.removeListener(listenerRef.current);
        listenerRef.current = null;
    }, []);

    const cancel = useCallback(async () => {
        detach();
        setIsPicking(false);
        await runPickerOverlay(tabId, { action: "stop" });
    }, [tabId, setIsPicking, detach]);

    // A pick belongs to the chat that started it; switching chats or leaving the page ends it.
    useEffect(() => () => {
        if (listenerRef.current) void cancel();
    }, [group, cancel]);

    const start = useCallback(async () => {
        if (isPicking) {
            await cancel();
            return;
        }
        if (typeof chrome === "undefined" || !chrome?.scripting) return;

        detach();
        setIsPicking(true);
        const listener = (message: any) => {
            if (message.type === "ELEMENT_PICKED") {
                setPickedElements((prev) => [...prev, {html: message.outerHTML, screenshot: message.screenshot ?? null}]);
                setIsPicking(false);
                detach();
            } else if (message.type === "PICKER_CANCELLED") {
                setIsPicking(false);
                detach();
            }
        };
        listenerRef.current = listener;
        chrome.runtime.onMessage.addListener(listener);
        await runPickerOverlay(tabId, { action: "start", group });
    }, [isPicking, cancel, detach, tabId, group, setIsPicking, setPickedElements]);

    // Marks are kept in pick order on the page, matching the chips' indexes.
    const remove = useCallback(
        (index: number) => {
            setPickedElements((prev) => prev.filter((_, j) => j !== index));
            void runPickerOverlay(tabId, { action: "remove", group, index });
        },
        [tabId, group, setPickedElements],
    );

    return { start, cancel, remove };
}
