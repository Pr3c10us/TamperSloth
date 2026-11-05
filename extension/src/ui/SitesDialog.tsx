import {useId, useState} from "react";
import {Dialog} from "radix-ui";
import {Search, X} from "lucide-react";
import {cn} from "./utils";
import {Input} from "@/ui/shadcn/input";

/** Past this many sites, the dialog offers a filter. */
const FILTER_FROM = 8;
/** Rows that enter one after another; a long list shouldn't keep the reader waiting. */
const STAGGERED_ROWS = 12;

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

function SiteRows({title, sites, query}: {title: string; sites: string[]; query: string}) {
    const q = query.trim().toLowerCase();
    const shown = q ? sites.filter((site) => site.toLowerCase().includes(q)) : sites;
    if (!sites.length) return null;
    return (
        <section>
            <h3 className="eyebrow mb-1.5 flex items-baseline justify-between gap-3 text-muted-foreground">
                {title}
                <span className="font-mono text-[11px] tracking-normal">
                    {q ? `${shown.length} of ${sites.length}` : sites.length}
                </span>
            </h3>
            {shown.length ? (
                <ul className="overflow-hidden rounded-[8px] border border-border bg-card">
                    {shown.map((site, i) => (
                        <li
                            key={site}
                            className={cn(
                                "ts-enter px-3 py-2 font-mono text-[12.5px] leading-relaxed break-all",
                                i > 0 && "border-t border-border",
                            )}
                            style={{animationDelay: `${Math.min(i, STAGGERED_ROWS) * 18}ms`}}
                        >
                            {site}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="rounded-[8px] border border-dashed border-border px-3 py-2.5 text-[12.5px] text-muted-foreground">
                    None match "{query.trim()}".
                </p>
            )}
        </section>
    );
}

/**
 * What a script covers, in a small preview that never hides how much there is:
 * the count sits outside the part that gets cut off. Clicking opens every site in full.
 * `lines` is how many sites the preview itself shows; `preview` picks which list.
 */
export function SitesDialog({runs, skips = [], scriptName, lines = 1, preview = "runs", empty = "No sites"}: {
    runs: string[];
    skips?: string[];
    scriptName: string;
    lines?: number;
    preview?: "runs" | "skips";
    empty?: string;
}) {
    const [query, setQuery] = useState("");
    const descriptionId = useId();
    const list = preview === "runs" ? runs : skips;
    if (!list.length) return <span className="text-muted-foreground">{empty}</span>;

    const visible = list.slice(0, lines);
    const more = list.length - visible.length;
    const total = runs.length + skips.length;

    return (
        <Dialog.Root onOpenChange={(open) => { if (!open) setQuery(""); }}>
            <Dialog.Trigger
                title={more > 0 ? `See all ${list.length} sites` : "See it in full"}
                className="group flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-[4px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
                {visible.map((site, i) => (
                    <span key={site} className="flex w-full min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate font-mono text-[12.5px] underline decoration-transparent decoration-[1px] underline-offset-[3px] transition-colors duration-[var(--dur-fast)] group-hover:decoration-current">
                            {site}
                        </span>
                        {more > 0 && lines === 1 && i === 0 && (
                            <span className="shrink-0 rounded-full border border-border bg-background px-1.5 font-mono text-[10.5px] leading-[17px] text-muted-foreground transition-colors duration-[var(--dur-fast)] group-hover:border-muted-foreground/40 group-hover:text-foreground">
                                +{more}
                            </span>
                        )}
                    </span>
                ))}
                {more > 0 && lines > 1 && (
                    <span className="mt-1 w-fit rounded-full border border-border bg-background px-2 font-mono text-[10.5px] leading-[19px] text-muted-foreground transition-colors duration-[var(--dur-fast)] group-hover:border-muted-foreground/40 group-hover:text-foreground">
                        View all {list.length}
                    </span>
                )}
            </Dialog.Trigger>

            <Dialog.Portal>
                <Dialog.Overlay className="ts-dialog-overlay fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px]"/>
                <Dialog.Content
                    aria-describedby={descriptionId}
                    className="ts-dialog-content fixed top-1/2 left-1/2 z-50 flex max-h-[min(640px,calc(100dvh-32px))] w-[min(560px,calc(100vw-32px))] flex-col rounded-[12px] border border-border bg-background font-sans text-foreground shadow-xl outline-none"
                >
                    <div className="flex items-start justify-between gap-4 px-5 pt-5">
                        <div className="min-w-0">
                            <Dialog.Title className="font-heading text-[24px] leading-tight tracking-[var(--tracking-tight)]">
                                Where it runs
                            </Dialog.Title>
                            <Dialog.Description id={descriptionId} className="mt-1 text-[13px] leading-relaxed break-words text-muted-foreground">
                                {scriptName} runs on {plural(runs.length, "site rule")}
                                {skips.length > 0 && ` and skips ${plural(skips.length, "rule")}`}.
                            </Dialog.Description>
                        </div>
                        <Dialog.Close
                            aria-label="Close"
                            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors duration-[var(--dur-fast)] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X strokeWidth={1.5} className="size-4"/>
                        </Dialog.Close>
                    </div>

                    {total >= FILTER_FROM && (
                        <div className="relative mx-5 mt-3.5 flex items-center">
                            <Search strokeWidth={1.5} className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"/>
                            <Input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Filter sites…"
                                aria-label="Filter sites"
                                className="h-9 rounded-full bg-card pl-9 text-[13px]"
                            />
                        </div>
                    )}

                    <div className="mt-3.5 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5">
                        <SiteRows title="Runs on" sites={runs} query={query}/>
                        <SiteRows title="Skips" sites={skips} query={query}/>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
