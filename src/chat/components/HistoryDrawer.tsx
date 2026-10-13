import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, Search, SquarePen, Trash2 } from "lucide-react";
import {
    deleteConversation,
    loadConversationHistory,
    loadStoredConversation,
    type ConversationSummary,
    type StoredConversation,
} from "../lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function formatWhen(ts: number): string {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const yest = new Date(now);
    yest.setDate(now.getDate() - 1);
    const isYest = d.toDateString() === yest.toDateString();

    if (sameDay) {
        return `Today · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    }
    if (isYest) return "Yesterday";
    const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
    return "Last week";
}

interface HistoryDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeId: string;
    onSelect: (conversation: StoredConversation) => void;
    onNewChat: () => void;
}

export function HistoryDrawer({
    open,
    onOpenChange,
    activeId,
    onSelect,
    onNewChat,
}: HistoryDrawerProps) {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [error, setError] = useState('');
    const [query, setQuery] = useState("");

    useEffect(() => {
        let live = true;
        if (open) void loadConversationHistory().then(history => {
            if (live) { setConversations(history.conversations); setError(history.warning ?? ''); }
        }, error => { if (live) setError(error instanceof Error ? error.message : String(error)); });
        return () => { live = false; };
    }, [open]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return conversations;
        return conversations.filter((c) => c.title.toLowerCase().includes(q));
    }, [conversations, query]);

    const handleDelete = async (id: string) => {
        try {
            await deleteConversation(id);
            setConversations((prev) => prev.filter((c) => c.id !== id));
        } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    };

    const handleSelect = async (id: string) => {
        try {
            const conversation = await loadStoredConversation(id);
            if (!conversation) throw new Error('This conversation is no longer available.');
            onSelect(conversation);
            onOpenChange(false);
        } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                aria-describedby={undefined}
                className="flex w-[320px] flex-col gap-0 border-l border-border bg-background p-0"
            >
                <SheetHeader className="flex-row items-center justify-between border-b border-muted px-3.5 py-3">
                    <SheetTitle className="font-heading text-lg leading-none tracking-[-0.02em]">
                        Recent chats
                    </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-2 border-b border-muted p-2.5">
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => {
                            onNewChat();
                            onOpenChange(false);
                        }}
                        className="w-full justify-start"
                    >
                        <SquarePen strokeWidth={1.5} />
                        New chat
                    </Button>
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                            strokeWidth={1.5}
                        />
                        <Input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search conversations"
                            className="pl-8"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {error ? <p role="alert" className="px-3.5 py-2 text-xs text-muted-foreground">{error}</p> : null}
                    {filtered.length === 0 ? (
                        <div className="px-3.5 py-6 text-center text-[13px] text-muted-foreground">
                            {query ? "No matches" : "No conversations yet"}
                        </div>
                    ) : (
                        filtered.map((c) => {
                            const isActive = c.id === activeId;
                            return (
                                <div
                                    key={c.id}
                                    className={cn(
                                        "group relative min-w-0 border-b border-muted transition-colors",
                                        isActive ? "bg-muted" : "hover:bg-card",
                                    )}
                                >
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => { void handleSelect(c.id); }}
                                        className="h-auto w-full min-w-0 flex-col items-start gap-1 rounded-none px-3.5 py-3 pr-10 text-left hover:bg-transparent"
                                    >
                                        <div
                                            className={cn(
                                                "w-full truncate text-[13px] text-foreground",
                                                isActive ? "font-medium" : "font-normal",
                                            )}
                                        >
                                            {c.title || "Untitled"}
                                        </div>
                                        <div className="w-full truncate font-mono text-[10px] uppercase tracking-[.08em] text-muted-foreground">
                                            {formatWhen(c.updatedAt || c.createdAt)}
                                        </div>
                                    </Button>
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    onClick={(e) => e.stopPropagation()}
                                                    aria-label="Open menu"
                                                    className="text-muted-foreground"
                                                >
                                                    <MoreHorizontal />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent side="left" align="start" className="w-40">
                                                <DropdownMenuItem
                                                    onSelect={() => handleDelete(c.id)}
                                                    variant="destructive"
                                                >
                                                    <Trash2 />
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
