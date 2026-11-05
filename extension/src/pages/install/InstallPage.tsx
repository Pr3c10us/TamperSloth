import {useCallback, useEffect, useRef, useState} from "react";
import {useSearchParams} from "react-router-dom";
import {AlertTriangle, Check, Link2, Loader2, Upload} from "lucide-react";
import {cn} from "@/ui/utils";
import {Button} from "@/ui/shadcn/button";
import {Input} from "@/ui/shadcn/input";
import {mergeScriptValues} from "@/storage/scriptValues";
import type {BackgroundScript} from "@/userscripts/types";
import {reloadedNote, reloadTabsForScripts} from "@/userscripts/scriptActions";
import {
    fetchUserscriptSource,
    installUserscript,
    PENDING_USERSCRIPT_KEY,
    prepareUserscript,
    type UserscriptDraft,
} from "@/userscripts/installUserscript";
import {readBackup, readZip} from "@/userscripts/backupZip";
import {closeTab} from "@/ui/closeTab";
import {BackupReview, type BackupItem} from "./BackupReview";
import {ScriptReview} from "./ScriptReview";

type Stage =
    | {kind: "entry"; error?: string}
    | {kind: "loading"; label: string}
    | {kind: "review"; draft: UserscriptDraft}
    | {kind: "installed"; script: BackgroundScript; note: string; updated: boolean}
    | {kind: "backup"; items: BackupItem[]; failures: {name: string; error: string}[]}
    | {kind: "restored"; count: number};

