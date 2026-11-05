import type {BackgroundScript} from "@/userscripts/types";
import {exportImages, importImages, referencedImageNames} from "./imageLibrary";
import {saveScript} from "./scripts";

function downloadFile(text: string, filename: string, type: string): void {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function downloadJson(json: string, filename: string): void {
    downloadFile(json, filename, "application/json");
}

const scriptFileName = (script: BackgroundScript) => script.name.replace(/[^a-zA-Z0-9_-]/g, "_");

/** A script with the saved images its code asks for by name, so it still works in another browser. */
async function withItsImages(script: BackgroundScript) {
    const images = await exportImages(referencedImageNames(script.code));
    return images.length ? {...script, images} : script;
}

export async function exportScript(script: BackgroundScript): Promise<void> {
    downloadJson(JSON.stringify(await withItsImages(script), null, 2), `${scriptFileName(script)}.json`);
}

/** Downloads just the script's source, for reading or diffing outside TamperSloth. */
export function downloadScriptSource(script: BackgroundScript): void {
    downloadFile(script.code, `${scriptFileName(script)}.js`, "text/javascript");
}

function isBackgroundScript(obj: unknown): obj is BackgroundScript {
    return !!obj && typeof obj === "object" && "name" in obj && "code" in obj && "urlMatchPattern" in obj;
}

export async function importScriptsFromJson(json: string): Promise<number> {
    const parsed: unknown = JSON.parse(json);
    const items: BackgroundScript[] = Array.isArray(parsed)
        ? parsed.filter(isBackgroundScript)
        : isBackgroundScript(parsed)
            ? [parsed]
            : [];
    if (items.length === 0) throw new Error("No valid scripts found");
    for (const item of items) {
        const {images, ...script} = item as BackgroundScript & {images?: unknown};
        // Images come along first so the script finds them; one with the same name already here stays.
        await importImages(images);
        script.id = crypto.randomUUID();
        await saveScript(script);
    }
    return items.length;
}
