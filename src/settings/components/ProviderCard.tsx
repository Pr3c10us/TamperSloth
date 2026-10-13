import {ArrowUpRight, Plus} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {cn} from "@/lib/utils";
import type {Provider} from "./providers";

type Props = {
    p: Provider;
    connected?: boolean;
    editing?: boolean;
    apiKey: string;
    onSetKey: (k: string) => void;
    onSave: () => void;
    onEdit: () => void;
    onDelete: () => void;
    onCancel: () => void;
};

function maskKey(key: string): string {
    if (!key) return "";
    if (key.length <= 8) return "•".repeat(key.length);
    return `${key.slice(0, 4)}${"•".repeat(Math.min(12, Math.max(4, key.length - 8)))}${key.slice(-4)}`;
}

/** One provider row inside the connections group. */
export function ProviderCard({
    p,
    connected,
    editing,
    apiKey,
    onSetKey,
    onSave,
    onEdit,
    onDelete,
    onCancel,
}: Props) {
    return (
        <div className={cn("px-3.5 py-3 transition-colors duration-[160ms]", editing && "bg-background")}>
            <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                    <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-background font-heading text-lg text-foreground">
                        {p.logo}
                    </div>
                    {connected && (
                        <span
                            className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-accent"
                            aria-hidden
                        />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium leading-snug text-foreground">{p.name}</div>
                    {connected ? (
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                            {editing ? "Connected" : maskKey(apiKey)}
                        </div>
                    ) : (
                        <a
                            href={`https://${p.link}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 font-mono text-[11px] text-muted-foreground no-underline hover:text-foreground"
                        >
                            {p.link}
                            <ArrowUpRight strokeWidth={1.5} className="size-3" />
                        </a>
                    )}
                </div>

                {!editing && (
                    connected ? (
                        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Manage ${p.name} API key`}>
                            Manage
                        </Button>
                    ) : (
                        <Button variant="outline" size="sm" onClick={onEdit}>
                            <Plus strokeWidth={1.75} />
                            Add key
                        </Button>
                    )
                )}
            </div>

            {editing && (
                <form
                    className="mt-3 flex flex-col gap-2"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSave();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") onCancel();
                    }}
                >
                    <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => onSetKey(e.target.value)}
                        placeholder={`Paste your ${p.name} API key`}
                        aria-label={`${p.name} API key`}
                        autoComplete="off"
                        spellCheck={false}
                        className="h-9 bg-card font-mono text-[12.5px]"
                        autoFocus
                    />
                    <div className="flex items-center gap-1.5">
                        {connected && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={onDelete}
                                className="-ml-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                                Remove key
                            </Button>
                        )}
                        <div className="flex-1" />
                        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" disabled={!apiKey.trim()}>
                            Save
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
