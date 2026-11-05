import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {Globe} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {ConnectAsk} from "@/src/background/connectPrompt";

const pageHost = (url: string) => {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
};

/** The small window that asks whether a userscript may contact a site its @connect doesn't list. */
export default function ConnectPrompt() {
    const {id = ""} = useParams();
    const [ask, setAsk] = useState<ConnectAsk | null | undefined>(undefined);

    useEffect(() => {
        document.title = "Allow this site? · TamperSloth";
        const key = `ts_connect_ask_${id}`;
        void chrome.storage.session.get(key).then((stored) => setAsk((stored[key] as ConnectAsk | undefined) ?? null));
    }, [id]);

    const decide = (allow: boolean, remember: "session" | "always") => {
        // The background closes this window once it has the answer.
        void chrome.runtime.sendMessage({type: "CONNECT_DECISION", askId: id, allow, remember});
    };

    if (ask === undefined) return <div className="h-full bg-background"/>;
    if (ask === null) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-background px-6 text-center font-sans">
                <p className="text-[13.5px] text-muted-foreground">This request has expired.</p>
                <Button variant="outline" size="sm" onClick={() => window.close()}>Close</Button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-background px-6 py-6 font-sans">
            <p className="eyebrow mb-2 text-muted-foreground">TamperSloth · Userscript</p>
            <h1 className="font-heading text-[26px] leading-tight tracking-[var(--tracking-tight)]">
                Allow it to contact this site?
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-foreground">{ask.scriptName}</span>, running on {pageHost(ask.pageUrl)}, wants to send a request to:
            </p>
            <p className="mt-3 flex items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 py-2.5 font-mono text-[13px] break-all">
                <Globe strokeWidth={1.5} className="size-4 shrink-0 text-muted-foreground"/>
                {ask.host}
            </p>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
                Requests can include your cookies for that site. Only allow sites you expect this script to use.
            </p>
            <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
                <Button variant="outline" onClick={() => decide(false, "session")}>Block for now</Button>
                <Button variant="outline" onClick={() => decide(true, "session")}>Allow for now</Button>
                <Button variant="outline" onClick={() => decide(false, "always")}>Always block</Button>
                <Button onClick={() => decide(true, "always")}>Always allow</Button>
            </div>
        </div>
    );
}
