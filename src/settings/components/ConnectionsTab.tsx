import {useEffect, useState} from "react";
import {ProviderCard} from "./ProviderCard";
import {PROVIDERS_PRIMARY} from "./providers";
import {Lock} from "lucide-react";
import {
    deleteApiKey,
    getApiKeys,
    setApiKey,
    subscribeApiKeys,
} from "../lib/storage";

export function ConnectionsTab() {
    const [keys, setKeys] = useState<Record<string, string>>({});
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [editing, setEditing] = useState<string | null>(null);

    useEffect(() => {
        getApiKeys().then(setKeys);
        return subscribeApiKeys(setKeys);
    }, []);

    const handleSave = async (id: string) => {
        const value = drafts[id]?.trim();
        if (!value) return;
        await setApiKey(id, value);
        setKeys((k) => ({...k, [id]: value}));
        setDrafts((d) => {
            const {[id]: _, ...rest} = d;
            return rest;
        });
        setEditing(null);
    };

    const handleEdit = (id: string) => {
        setDrafts((d) => ({...d, [id]: keys[id] ?? ""}));
        setEditing(id);
    };

    const handleCancel = () => {
        setEditing(null);
        setDrafts({});
    };

    const handleDelete = async (id: string) => {
        await deleteApiKey(id);
        setKeys((k) => {
            const {[id]: _, ...rest} = k;
            return rest;
        });
        setDrafts((d) => {
            const {[id]: _, ...rest} = d;
            return rest;
        });
        if (editing === id) setEditing(null);
    };

    return (
        <>
            <h2 className="mb-1 font-heading text-3xl leading-tight">
                Bring your own key.
            </h2>
            <p className="mb-4 text-[13px]  leading-relaxed text-muted-foreground">
                The sloth needs a model. Paste a key and we'll do the lifting. Keys live
                in your browser, never on a server, ours or anyone's.
            </p>

            {PROVIDERS_PRIMARY.map((p) => (
                <ProviderCard
                    key={p.id}
                    p={p}
                    connected={!!keys[p.id]}
                    editing={editing === p.id}
                    apiKey={editing === p.id ? drafts[p.id] ?? "" : keys[p.id] ?? ""}
                    onSetKey={(k) => setDrafts((s) => ({...s, [p.id]: k}))}
                    onSave={() => handleSave(p.id)}
                    onEdit={() => handleEdit(p.id)}
                    onDelete={() => handleDelete(p.id)}
                    onCancel={handleCancel}
                />
            ))}

            <aside className="mt-8 flex items-start gap-4 border-l-2 border-foreground bg-card p-4">
                <Lock size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-foreground" />
                <div>
                    <div className="mb-1 text-lg italic font-heading">
                        Where your keys actually go.
                    </div>
                    <p className="text-xs leading-[1.55] text-muted-foreground">
                        Stored in <code>chrome.storage.local</code>.
                        Requests to model providers go straight from this extension to them. Tampersloth has no servers in the middle.
                        That's not a feature, just an admission that we couldn't be bothered.
                    </p>
                </div>
            </aside>

        </>
    );
}
