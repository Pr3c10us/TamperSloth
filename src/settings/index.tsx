import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plug, SlidersHorizontal, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectionsTab } from "./components/ConnectionsTab";
import { PreferencesTab } from "./components/PreferencesTab";
import { CodeTab } from "./components/CodeTab";

function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("connections");

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-background font-sans">
      <header className="flex items-center justify-between border-b border-muted px-3.5 py-3">
        <Button
          variant="ghost"
          size="icon-lg"
          onClick={() => navigate(-1)}
          aria-label="Back"
        >
          <ArrowLeft strokeWidth={2.25} className="size-5 text-foreground" />
        </Button>
      </header>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex flex-1 flex-col gap-0 overflow-hidden"
      >
        <TabsList
          variant="line"
          className="w-full my-3 h-auto shrink-0 justify-start gap-1 border-b border-muted px-2.5"
        >
          <TabsTrigger value="connections" className="flex-none text-sm">
            <Plug className="size-3" />
            Connections
          </TabsTrigger>
          <TabsTrigger value="preferences" className="flex-none text-sm">
            <SlidersHorizontal className="size-3" />
            Preferences
          </TabsTrigger>
          <TabsTrigger value="code" className="flex-none text-sm">
            <FileCode className="size-3" />
            Code
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <TabsContent value="connections">
            <ConnectionsTab />
          </TabsContent>
          <TabsContent value="preferences">
            <PreferencesTab />
          </TabsContent>
          <TabsContent value="code">
            <CodeTab />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export default Settings;
