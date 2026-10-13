import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plug, SlidersHorizontal, FileCode } from "lucide-react";
import { PageHeader, PageHeaderAction, PageHeaderTitle } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConnectionsTab } from "./components/ConnectionsTab";
import { PreferencesTab } from "./components/PreferencesTab";
import { CodeTab } from "./components/CodeTab";

const TABS = [
  { value: "connections", label: "Connections", icon: Plug },
  { value: "preferences", label: "Preferences", icon: SlidersHorizontal },
  { value: "code", label: "Code", icon: FileCode },
] as const;

function Settings() {
  const navigate = useNavigate();
  // Keep the active tab in the URL so returning to settings lands on the same tab.
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const tab = TABS.some((t) => t.value === requested) ? requested! : "connections";

  return (
    <div className="flex h-full flex-col overflow-hidden border-l border-border bg-background font-sans">
      <Tabs
        value={tab}
        onValueChange={(value) => setParams({ tab: value }, { replace: true })}
        className="flex flex-1 flex-col gap-0 overflow-hidden"
      >
        <div className="shrink-0 border-b border-muted">
          <PageHeader className="border-b-0">
            <PageHeaderAction label="Back" onClick={() => navigate(-1)}>
              <ArrowLeft />
            </PageHeaderAction>
            <PageHeaderTitle>Settings</PageHeaderTitle>
          </PageHeader>

          <div className="px-3.5 pb-3">
            <TabsList className="h-9 w-full rounded-[10px] group-data-horizontal/tabs:h-9">
              {TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger key={value} value={value} className="rounded-[8px] text-[13px]">
                  <Icon strokeWidth={1.75} className="size-3.5" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-xl px-4 pt-5 pb-10">
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
        </div>
      </Tabs>
    </div>
  );
}

export default Settings;
