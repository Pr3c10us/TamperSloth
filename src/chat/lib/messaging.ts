const TIMEOUT_MS = 10_000;

const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>();

if (typeof window !== "undefined") {
    window.addEventListener("message", (e) => {
        const data = e.data;
        if (!data?.type?.startsWith("TAMPERSLOTH_")) return;
        if (!data.id) return;

        const entry = pending.get(data.id);
        if (!entry) return;
        pending.delete(data.id);

        if (data.type === "TAMPERSLOTH_SCRIPT_RESULT") {
            if (data.error) {
                entry.reject(new Error(data.error));
            } else {
                entry.resolve(data.result);
            }
        }

        if (data.type === "TAMPERSLOTH_PAGE_INFO") {
            entry.resolve({ url: data.url, title: data.title, meta: data.meta });
        }
    });
}

function sendToContentScript(message: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const msg = { ...message, id };

        pending.set(id, { resolve, reject });
        window.parent.postMessage(msg, "*");

        setTimeout(() => {
            if (pending.has(id)) {
                pending.delete(id);
                reject(new Error("Message timed out — is the extension content script loaded?"));
            }
        }, TIMEOUT_MS);
    });
}

export async function executeOnPage(script: string): Promise<unknown> {
    return sendToContentScript({ type: "TAMPERSLOTH_EXECUTE_TEMP_SCRIPT", script });
}

export async function getPageInfo(): Promise<{ url: string; title: string; meta: Record<string, string> }> {
    return sendToContentScript({ type: "TAMPERSLOTH_GET_PAGE_INFO" });
}
