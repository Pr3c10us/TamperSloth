import {AlertTriangle} from "lucide-react";
import {Button} from "@/ui/shadcn/button";
import {ScriptCode} from "@/ui/ScriptCode";
import {SitesDialog} from "@/ui/SitesDialog";
import {RUN_AT_LABELS} from "@/userscripts/scriptActions";
import {compareVersions, grantKey} from "@/userscripts/userscript";
import type {UserscriptDraft} from "@/userscripts/installUserscript";

export const GRANT_LABELS: Record<string, string> = {
    xmlhttprequest: "Make requests to other sites",
    getvalue: "Keep its own saved data",
    setvalue: "Keep its own saved data",
    deletevalue: "Keep its own saved data",
    listvalues: "Keep its own saved data",
    getvalues: "Keep its own saved data",
    setvalues: "Keep its own saved data",
    deletevalues: "Keep its own saved data",
    addvaluechangelistener: "Keep its own saved data",
    removevaluechangelistener: "Keep its own saved data",
    addstyle: "Add styles to pages",
    addelement: "Add elements to pages",
    openintab: "Open new tabs",
    notification: "Show desktop notifications",
    download: "Download files",
    setclipboard: "Write to your clipboard",
    getresourcetext: "Read its bundled files",
    getresourceurl: "Read its bundled files",
    unsafewindow: "Reach the page's own JavaScript",
    registermenucommand: "Add items to the right-click menu",
    unregistermenucommand: "Add items to the right-click menu",
    cookie: "Read and change cookies for the sites it can contact",
    audio: "Mute the tab",
    gettab: "Keep data for each tab",
    savetab: "Keep data for each tab",
    gettabs: "Keep data for each tab",
    getimage: "Read the images you've saved in TamperSloth",
    listimages: "Read the images you've saved in TamperSloth",
};

function Meta({label, children}: {label: string; children: React.ReactNode}) {
    return (
        <div className="min-w-0">
            <dt className="eyebrow mb-1 text-muted-foreground">{label}</dt>
            <dd className="text-[13.5px]">{children}</dd>
        </div>
    );
}

function PatternList({patterns, empty}: {patterns: string[]; empty: string}) {
    if (!patterns.length) return <span className="text-muted-foreground">{empty}</span>;
    return (
        <ul className="flex flex-col gap-0.5">
            {patterns.map((p) => (
                <li key={p} className="truncate font-mono text-[12.5px]" title={p}>{p}</li>
            ))}
        </ul>
    );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
    return (
        <section className="border-t border-border pt-4">
            <h2 className="eyebrow mb-2.5 text-muted-foreground">{title}</h2>
            {children}
        </section>
    );
}

