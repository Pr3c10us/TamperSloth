import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { ProviderCard } from "./ProviderCard";
import { PROVIDERS_PRIMARY } from "./providers";
import { SettingsGroup, SettingsSection, TabIntro } from "./Section";
import {
    deleteApiKey,
    getApiKeys,
    setApiKey,
    subscribeApiKeys,
    VERTEX_PROJECT_KEY,
} from "../lib/storage";
import { reconcileSelectedModel } from "@/src/chat/lib/modelFallback";
import { AccountCard } from "./AccountCard";
import type { ProviderId } from "@/src/chat/lib/provider";

export function ConnectionsTab() {
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState<string | null>(null);
    const [vertexProject, setVertexProject] = useState("");

    useEffect(() => {
        getApiKeys().then(setKeys);
        return subscribeApiKeys(setKeys);
    }, []);

    const handleSave = async (id: string) => {
        const value = drafts[id]?.trim();
        if (!value) return;
        await setApiKey(id, value);
        setKeys((k) => ({ ...k, [id]: value }));
        if (id === "vertex") {
            const project = vertexProject.trim();
            if (project) await setApiKey(VERTEX_PROJECT_KEY, project);
            else await deleteApiKey(VERTEX_PROJECT_KEY);
            setKeys((k) => {
                const { [VERTEX_PROJECT_KEY]: _, ...rest } = k;
                return project ? { ...rest, [VERTEX_PROJECT_KEY]: project } : rest;
            });
        }
        setDrafts((d) => {
            const { [id]: _, ...rest } = d;
            return rest;
        });
        setEditing(null);
        // A new key takes over from a Sloth (or no) selection.
        await reconcileSelectedModel(id as ProviderId);
    };

    const handleEdit = (id: string) => {
        setDrafts((d) => ({ ...d, [id]: keys[id] ?? "" }));
        if (id === "vertex") setVertexProject(keys[VERTEX_PROJECT_KEY] ?? "");
        setEditing(id);
    };

    const handleCancel = () => {
        setEditing(null);
        setDrafts({});
    };

    const handleDelete = async (id: string) => {
        await deleteApiKey(id);
        setKeys((k) => {
            const { [id]: _, [VERTEX_PROJECT_KEY]: __, ...rest } = k;
            return rest;
        });
        setDrafts((d) => {
            const { [id]: _, ...rest } = d;
            return rest;
        });
        if (editing === id) setEditing(null);
        // A model from this provider moves to the next connected provider's default.
        await reconcileSelectedModel();
    };

    const connectedCount = PROVIDERS_PRIMARY.filter((p) => keys[p.id]).length;

    return (
        <div className="flex flex-col gap-6">
            <TabIntro title={<>Pick a <em>brain.</em></>}>
                The sloth needs a model. Sign in for ours, or paste a key and we'll do the lifting.
            </TabIntro>

            <AccountCard />

            <SettingsSection
                title="Your own keys"
                action={
                    <span className="font-mono text-[11px] text-muted-foreground">
                        {connectedCount} of {PROVIDERS_PRIMARY.length} connected
                    </span>
                }
            >
                <SettingsGroup>
                    {PROVIDERS_PRIMARY.map((p) => (
                        <ProviderCard
                            key={p.id}
                            p={p}
                            connected={!!keys[p.id]}
                            editing={editing === p.id}
                            apiKey={
                                editing === p.id
                                    ? (drafts[p.id] ?? "")
                                    : (keys[p.id] ?? "")
                            }
                            onSetKey={(k) => setDrafts((s) => ({ ...s, [p.id]: k }))}
                            onSave={() => handleSave(p.id)}
                            onEdit={() => handleEdit(p.id)}
                            onDelete={() => handleDelete(p.id)}
                            onCancel={handleCancel}
                            extra={p.id === "vertex" ? {
                                label: "Vertex project ID",
                                placeholder: "Project ID or number (optional)",
                                hint: "Needed for Gemini 4 Argon and the partner and open models (Claude, Grok, Llama, DeepSeek and others), which Vertex serves only from your project. Enable each in Model Garden first.",
                                value: vertexProject,
                                onChange: setVertexProject,
                            } : undefined}
                        />
                    ))}
                </SettingsGroup>
            </SettingsSection>

            <p className="flex gap-2 px-0.5 text-[12px] leading-relaxed text-muted-foreground">
                <Lock strokeWidth={1.5} className="mt-0.5 size-3.5 shrink-0" />
                Keys live in your browser, never on a server, ours or anyone's.
            </p>
        </div>
    );
}
