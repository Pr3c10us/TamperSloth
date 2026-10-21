import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const isChromeExtension =
    typeof chrome !== "undefined" && !!chrome?.runtime?.sendMessage;

/**
 * Warns when the `userScripts` API is unavailable — script execution and every
 * saved background script silently do nothing until the user enables
 * "Allow User Scripts" on the extension's details page.
 *
 * `null` while the probe is in flight so the banner never flashes on load.
 */
export function UserScriptsBanner() {
    const [available, setAvailable] = useState<boolean | null>(null);

    const check = useCallback(async () => {
        if (!isChromeExtension) return;
        try {
            const response = await chrome.runtime.sendMessage({
                type: "CHECK_USERSCRIPTS",
            });
            setAvailable(response?.available === true);
        } catch {
            setAvailable(false);
        }
    }, []);

    useEffect(() => {
        void check();
    }, [check]);

    // The toggle lives on another page, so re-probe whenever the panel is
    // focused again rather than making the user hunt for the re-check button.
    useEffect(() => {
        const onFocus = () => void check();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
    }, [check]);

    if (available !== false) return null;

    const openDetails = () => {
        void chrome.tabs.create({
            url: `chrome://extensions/?id=${chrome.runtime.id}`,
        });
    };

    return (
        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-muted/40 px-3.5 py-3">
            <div className="flex items-center gap-2">
                <AlertTriangle
                    className="size-3.5 shrink-0 text-destructive"
                    strokeWidth={1.5}
                />
                <span className="font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                    User scripts disabled
                </span>
            </div>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
                Script execution and saved background scripts won&apos;t run. Enable{" "}
                <span className="text-foreground">Allow User Scripts</span> on the
                TamperSloth details page, then reload the extension.
            </p>
            <div className="flex items-center gap-1.5">
                <Button variant="outline" size="xs" onClick={openDetails}>
                    <ExternalLink strokeWidth={1.5} />
                    Extension details
                </Button>
                <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => void check()}
                    className="text-muted-foreground"
                >
                    <RefreshCw strokeWidth={1.5} />
                    Re-check
                </Button>
            </div>
        </div>
    );
}
