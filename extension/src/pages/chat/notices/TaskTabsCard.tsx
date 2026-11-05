import { useEffect, useState } from "react";
import { ChevronDown, NotebookPen, Pause } from "lucide-react";
import { cn } from "@/ui/utils";
import { browserCall } from "@/agent/tools/browserTools";
import { Eyebrow, CARD_DUR, CARD_EASE } from "@/pages/chat/cardParts";

interface TaskTabView {
    tabId: number;
    url?: string;
    title?: string;
    owned: boolean;
    purpose?: string;
    notes: string[];
    favIconUrl?: string;
    active?: boolean;
}

interface TaskView {
    group?: { groupId: number; title?: string; status?: "working" | "waiting" };
    workingTabId?: number;
    tabs: TaskTabView[];
}

/** The chat's task tabs, refreshed whenever the task record or one of its tabs changes. */
function useTaskTabs(conversationId: string): TaskView | null {
    const [task, setTask] = useState<TaskView | null>(null);
    useEffect(() => {
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const load = async () => {
            const view: TaskView | undefined = await browserCall("tabs", { action: "list", conversationId })
                .then(result => result.task, () => undefined);
            if (!view) {
                if (!cancelled) setTask(null);
                return;
            }
            // Favicons and focus come from the tabs themselves; the task record stays free of them.
            const tabs = await Promise.all(view.tabs.map(async tab => {
                const live = await chrome.tabs.get(tab.tabId).catch(() => undefined);
                return { ...tab, favIconUrl: live?.favIconUrl, active: live?.active };
            }));
            if (!cancelled) setTask({ ...view, tabs });
        };
        const refresh = () => {
            clearTimeout(timer);
            timer = setTimeout(() => { void load(); }, 150);
        };
        const onStorage = (changes: Record<string, unknown>, area: string) => {
            if (area === "session" && "ts_task_tabs" in changes) refresh();
        };
        const onUpdated = (_id: number, change: chrome.tabs.OnUpdatedInfo) => {
            if (change.title || change.url || change.favIconUrl || change.status === "complete") refresh();
        };
        void load();
        chrome.storage.onChanged.addListener(onStorage);
        chrome.tabs.onUpdated.addListener(onUpdated);
        chrome.tabs.onActivated.addListener(refresh);
        chrome.tabs.onRemoved.addListener(refresh);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            chrome.storage.onChanged.removeListener(onStorage);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            chrome.tabs.onActivated.removeListener(refresh);
            chrome.tabs.onRemoved.removeListener(refresh);
        };
    }, [conversationId]);
    return task;
}

function host(url?: string) {
    try { return url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { return ""; }
}

async function showTab(tabId: number) {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab) await chrome.windows.update(tab.windowId, { focused: true });
}

/** Lists the tabs this chat's task opened or consulted, so the user can find and jump to them. */
export function TaskTabsCard({ conversationId }: { conversationId: string }) {
    const task = useTaskTabs(conversationId);
    const [open, setOpen] = useState(false);
    if (!task || !task.tabs.length) return null;

    const waiting = task.group?.status === "waiting";
    const ordered = [...task.tabs].sort((a, b) =>
        Number(b.tabId === task.workingTabId) - Number(a.tabId === task.workingTabId) || Number(b.owned) - Number(a.owned));

    return (
        <div
            className="border-t border-muted bg-card/95 backdrop-blur-sm"
            style={{ animation: `cardEnter ${CARD_DUR}ms ${CARD_EASE} both` }}
            role="region"
            aria-label="Task tabs"
        >
            <button
                type="button"
                onClick={() => setOpen(value => !value)}
                aria-expanded={open}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40"
            >
                <span aria-hidden className="text-[13px] leading-none">🦥</span>
                <Eyebrow tone="foreground" className="min-w-0 truncate">{task.group?.title ?? "Task tabs"}</Eyebrow>
                {waiting && (
                    <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                        <Pause className="size-3" strokeWidth={1.75} /> Waiting for you
                    </span>
                )}
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {task.tabs.length} tab{task.tabs.length === 1 ? "" : "s"}
                </span>
                <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} strokeWidth={1.75} />
            </button>
            {open && (
                <ul className="flex max-h-[11rem] flex-col gap-0.5 overflow-y-auto px-1.5 pb-2 [scrollbar-width:thin]">
                    {ordered.map(tab => (
                        <li key={tab.tabId}>
                            <button
                                type="button"
                                onClick={() => { void showTab(tab.tabId); }}
                                title={tab.notes.length ? tab.notes.join("\n") : tab.url}
                                className={cn("flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-muted/60", tab.active && "bg-muted/40")}
                            >
                                {tab.favIconUrl
                                    ? <img src={tab.favIconUrl} alt="" className="size-4 shrink-0 rounded-sm" />
                                    : <span className="size-4 shrink-0 rounded-sm bg-muted" />}
                                <span className="flex min-w-0 flex-1 flex-col">
                                    <span className="truncate text-[12.5px] text-foreground">{tab.title || host(tab.url) || "Loading…"}</span>
                                    <span className="truncate text-[11px] text-muted-foreground">
                                        {tab.purpose || host(tab.url)}
                                    </span>
                                </span>
                                {tab.notes.length > 0 && (
                                    <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground" aria-label={`${tab.notes.length} notes`}>
                                        <NotebookPen className="size-3" strokeWidth={1.75} />{tab.notes.length}
                                    </span>
                                )}
                                {(tab.tabId === task.workingTabId || !tab.owned) && (
                                    <span className="shrink-0 rounded-full border border-border px-1.5 text-[10.5px] text-muted-foreground">
                                        {tab.tabId === task.workingTabId ? "Working tab" : "Your tab"}
                                    </span>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
