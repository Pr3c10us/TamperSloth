/** Most files one message can carry. */
export const MAX_ATTACHMENTS = 10;

export interface PendingAttachment {
    kind: "image" | "file";
    name: string;
    size: string;
    ext?: string;
    url?: string | null;
    mediaType?: string;
    file?: File;
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

export function makeAttachmentFromFile(f: File): PendingAttachment {
    return {
        kind: f.type.startsWith("image/") ? "image" : "file",
        name: f.name,
        size: formatSize(f.size),
        ext: (f.name.split(".").pop() || "").toUpperCase().slice(0, 4),
        url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null,
        mediaType: f.type || "application/octet-stream",
        file: f,
    };
}

export async function fileToDataUrl(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/** A captured drawing arrives as a data URL; decoded in place so it joins the files at once. */
export function dataUrlToFile(dataUrl: string, name: string) {
    const [head, body = ""] = dataUrl.split(",");
    const type = head.match(/^data:([^;,]+)/)?.[1] ?? "image/jpeg";
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name, { type });
}