/** Full-tab install flow for Tampermonkey-style userscripts: pick a source, review what it does, install. */
export default function InstallPage() {
    const [params] = useSearchParams();
    // A .user.js link that opened this page in place: the URL is raw, and last, in the address.
    const linkedSource = location.hash.match(/[?&]src=(.*)$/)?.[1] ?? null;
    const [stage, setStage] = useState<Stage>({kind: "entry"});
    const [pasted, setPasted] = useState("");
    const [url, setUrl] = useState(params.get("url") ?? "");
    const [dragging, setDragging] = useState(false);
    const [userScriptsOn, setUserScriptsOn] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const prepare = useCallback(async (load: () => Promise<{source: string; sourceUrl?: string}>, label: string) => {
        setStage({kind: "loading", label});
        try {
            const {source, sourceUrl} = await load();
            setStage({kind: "loading", label: "Checking the script and fetching the files it needs…"});
            setStage({kind: "review", draft: await prepareUserscript(source, sourceUrl)});
        } catch (e) {
            setStage({kind: "entry", error: e instanceof Error ? e.message : String(e)});
        }
    }, []);

    const fromUrl = useCallback((target: string) => {
        const trimmed = target.trim();
        if (!trimmed) return;
        void prepare(async () => ({source: await fetchUserscriptSource(trimmed), sourceUrl: trimmed}), "Downloading the script…");
    }, [prepare]);

    const fromZip = useCallback(async (load: () => Promise<Uint8Array>) => {
        setStage({kind: "loading", label: "Reading the backup…"});
        try {
            const scripts = readBackup(await readZip(await load()));
            if (!scripts.length) throw new Error("There are no .user.js scripts in that .zip file.");
            const items: BackupItem[] = [];
            const failures: {name: string; error: string}[] = [];
            for (const [i, backup] of scripts.entries()) {
                setStage({kind: "loading", label: `Preparing script ${i + 1} of ${scripts.length}…`});
                try {
                    items.push({draft: await prepareUserscript(backup.source), values: backup.values, enabled: backup.enabled});
                } catch (e) {
                    failures.push({name: backup.fileName, error: e instanceof Error ? e.message : String(e)});
                }
            }
            setStage({kind: "backup", items, failures});
        } catch (e) {
            setStage({kind: "entry", error: e instanceof Error ? e.message : String(e)});
        }
    }, []);

    const fromFile = (file: File) => {
        if (file.name.toLowerCase().endsWith(".zip")) void fromZip(async () => new Uint8Array(await file.arrayBuffer()));
        else void prepare(async () => ({source: await file.text()}), `Reading ${file.name}…`);
    };

    const restore = async (items: BackupItem[]) => {
        setStage({kind: "loading", label: "Installing…"});
        try {
            for (const item of items) {
                const script = await installUserscript(item.draft, item.enabled ? undefined : "paused");
                if (Object.keys(item.values).length) await mergeScriptValues(script.id, item.values);
            }
            setStage({kind: "restored", count: items.length});
        } catch (e) {
            setStage({kind: "entry", error: e instanceof Error ? e.message : String(e)});
        }
    };

    // A file chosen in the gallery, or a ?url= link, starts straight at the review.
    useEffect(() => {
        const initialUrl = linkedSource ?? params.get("url");
        if (initialUrl) {
            setUrl(initialUrl);
            fromUrl(initialUrl);
            return;
        }
        void chrome.storage.session.get(PENDING_USERSCRIPT_KEY).then((result) => {
            const pending = result[PENDING_USERSCRIPT_KEY] as {source?: string; zip?: string} | undefined;
            if (!pending) return;
            void chrome.storage.session.remove(PENDING_USERSCRIPT_KEY);
            if (pending.zip) void fromZip(async () => Uint8Array.from(atob(pending.zip!), (c) => c.charCodeAt(0)));
            else if (pending.source) void prepare(async () => ({source: pending.source!}), "Reading the script…");
        });
        // Runs once, for how the tab was opened.
    }, []);

    // The toggle lives on another page, so check again whenever this tab is focused.
    useEffect(() => {
        const check = () => void chrome.runtime.sendMessage({type: "CHECK_USERSCRIPTS"})
            .then((r) => setUserScriptsOn(r?.available === true), () => setUserScriptsOn(false));
        check();
        window.addEventListener("focus", check);
        return () => window.removeEventListener("focus", check);
    }, []);

    const title = stage.kind === "review" ? stage.draft.parsed.name : stage.kind === "installed" ? stage.script.name : "";
    useEffect(() => {
        document.title = title ? `Install ${title} · TamperSloth` : "Install a userscript · TamperSloth";
    }, [title]);

    const install = async (draft: UserscriptDraft) => {
        setStage({kind: "loading", label: "Installing…"});
        try {
            const script = await installUserscript(draft);
            const count = await reloadTabsForScripts([script]);
            setStage({kind: "installed", script, note: reloadedNote(count), updated: !!draft.existing});
            // Opened from Greasy Fork's page: the background sends that tab to the
            // script's post-install page and closes this one, as after a Tampermonkey install.
            void chrome.runtime.sendMessage({type: "USERSCRIPT_INSTALLED"}).catch(() => {});
        } catch (e) {
            setStage({kind: "entry", error: e instanceof Error ? e.message : String(e)});
        }
    };

    return (
        <div className="h-full overflow-y-auto bg-background font-sans">
            <div className="mx-auto w-full max-w-[900px] px-5 pt-10 pb-16 sm:px-10">
                {!userScriptsOn && (
                    <div className="mb-6 flex items-start gap-2.5 rounded-[10px] border border-border bg-muted/40 px-4 py-3 text-[13px] leading-relaxed">
                        <AlertTriangle strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-destructive"/>
                        <span>
                            User scripts are turned off for TamperSloth, so installed scripts won't run yet. Turn on
                            "Allow User Scripts" on the extension's details page.
                        </span>
                    </div>
                )}

                {stage.kind === "entry" && (
                    <>
                        <p className="eyebrow mb-2 text-muted-foreground">TamperSloth · Userscripts</p>
                        <h1 className="font-heading text-[34px] leading-tight tracking-[var(--tracking-tight)]">
                            Install a userscript
                        </h1>
                        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted-foreground">
                            Bring a Tampermonkey or Greasy Fork script, or a whole Tampermonkey backup. You'll see what it does and where it runs before anything is installed.
                        </p>

                        {stage.error && (
                            <div role="alert" className="mt-6 flex items-start gap-2.5 rounded-[10px] border border-destructive/50 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed">
                                <AlertTriangle strokeWidth={1.5} className="mt-0.5 size-4 shrink-0 text-destructive"/>
                                <span className="break-words">{stage.error}</span>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".js,text/javascript,application/javascript,.zip,application/zip"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = "";
                                if (file) fromFile(file);
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragging(false);
                                const file = e.dataTransfer.files[0];
                                if (file) fromFile(file);
                            }}
                            className={cn(
                                "mt-7 flex w-full cursor-pointer flex-col items-center gap-2 rounded-[10px] border border-dashed border-border bg-card px-6 py-9 text-center transition-colors duration-[160ms] hover:border-muted-foreground/50",
                                dragging && "border-foreground bg-muted/50",
                            )}
                        >
                            <Upload strokeWidth={1.25} className="size-6 text-muted-foreground"/>
                            <span className="text-[14px] font-medium">Choose a .user.js file or backup .zip</span>
                            <span className="text-[12.5px] text-muted-foreground">or drop it here</span>
                        </button>

                        <form
                            className="mt-6"
                            onSubmit={(e) => { e.preventDefault(); fromUrl(url); }}
                        >
                            <label htmlFor="userscript-url" className="eyebrow mb-2 block text-muted-foreground">From a link</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <Link2 strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"/>
                                    <Input
                                        id="userscript-url"
                                        type="url"
                                        value={url}
                                        onChange={(e) => setUrl(e.target.value)}
                                        placeholder="https://greasyfork.org/scripts/…/code/script.user.js"
                                        className="h-9 pl-9 text-[13px]"
                                    />
                                </div>
                                <Button type="submit" variant="outline" disabled={!url.trim()}>Fetch</Button>
                            </div>
                        </form>

                        <form
                            className="mt-6"
                            onSubmit={(e) => { e.preventDefault(); void prepare(async () => ({source: pasted}), "Reading the script…"); }}
                        >
                            <label htmlFor="userscript-source" className="eyebrow mb-2 block text-muted-foreground">Or paste the source</label>
                            <textarea
                                id="userscript-source"
                                value={pasted}
                                onChange={(e) => setPasted(e.target.value)}
                                spellCheck={false}
                                placeholder={"// ==UserScript==\n// @name     My script\n// @match    https://example.com/*\n// ==/UserScript=="}
                                className="h-48 w-full resize-y rounded-[10px] border border-border bg-card px-3.5 py-3 font-mono text-[12.5px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
                            />
                            <div className="mt-2 flex justify-end">
                                <Button type="submit" variant="outline" disabled={!pasted.trim()}>Review</Button>
                            </div>
                        </form>
                    </>
                )}

                {stage.kind === "loading" && (
                    <div className="flex flex-col items-center gap-3 py-24 text-center">
                        <Loader2 strokeWidth={1.5} className="size-6 animate-spin text-muted-foreground"/>
                        <p className="text-[13.5px] text-muted-foreground">{stage.label}</p>
                    </div>
                )}

                {stage.kind === "review" && (
                    <ScriptReview
                        draft={stage.draft}
                        onInstall={() => void install(stage.draft)}
                        onCancel={() => setStage({kind: "entry"})}
                    />
                )}

                {stage.kind === "installed" && (
                    <div className="flex flex-col items-center gap-3 py-20 text-center">
                        <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                            <Check strokeWidth={2} className="size-5"/>
                        </span>
                        <p className="font-heading text-[28px] italic leading-snug">
                            {stage.updated ? "Updated" : "Installed"} {stage.script.name}.
                        </p>
                        <p className="max-w-sm text-[13.5px] text-muted-foreground">
                            {stage.script.status === "paused" ? "It's still paused, as it was before the update." : stage.note}
                        </p>
                        <div className="mt-3 flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setStage({kind: "entry"})}>Install another</Button>
                            {/* Opened in place from a link: go back to where the link was. */}
                            <Button size="sm" onClick={() => (linkedSource && history.length > 1 ? history.back() : closeTab())}>Done</Button>
                        </div>
                    </div>
                )}

                {stage.kind === "backup" && (
                    <BackupReview
                        items={stage.items}
                        failures={stage.failures}
                        onInstall={(items) => void restore(items)}
                        onCancel={() => setStage({kind: "entry"})}
                    />
                )}

                {stage.kind === "restored" && (
                    <div className="flex flex-col items-center gap-3 py-20 text-center">
                        <span className="flex size-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                            <Check strokeWidth={2} className="size-5"/>
                        </span>
                        <p className="font-heading text-[28px] italic leading-snug">
                            Installed {stage.count} script{stage.count !== 1 ? "s" : ""}.
                        </p>
                        <p className="max-w-sm text-[13.5px] text-muted-foreground">
                            Their saved data came too. Matching pages pick them up on their next load.
                        </p>
                        <div className="mt-3 flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setStage({kind: "entry"})}>Install another</Button>
                            <Button size="sm" onClick={closeTab}>Done</Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
