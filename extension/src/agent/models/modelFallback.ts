import {MODELPROVIDERS, type ProviderId} from "./provider";
import {clearSelectedModel, loadSelectedModel, saveSelectedModel, type SelectedModel} from "@/storage/selectedModel";
import {getApiKeys} from "@/storage/apiKeys";
import {getAccount, isSignedIn} from "@/account/account";

/**
 * Keeps the selected model usable after keys or the account change.
 *
 * The selection stays while its provider still works. Otherwise, and whenever
 * `added` names a provider whose key was just saved over a Sloth (or no)
 * selection, it moves to a provider's default model: BYOK providers first, in
 * picker order, then the Sloth plan's default while signed in.
 */
export async function reconcileSelectedModel(added?: ProviderId): Promise<SelectedModel | null> {
    const [saved, keys, signedIn] = await Promise.all([loadSelectedModel(), getApiKeys(), isSignedIn()]);
    const account = signedIn ? await getAccount() : null;
    const hasKey = (id: ProviderId) => id !== "tampersloth" && !!keys[id];

    const usable = (selection: SelectedModel) => selection.providerId === "tampersloth"
        // The plan has the final say; an unloaded account can't rule a model out.
        ? signedIn && account?.models.find((m) => m.id === selection.modelId)?.available !== false
        : hasKey(selection.providerId);
    const byokPreferred = !!added && hasKey(added) && (!saved || saved.providerId === "tampersloth");
    if (saved && usable(saved) && !byokPreferred) return saved;

    const byok = byokPreferred ? MODELPROVIDERS.find((p) => p.id === added) : MODELPROVIDERS.find((p) => hasKey(p.id));
    const sloth = MODELPROVIDERS.find((p) => p.id === "tampersloth")!;
    const next: SelectedModel | null = byok
        ? {providerId: byok.id, modelId: byok.defaultModel}
        : signedIn
            ? {providerId: "tampersloth", modelId: account?.plan.defaultModel ?? sloth.defaultModel}
            : null;

    if (next) await saveSelectedModel(next.providerId, next.modelId);
    else if (saved) await clearSelectedModel();
    return next;
}
