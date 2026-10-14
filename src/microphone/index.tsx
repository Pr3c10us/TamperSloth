import { useEffect, useState } from "react";
import { Check, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Step = "asking" | "granted" | "blocked";

/** Closes this window; it was opened by the panel only to ask for the microphone. */
function closeWindow() {
    chrome.tabs.getCurrent((tab) => {
        if (tab?.id) void chrome.tabs.remove(tab.id);
        else window.close();
    });
}

/**
 * Chrome cannot show the microphone prompt inside a side panel, so the panel
 * opens this page in a small window. Once allowed, the whole extension may use
 * the mic, the panel starts listening by itself, and this window closes.
 */
export default function MicrophoneAccess() {
    const [step, setStep] = useState<Step>("asking");

    const ask = async () => {
        setStep("asking");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());
            setStep("granted");
        } catch {
            setStep("blocked");
        }
    };

    useEffect(() => {
        void ask();
    }, []);

    useEffect(() => {
        if (step !== "granted") return;
        const timer = setTimeout(closeWindow, 900);
        return () => clearTimeout(timer);
    }, [step]);

    const openSiteSettings = () => {
        void chrome.tabs.create({
            url: `chrome://settings/content/siteDetails?site=${encodeURIComponent(chrome.runtime.getURL("").replace(/\/$/, ""))}`,
        });
    };

    return (
        <main className="flex min-h-screen flex-col justify-center gap-5 bg-background px-7 py-8 font-sans text-foreground">
            <span
                className={
                    step === "blocked"
                        ? "flex size-10 items-center justify-center rounded-full bg-destructive/15 text-destructive"
                        : "flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent"
                }
            >
                {step === "granted" ? <Check strokeWidth={2} /> : step === "blocked" ? <MicOff strokeWidth={1.75} /> : <Mic strokeWidth={1.75} />}
            </span>
            <div className="flex flex-col gap-2">
                <h1 className="font-heading text-[34px] leading-[1.05] tracking-tight">
                    {step === "granted" ? <>Sloth is <em>listening</em></> : step === "blocked" ? <>Microphone <em>blocked</em></> : <>Let Sloth <em>hear</em> you</>}
                </h1>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {step === "granted"
                        ? "All set. Head back to the panel and start talking."
                        : step === "blocked"
                          ? "Chrome is blocking the microphone for TamperSloth. Allow it in site settings, then try again."
                          : "Chrome is asking to use your microphone for dictation. Choose Allow and this window closes by itself."}
                </p>
            </div>
            {step === "blocked" && (
                <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" onClick={() => void ask()}>Try again</Button>
                    <Button type="button" size="sm" variant="outline" onClick={openSiteSettings}>Open site settings</Button>
                    <Button type="button" size="sm" variant="ghost" onClick={closeWindow}>Close</Button>
                </div>
            )}
        </main>
    );
}
