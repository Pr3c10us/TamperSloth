import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Settings,
  Play,
  Pause,
  Download,
  Trash2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  loadScripts,
  deleteScript,
  updateScriptStatus,
  exportScript,
} from "./chat/lib/storage";
import type { BackgroundScript } from "./chat/lib/types";

function App() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<BackgroundScript[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    loadScripts().then(setScripts);
  }, []);

  const handleToggleStatus = async (script: BackgroundScript) => {
    const next = script.status === "active" ? "paused" : "active";
    await updateScriptStatus(script.id, next);
    setScripts((prev) =>
      prev.map((s) => (s.id === script.id ? { ...s, status: next } : s)),
    );
  };

  const handleDelete = async (id: string) => {
    await deleteScript(id);
    setScripts((prev) => prev.filter((s) => s.id !== id));
    if (expanded === id) setExpanded(null);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background font-sans">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-muted px-3.5 py-3">
        <div className="flex items-center gap-2">
          <img src="favicon.svg" className="h-5 w-5" alt="" />
          <span className="font-heading text-lg leading-none text-accent italic">
            gallery
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/settings")}
          className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        >
          <Settings strokeWidth={1.5} className="size-3.5" />
          <span className="font-mono text-[10.5px] tracking-[.12em] uppercase">
            settings
          </span>
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Hero / CTA */}
        <div className="px-4 pt-6 pb-5">
          <h1 className="font-heading text-[clamp(28px,8vw,38px)] leading-tight mb-1.5">
            Your browser,
            <br />
            <span className="italic text-accent">automated.</span>
          </h1>
          <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
            Chat with an AI that can write and run scripts directly on any page.
          </p>
          <div className="flex items-center gap-2">
            <Button onClick={() => navigate("/chat")} className="gap-2">
              <MessageSquare strokeWidth={1.5} className="size-4" />
              Open Chat
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/settings")}
              className="gap-2"
            >
              <Settings strokeWidth={1.5} className="size-4" />
              Settings
            </Button>
          </div>
        </div>

        <Separator />

        {/* Script Library */}
        <div className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[10.5px] tracking-[.12em] text-muted-foreground uppercase">
              Saved Scripts
            </span>
            {scripts.length > 0 && (
              <span className="font-mono text-[10.5px] text-muted-foreground">
                {scripts.length}
              </span>
            )}
          </div>

          {scripts.length === 0 ? (
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              No scripts yet. Open Chat and ask the AI to write one.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-muted">
              {scripts.map((script) => {
                const isExpanded = expanded === script.id;
                return (
                  <li key={script.id}>
                    <button
                      onClick={() =>
                        setExpanded(isExpanded ? null : script.id)
                      }
                      className="flex w-full items-center gap-2 py-2.5 text-left transition-colors hover:opacity-70"
                    >
                      {isExpanded ? (
                        <ChevronDown
                          strokeWidth={1.5}
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      ) : (
                        <ChevronRight
                          strokeWidth={1.5}
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="flex-1 truncate text-sm font-medium">
                        {script.name}
                      </span>
                      <Badge
                        variant={
                          script.status === "active" ? "default" : "secondary"
                        }
                        className="shrink-0 text-[10px]"
                      >
                        {script.status}
                      </Badge>
                    </button>

                    {isExpanded && (
                      <div className="pb-3 pl-5 pr-1">
                        {script.description && (
                          <p className="mb-2 text-[13px] leading-relaxed text-muted-foreground">
                            {script.description}
                          </p>
                        )}
                        {script.urlMatchPattern && (
                          <p className="mb-3 font-mono text-[11px] text-muted-foreground/70">
                            {script.urlMatchPattern}
                          </p>
                        )}
                        <div className="flex items-center gap-0.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-7 p-0"
                                onClick={() => handleToggleStatus(script)}
                              >
                                {script.status === "active" ? (
                                  <Pause
                                    strokeWidth={1.5}
                                    className="size-3.5"
                                  />
                                ) : (
                                  <Play
                                    strokeWidth={1.5}
                                    className="size-3.5"
                                  />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {script.status === "active" ? "Pause" : "Resume"}
                            </TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-7 p-0"
                                onClick={() => exportScript(script)}
                              >
                                <Download
                                  strokeWidth={1.5}
                                  className="size-3.5"
                                />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Export</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(script.id)}
                              >
                                <Trash2
                                  strokeWidth={1.5}
                                  className="size-3.5"
                                />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
