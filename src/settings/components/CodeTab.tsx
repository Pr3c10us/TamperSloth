import { useEffect, useState } from "react";
import { Trash2, FileCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  deleteFile,
  deleteAllFilesForConversation,
  listAllCodeFiles,
  loadConversationHistory,
  type CodeFileEntry,
  type ConversationSummary,
} from "@/src/chat/lib/storage";

interface ConversationGroup {
  conversationId: string;
  title: string;
  files: CodeFileEntry[];
}

export function CodeTab() {
  const [groups, setGroups] = useState<ConversationGroup[]>([]);
  const [loading, setLoading] = useState(true);

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
        title: convMap.get(convId)?.title ?? convId.slice(0, 8) + "…",
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
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="mb-1 font-heading text-3xl leading-tight">
            Code files.
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Files written by the AI during chat sessions. Remove any that are no
            longer needed.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={load}
          className="mt-1 shrink-0 px-2"
          disabled={loading}
        >
          <RefreshCw
            strokeWidth={1.5}
            className={loading ? "size-3.5 animate-spin" : "size-3.5"}
          />
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-[13px] text-muted-foreground">
          Loading…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <FileCode strokeWidth={1.5} className="size-8 text-muted-foreground/40" />
          <p className="text-[13px] text-muted-foreground">No code files stored.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-muted-foreground">
            {totalFiles} file{totalFiles !== 1 ? "s" : ""} across{" "}
            {groups.length} conversation{groups.length !== 1 ? "s" : ""}
          </p>

          {groups.map((group) => (
            <div
              key={group.conversationId}
              className="overflow-hidden rounded-lg border border-border bg-card"
            >
              {/* Group header */}
              <div className="flex items-center justify-between border-b border-muted px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium">
                    {group.title}
                  </p>
                  <p className="font-mono text-[10px] text-muted-foreground/60">
                    {group.conversationId}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-2 shrink-0 size-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => handleDeleteAll(group.conversationId)}
                    >
                      <Trash2 strokeWidth={1.5} className="size-3.5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete all files for this conversation</TooltipContent>
                </Tooltip>
              </div>

              {/* File list */}
              <ul className="divide-y divide-muted">
                {group.files.map((file) => (
                  <li
                    key={file.path}
                    className="flex items-center gap-2 px-3 py-2"
                  >
                    <FileCode
                      strokeWidth={1.5}
                      className="size-3.5 shrink-0 text-muted-foreground/60"
                    />
                    <span className="flex-1 truncate font-mono text-[12px]">
                      {file.path}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-6 shrink-0 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            handleDeleteFile(file.conversationId, file.path)
                          }
                        >
                          <Trash2 strokeWidth={1.5} className="size-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete file</TooltipContent>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
