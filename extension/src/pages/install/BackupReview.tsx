import {useState} from "react";
import {AlertTriangle} from "lucide-react";
import {Button} from "@/ui/shadcn/button";
import {SitesDialog} from "@/ui/SitesDialog";
import {cn} from "@/ui/utils";
import {grantKey} from "@/userscripts/userscript";
import type {UserscriptDraft} from "@/userscripts/installUserscript";
import {GRANT_LABELS} from "./ScriptReview";

export /** A script from a backup file, ready to install with what came with it. */
interface BackupItem {
    draft: UserscriptDraft;
    values: Record<string, unknown>;
    enabled: boolean;
}

/** One list for a whole backup: the same facts as a single review, with the source a click away once installed. */
export function BackupReview({items, failures, onInstall, onCancel}: {
    items: BackupItem[];
    failures: {name: string; error: string}[];
    onInstall: (items: BackupItem[]) => void;
    onCancel: () => void;
}) {
    const [skipped, setSkipped] = useState<Set<number>>(new Set());
    const chosen = items.filter((_, i) => !skipped.has(i));
    const toggle = (i: number) => setSkipped((prev) => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
    });

    return (
        <>
            <p className="eyebrow mb-2 text-muted-foreground">TamperSloth · Restore a backup</p>
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <h1 className="min-w-0 flex-1 font-heading text-[34px] leading-tight tracking-[var(--tracking-tight)]">
                    {items.length} script{items.length !== 1 ? "s" : ""} in this backup
                </h1>
                <div className="flex shrink-0 items-center gap-1.5 pt-1.5">
                    <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
                    <Button size="sm" disabled={!chosen.length} onClick={() => onInstall(chosen)}>
                        Install {chosen.length}
                    </Button>
                </div>
            </div>

            {failures.length > 0 && (
                <div role="alert" className="mt-6 rounded-[10px] border border-destructive/50 bg-destructive/5 px-4 py-3">
                    <p className="mb-1.5 flex items-center gap-2 text-[13px] font-medium">
                        <AlertTriangle strokeWidth={1.5} className="size-4 text-destructive"/>
                        {failures.length} couldn't be prepared and won't be installed
                    </p>
                    <ul className="ml-6 list-disc space-y-1 text-[13px] leading-relaxed text-muted-foreground">
                        {failures.map((f) => <li key={f.name} className="break-words"><span className="font-medium">{f.name}</span>: {f.error}</li>)}
                    </ul>
                </div>
            )}

            <ul className="mt-6 overflow-hidden rounded-[10px] border border-border bg-card">
                {items.map(({draft, values, enabled}, i) => {
                    const {parsed, existing, warnings} = draft;
                    const abilities = [...new Set(parsed.grants.map((g) => GRANT_LABELS[grantKey(g)] ?? g))];
                    const savedCount = Object.keys(values).length;
                    const sites = [...parsed.matches, ...parsed.includes];
                    return (
                        <li key={`${parsed.name}-${i}`} className={cn("border-border px-4 py-3.5", i > 0 && "border-t")}>
                            <label className="flex cursor-pointer items-start gap-3">
                                <input
                                    type="checkbox"
                                    checked={!skipped.has(i)}
                                    onChange={() => toggle(i)}
                                    className="mt-1 size-3.5 shrink-0 accent-[var(--accent)]"
                                />
                                <span className="min-w-0 flex-1">
                                    <span className="text-[14px] font-medium break-words">{parsed.name}</span>
                                    {parsed.version && <span className="ml-2 font-mono text-[12px] text-muted-foreground">v{parsed.version}</span>}
                                    {existing && <span className="ml-2 text-[12px] text-muted-foreground">replaces your copy</span>}
                                    {!enabled && <span className="ml-2 text-[12px] text-muted-foreground">paused in the backup</span>}
                                    {sites.length > 0 && (
                                        <span className="mt-1 block text-muted-foreground">
                                            <SitesDialog
                                                runs={sites}
                                                skips={[...parsed.excludeMatches, ...parsed.excludes]}
                                                scriptName={parsed.name}
                                            />
                                        </span>
                                    )}
                                    {abilities.length > 0 && (
                                        <span className="mt-1 block text-[12.5px] text-muted-foreground">{abilities.join(" · ")}</span>
                                    )}
                                    {savedCount > 0 && (
                                        <span className="mt-1 block text-[12.5px] text-muted-foreground">
                                            {savedCount} saved value{savedCount !== 1 ? "s" : ""} included
                                        </span>
                                    )}
                                    {warnings.map((w) => (
                                        <span key={w} className="mt-1 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-muted-foreground">
                                            <AlertTriangle strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0 text-destructive"/>
                                            {w}
                                        </span>
                                    ))}
                                </span>
                            </label>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
