import { useEffect, useState } from "react";
import { Trash2, FileCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteFile,
  deleteAllFilesForConversation,
  listAllCodeFiles,
  loadConversationHistory,
  type CodeFileEntry,
  type ConversationSummary,
} from "@/src/chat/lib/storage";
import { SettingsGroup, SettingsSection, TabIntro } from "./Section";

interface ConversationGroup {
  conversationId: string;
  title: string;
  files: CodeFileEntry[];
}

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? "s" : ""}`;

export function CodeTab() {
  const [groups, setGroups] = useState<ConversationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmGroup, setConfirmGroup] = useState<ConversationGroup | null>(null);

  const load = async () => {
    setLoading(true);
    const [files, history] = await Promise.all([
      listAllCodeFiles(),
      loadConversationHistory(),
    ]);

    const convMap = new Map<string, ConversationSummary>(
      history.map((c) => [c.id, c]),
    );

    const byConv = new Map<string, CodeFileEntry[]>();
    for (const f of files) {
      const list = byConv.get(f.conversationId) ?? [];
      list.push(f);
      byConv.set(f.conversationId, list);
    }

    const result: ConversationGroup[] = [];
    for (const [convId, fileList] of byConv) {
      result.push({
        conversationId: convId,
        title: convMap.get(convId)?.title || "Untitled conversation",
        files: fileList,
      });
    }

    result.sort((a, b) => a.title.localeCompare(b.title));
    setGroups(result);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleDeleteFile = async (conversationId: string, path: string) => {
    await deleteFile(conversationId, path);
    setGroups((prev) =>
      prev
        .map((g) =>
          g.conversationId === conversationId
            ? { ...g, files: g.files.filter((f) => f.path !== path) }
            : g,
        )
        .filter((g) => g.files.length > 0),
    );
  };

  const handleDeleteAll = async (conversationId: string) => {
    await deleteAllFilesForConversation(conversationId);
    setGroups((prev) => prev.filter((g) => g.conversationId !== conversationId));
  };

  const totalFiles = groups.reduce((sum, g) => sum + g.files.length, 0);

  return (
    <div className="flex flex-col gap-6">
      <TabIntro title={<>Code <em>files.</em></>}>
        Files the sloth wrote during chats. Clear out any you no longer need.
      </TabIntro>

      <SettingsSection
        title={loading || groups.length === 0 ? "Files" : `${plural(totalFiles, "file")} · ${plural(groups.length, "chat")}`}
        action={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={load}
                disabled={loading}
                aria-label="Refresh"
                className="text-muted-foreground"
              >
                <RefreshCw strokeWidth={1.5} className={loading ? "animate-spin" : undefined} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh</TooltipContent>
          </Tooltip>
        }
      >
        {loading ? (
          <SettingsGroup>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3.5 py-3">
                <Skeleton className="size-4 rounded" />
                <Skeleton className="h-3.5 flex-1" />
              </div>
            ))}
          </SettingsGroup>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-[10px] border border-dashed border-border px-6 py-10 text-center">
            <FileCode strokeWidth={1.25} className="size-7 text-muted-foreground/50" />
            <p className="font-heading text-[19px] italic leading-snug">Nothing stored.</p>
            <p className="text-[12.5px] text-muted-foreground">
              Files appear here when the sloth writes code in a chat.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {groups.map((group) => (
              <SettingsGroup key={group.conversationId}>
                <div className="flex items-center gap-2 py-2 pr-1.5 pl-3.5">
                  <div className="min-w-0 flex-1" title={group.conversationId}>
                    <p className="truncate text-[13px] font-medium">{group.title}</p>
                    <p className="font-mono text-[10.5px] text-muted-foreground">
                      {plural(group.files.length, "file")}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmGroup(group)}
                  >
                    Delete all
                  </Button>
                </div>

                <ul className="divide-y divide-muted bg-background/40">
                  {group.files.map((file) => (
                    <li
                      key={file.path}
                      className="group flex items-center gap-2.5 py-1.5 pr-1.5 pl-3.5"
                    >
                      <FileCode
                        strokeWidth={1.5}
                        className="size-3.5 shrink-0 text-muted-foreground/70"
                      />
                      <span className="flex-1 truncate font-mono text-[12px]" title={file.path}>
                        {file.path}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete ${file.path}`}
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive/10 hover:text-destructive [@media(hover:none)]:opacity-100"
                        onClick={() => handleDeleteFile(file.conversationId, file.path)}
                      >
                        <Trash2 strokeWidth={1.5} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </SettingsGroup>
            ))}
          </div>
        )}
      </SettingsSection>

      <AlertDialog
        open={!!confirmGroup}
        onOpenChange={(open) => !open && setConfirmGroup(null)}
      >
        <AlertDialogContent className="max-w-xs rounded-[10px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-heading text-[22px] font-normal leading-tight">
              Delete {confirmGroup && plural(confirmGroup.files.length, "file")}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] leading-relaxed">
              Everything written in “{confirmGroup?.title}” will be removed. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmGroup) void handleDeleteAll(confirmGroup.conversationId);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
