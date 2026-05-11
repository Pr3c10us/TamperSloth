import {KeyRound, Pencil, Trash2, X} from "lucide-react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
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
    return `${key.slice(0, 4)}${"•".repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

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
        <div
            className={`mb-2.5 rounded-xl border border-border bg-card p-4`}
        >
            <div className="flex items-center gap-2.5">
                <div
                    className={`inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-background font-heading text-foreground h-9 w-9 text-lg`}
                >
                    {p.logo}
                </div>
                <div className="min-w-0 flex-1">
                    <div
                        className={`font-medium text-foreground`}
                    >
                        {p.name}
                    </div>
                    {connected && !editing ? (
                        <div className="w-full mt-0.5 font-mono text-xs whitespace-nowrap text-muted-foreground overflow-hidden">
                            {maskKey(apiKey)}
                        </div>
                    ) : (
                        <div className="mt-0.5 font-mono text-xs text-muted-foreground">
                            Get one at{" "}
                            <a href={`https://${p.link}`} target="_blank">
                                {p.link}
                            </a>
                        </div>
                    )}
                </div>
                {connected && !editing ? (
                    <div className="flex items-center">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onEdit}
                            aria-label="Edit API key"
                        >
                            <Pencil />
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onDelete}
                            aria-label="Delete API key"
                        >
                            <Trash2 />
                        </Button>
                    </div>
                ) : editing ? null : (
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <KeyRound />
                        API key
                    </Button>
                )}
            </div>

            {editing && (
                <div className="mt-2.5 flex gap-1.5">
                    <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => onSetKey(e.target.value)}
                        placeholder={`Paste your ${p.name} API key`}
                        className="font-mono"
                        autoFocus
                    />
                    <Button onClick={onSave} disabled={!apiKey}>
                        Save
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onCancel}
                        aria-label="Cancel"
                    >
                        <X />
                    </Button>
                </div>
            )}
        </div>
    );
}
