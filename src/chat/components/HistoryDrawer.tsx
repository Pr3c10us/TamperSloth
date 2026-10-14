import { useEffect, useMemo, useState } from "react";
import { MoreHorizontal, PanelLeftClose, Plus, Search, Settings, Trash2 } from "lucide-react";
import {
    deleteConversation,
    loadConversationHistory,
    type ConversationSummary,
} from "../lib/storage";
import { discardConversation, useRunningChats } from "../hooks/useAgent";
import { Button } from "@/components/ui/button";
import {
    Sheet,
    SheetClose,
    SheetContent,
    SheetTitle,
} from "@/components/ui/sheet";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const DAY_MS = 1000 * 60 * 60 * 24;

function dayLabel(ts: number, now: Date): string {
    const d = new Date(ts);
    const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diffDays = Math.round((startOf(now) - startOf(d)) / DAY_MS);
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString([], {
        month: "short",
        day: "numeric",
        ...(d.getFullYear() !== now.getFullYear() && { year: "numeric" }),
    });
}

// Conversations arrive sorted newest-first, so consecutive runs share a day label.
function groupByDay(conversations: ConversationSummary[]) {
    const now = new Date();
    const groups: { label: string; items: ConversationSummary[] }[] = [];
    for (const c of conversations) {
        const label = dayLabel(c.updatedAt || c.createdAt, now);
        const last = groups[groups.length - 1];
        if (last?.label === label) last.items.push(c);
        else groups.push({ label, items: [c] });
    }
    return groups;
}

interface HistoryDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeId: string;
    /** Shows the chat; rejects if it can no longer be loaded. */
    onSelect: (id: string) => Promise<void>;
    onNewChat: () => void;
    onOpenSettings: () => void;
}

export function HistoryDrawer({
    open,
    onOpenChange,
    activeId,
    onSelect,
    onNewChat,
    onOpenSettings,
}: HistoryDrawerProps) {
    const [conversations, setConversations] = useState<ConversationSummary[]>([]);
    const [error, setError] = useState('');
    const [query, setQuery] = useState("");
    const running = useRunningChats();

    useEffect(() => {
        let live = true;
        if (open) void loadConversationHistory().then(history => {
            if (live) { setConversations(history); setError(''); }
        }, error => { if (live) setError(error instanceof Error ? error.message : String(error)); });
        return () => { live = false; };
    }, [open]);

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase();
        return groupByDay(q ? conversations.filter((c) => c.title.toLowerCase().includes(q)) : conversations);
    }, [conversations, query]);

    const handleDelete = async (id: string) => {
        try {
            discardConversation(id);
            await deleteConversation(id);
            setConversations((prev) => prev.filter((c) => c.id !== id));
        } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    };

    const handleSelect = async (id: string) => {
        try {
            await onSelect(id);
            onOpenChange(false);
        } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="left"
                showCloseButton={false}
                aria-describedby={undefined}
                className="flex flex-col gap-0 border-r border-sidebar-border bg-sidebar p-0 text-sidebar-foreground data-[side=left]:w-[300px] data-[side=left]:max-w-[88vw]"
            >
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                    <SheetTitle className="pl-1 font-heading text-lg leading-none tracking-[-0.02em]">
                        History
                    </SheetTitle>
                    <SheetClose asChild>
                        <Button variant="ghost" size="icon-sm" aria-label="Close history">
                            <PanelLeftClose strokeWidth={1.5} />
                        </Button>
                    </SheetClose>
                </div>

                <div className="px-3 pb-2">
                    <label className="flex h-8 items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2.5 text-muted-foreground transition-colors focus-within:border-ring">
                        <Search className="size-3.5 shrink-0" strokeWidth={1.5} />
                        <input
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search"
                            aria-label="Search conversations"
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
                        />
                    </label>
                </div>

                <nav className="px-2 pb-1">
                    <button
                        type="button"
                        onClick={() => {
                            onNewChat();
                            onOpenChange(false);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                        <span className="flex size-5 items-center justify-center rounded-full bg-muted">
                            <Plus className="size-3.5" strokeWidth={1.75} />
                        </span>
                        New chat
                    </button>
                </nav>

                <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
                    {error ? <p role="alert" className="px-2 py-2 text-xs text-muted-foreground">{error}</p> : null}
                    {groups.length === 0 ? (
                        <div className="px-2 py-6 text-center text-[13px] text-muted-foreground">
                            {query ? "No matches" : "No conversations yet"}
                        </div>
                    ) : (
                        groups.map((group) => (
                            <section key={group.label} className="pt-4">
                                <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
                                <ul>
                                    {group.items.map((c) => {
                                        const isActive = c.id === activeId;
                                        const isRunning = running.includes(c.id);
                                        return (
                                            <li
                                                key={c.id}
                                                className={cn(
                                                    "group relative rounded-lg transition-colors",
                                                    isActive ? "bg-muted" : "hover:bg-muted/60",
                                                )}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => { void handleSelect(c.id); }}
                                                    aria-current={isActive ? "true" : undefined}
                                                    title={c.title || "Untitled"}
                                                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-8 text-left text-[13px] focus-visible:bg-muted/60 focus-visible:outline-none"
                                                >
                                                    {isRunning && (
                                                        <span className="relative flex size-1.5 shrink-0" aria-label="Working" role="status">
                                                            <span className="absolute inset-0 animate-ping rounded-full bg-accent opacity-60" />
                                                            <span className="relative size-1.5 rounded-full bg-accent" />
                                                        </span>
                                                    )}
                                                    <span className="truncate">{c.title || "Untitled"}</span>
                                                </button>
                                                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button
                                                                variant="ghost"
                                                                size="icon-xs"
                                                                onClick={(e) => e.stopPropagation()}
                                                                aria-label="Conversation options"
                                                                className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                                                            >
                                                                <MoreHorizontal />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent side="right" align="start" className="w-40">
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
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))
                    )}
                </div>

                <div className="border-t border-sidebar-border px-2 py-2">
                    <button
                        type="button"
                        onClick={() => {
                            onOpenChange(false);
                            onOpenSettings();
                        }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                    >
                        <Settings className="size-4 text-muted-foreground" strokeWidth={1.5} />
                        Settings
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
