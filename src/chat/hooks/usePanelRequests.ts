import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { hasNewPanelRequest, panelRequestPrefix, takePanelRequests, type PanelRequest } from "../lib/panelRequests";

const tabId = Number(new URLSearchParams(window.location.search).get("tabId")) || 0;

function canListen() {
    return tabId > 0 && typeof chrome !== "undefined" && !!chrome.storage?.session;
}

/** Hands this tab's waiting requests to `onRequest`, now and as new ones arrive. */
export function usePanelRequests(onRequest: (request: PanelRequest) => void) {
    const handler = useRef(onRequest);
    handler.current = onRequest;

    useEffect(() => {
        if (!canListen()) return;
        let live = true;
        // One drain at a time, so two quick changes never hand over the same request twice.
        let chain = Promise.resolve();
        const drain = () => {
            chain = chain.then(async () => {
                if (!live) return;
                for (const request of await takePanelRequests(tabId)) handler.current(request);
            }).catch((error) => console.warn("[Tampersloth] Could not read panel requests:", error));
        };
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area === "session" && hasNewPanelRequest(changes, tabId)) drain();
        };
        chrome.storage.onChanged.addListener(onChanged);
        drain();
        return () => {
            live = false;
            chrome.storage.onChanged.removeListener(onChanged);
        };
    }, []);
}

/** Brings the panel back to the chat when a request arrives while it shows another page. */
export function usePanelRequestRouting() {
    const navigate = useNavigate();
    const { pathname } = useLocation();

    useEffect(() => {
        if (!canListen() || pathname === "/") return;
        const prefix = panelRequestPrefix(tabId);
        void chrome.storage.session.get(null).then((stored) => {
            if (Object.keys(stored).some((key) => key.startsWith(prefix))) navigate("/");
        });
        const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area === "session" && hasNewPanelRequest(changes, tabId)) navigate("/");
        };
        chrome.storage.onChanged.addListener(onChanged);
        return () => chrome.storage.onChanged.removeListener(onChanged);
    }, [pathname, navigate]);
}
