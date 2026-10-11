import {useEffect, useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Label} from "@/components/ui/label";
import {DEFAULT_AGENT_SETTINGS, loadAgentSettings, saveAgentSettings, type AgentSettings} from "@/src/chat/lib/agentSettings";

export function PreferencesTab() {
    const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
    const [ready, setReady] = useState(false);
    const [status, setStatus] = useState("");
    useEffect(() => { let active = true; void loadAgentSettings().then(value => {
        if (active) { setSettings(value); setReady(true); }
    }); return () => { active = false; }; }, []);

    return (
        <form className="flex max-w-lg flex-col gap-6" onSubmit={async event => {
            event.preventDefault();
            try { await saveAgentSettings(settings); setStatus("Saved. Applies to the next run."); }
            catch { setStatus("Could not save preferences. Please try again."); }
        }}>
            <div>
                <h2 className="mb-2 font-heading text-3xl italic">Agent preferences</h2>
                <p className="text-sm text-muted-foreground">Control how much work the agent can do in a single run.</p>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="maxSteps">Maximum steps</Label>
                <Input id="maxSteps" type="number" min={5} max={200} required disabled={!ready} value={settings.maxSteps}
                    onChange={e => { setStatus(""); setSettings({...settings, maxSteps: Number(e.target.value)}); }}/>
                <p className="text-xs text-muted-foreground">A step is one model response and its tool calls.</p>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="tokenBudget">Token budget per run</Label>
                <Input id="tokenBudget" type="number" min={0} step={1000} required disabled={!ready} value={settings.tokenBudget}
                    onChange={e => { setStatus(""); setSettings({...settings, tokenBudget: Number(e.target.value)}); }}/>
                <p className="text-xs text-muted-foreground">Counts input and output across steps, including cached input. Checked after each step, so the final step can exceed the budget. Set 0 for no token limit. You can continue stopped work with another message.</p>
            </div>
            <div className="grid gap-2">
                <Label htmlFor="reasoning">DeepSeek reasoning</Label>
                <select id="reasoning" className="rounded-md border border-input bg-background px-3 py-2 text-sm" disabled={!ready}
                    value={settings.reasoning} onChange={e => { setStatus(""); setSettings({...settings, reasoning: e.target.value as AgentSettings["reasoning"]}); }}>
                    <option value="balanced">Balanced</option><option value="thorough">Thorough</option>
                </select>
                <p className="text-xs text-muted-foreground">Balanced requests lower effort; thorough requests maximum effort. Other providers retain their existing settings.</p>
            </div>
            <Button className="self-start" type="submit" disabled={!ready}>Save preferences</Button>
            {status && <p role="status" className="text-sm text-muted-foreground">{status}</p>}
        </form>
    );
}
