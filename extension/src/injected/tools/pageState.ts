/** Runs in the page for getLocalStorage. */
export function readWebStorage(type: string, prefix: string | null, max: number) {
    const readStorage = (storage: Storage, name: string) => {
        const entries: Record<string, string> = {};
        let count = 0;
        for (let i = 0; i < storage.length && count < max; i++) {
            const key = storage.key(i)!;
            if (prefix && !key.startsWith(prefix)) continue;
            let value = storage.getItem(key) ?? "";
            if (value.length > 300)
                value = value.slice(0, 300) + `...[truncated, ${value.length} chars total]`;
            entries[key] = value;
            count++;
        }
        return {
            name,
            count,
            total: storage.length,
            ...(storage.length > count && {
                truncated: true,
                hint: "Not all keys returned. Use keyPrefix to target what you need.",
            }),
            entries,
        };
    };

    const data: any = {origin: location.origin};
    if (type === "local" || type === "both") {
        data.localStorage = readStorage(localStorage, "localStorage");
    }
    if (type === "session" || type === "both") {
        data.sessionStorage = readStorage(
            sessionStorage,
            "sessionStorage"
        );
    }
    return data;
}