/** What one script will do, for the user to approve before it is installed. */
export function ScriptReview({draft, onInstall, onCancel}: {draft: UserscriptDraft; onInstall: () => void; onCancel: () => void}) {
    const {parsed, existing} = draft;
    const previous = existing?.userscript?.version ?? "";
    const order = previous && parsed.version ? compareVersions(parsed.version, previous) : 0;
    const abilities = [...new Set(parsed.grants.map((g) => GRANT_LABELS[grantKey(g)] ?? g))];
    const skips = [...parsed.excludeMatches, ...parsed.excludes];

    return (
        <>
            <p className="eyebrow mb-2 text-muted-foreground">
                TamperSloth · {existing ? "Update userscript" : "Install userscript"}
            </p>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div className="min-w-0 flex-1">
                    <h1 className="font-heading text-[34px] leading-tight tracking-[var(--tracking-tight)] break-words">
                        {parsed.name}
                        {parsed.version && (
                            <span className="ml-3 align-middle font-mono text-[13px] tracking-normal text-muted-foreground">v{parsed.version}</span>
                        )}
                    </h1>
                    {parsed.description && (
                        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-muted-foreground">{parsed.description}</p>
                    )}
                    {(parsed.author || parsed.homepage) && (
                        <p className="mt-1.5 text-[13px] text-muted-foreground">
                            {parsed.author && <>by {parsed.author}</>}
                            {parsed.author && parsed.homepage && " · "}
                            {parsed.homepage && /^https?:\/\//.test(parsed.homepage) && (
                                <a href={parsed.homepage} target="_blank" rel="noreferrer" className="underline underline-offset-2">homepage</a>
                            )}
                        </p>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
                    <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                    <Button size="sm" onClick={onInstall}>{existing ? "Update" : "Install"}</Button>
                </div>
            </div>

            {existing && (
                <p className="mt-4 text-[13px] text-muted-foreground">
                    {order < 0
                        ? `This is older than the version you have (v${previous}). `
                        : order === 0 && previous
                            ? "This is the version you already have. "
                            : previous ? `Replaces v${previous}. ` : "Replaces the copy you installed. "}
                    Its saved data is kept.
                </p>
            )}

            {draft.warnings.length > 0 && (
                <div className="mt-6 rounded-[10px] border border-border bg-muted/40 px-4 py-3">
                    <p className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
                        <AlertTriangle strokeWidth={1.5} className="size-4 text-destructive"/>
                        Before you install
                    </p>
                    <ul className="ml-6 list-disc space-y-1 text-[13px] leading-relaxed text-muted-foreground">
                        {draft.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                </div>
            )}

            <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 rounded-[10px] border border-border bg-card px-4 py-3.5 sm:grid-cols-2">
                <Meta label="Runs on">
                    <SitesDialog runs={[...parsed.matches, ...parsed.includes]} skips={skips} scriptName={parsed.name} lines={5}/>
                </Meta>
                <Meta label="Skips">
                    <SitesDialog
                        runs={[...parsed.matches, ...parsed.includes]}
                        skips={skips}
                        scriptName={parsed.name}
                        lines={5}
                        preview="skips"
                        empty="Nothing"
                    />
                </Meta>
                <Meta label="Timing">
                    {parsed.contextMenu
                        ? "Only when you pick it from the right-click menu"
                        : `${RUN_AT_LABELS[parsed.runAt]}${parsed.allFrames ? ", in embedded frames too" : ""}`}
                </Meta>
                <Meta label="Runs in">
                    {parsed.world === "MAIN" ? "The page itself, like the page's own code" : "Its own isolated space, apart from the page's code"}
                </Meta>
            </dl>

            <div className="mt-6 flex flex-col gap-4">
                <Section title="What it can do">
                    {abilities.length ? (
                        <ul className="flex flex-wrap gap-1.5">
                            {abilities.map((a) => (
                                <li key={a} className="rounded-full border border-border bg-card px-2.5 py-1 text-[12.5px]">{a}</li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-[13px] text-muted-foreground">Only change the pages it runs on.</p>
                    )}
                </Section>

                {parsed.grants.some((g) => grantKey(g) === "xmlhttprequest") && (
                    <Section title="Sites it can contact">
                        <PatternList
                            patterns={parsed.connects.map((c) => (c === "*" ? "* (any site)" : c))}
                            empty="None listed. It asks you before contacting any site but the page it's on."
                        />
                    </Section>
                )}

                {(draft.requires.length > 0 || draft.resources.length > 0) && (
                    <Section title="Code and files it brings along">
                        <p className="mb-2 text-[12.5px] text-muted-foreground">
                            Downloaded now and stored with the script, so nothing new loads later without an update.
                        </p>
                        <PatternList patterns={[...draft.requires.map((r) => r.url), ...draft.resources.map((r) => r.url)]} empty=""/>
                    </Section>
                )}

                <Section title="Source">
                    <div className="max-h-[480px] overflow-auto rounded-[10px] border border-border bg-card">
                        <ScriptCode code={draft.source} lineNumbers padding="14px 18px 18px 8px"/>
                    </div>
                </Section>
            </div>

            <div className="mt-6 flex items-center justify-end gap-1.5">
                <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                <Button size="sm" onClick={onInstall}>{existing ? "Update" : "Install"}</Button>
            </div>
        </>
    );
}
