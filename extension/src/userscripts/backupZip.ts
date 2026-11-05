// Reads .zip files with what the browser already has, for userscript manager backups.

interface ZipEntry {
    name: string;
    bytes: Uint8Array;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
    const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZip(zip: Uint8Array): Promise<ZipEntry[]> {
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
    // The directory's end record sits last, before a comment of up to 64 KB.
    let end = -1;
    for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
        if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) { end = i; break; }
    }
    if (end < 0) throw new Error("This isn't a readable .zip file.");

    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    const entries: ZipEntry[] = [];
    for (let i = 0; i < count; i++) {
        if (offset + 46 > zip.length || view.getUint32(offset, true) !== CENTRAL_DIRECTORY_ENTRY) {
            throw new Error("This .zip file is damaged.");
        }
        const method = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const size = view.getUint32(offset + 24, true);
        const nameLength = view.getUint16(offset + 28, true);
        const extraLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const headerAt = view.getUint32(offset + 42, true);
        const name = decoder.decode(zip.subarray(offset + 46, offset + 46 + nameLength));
        offset += 46 + nameLength + extraLength + commentLength;

        if (name.endsWith("/")) continue;
        if (size > MAX_ENTRY_BYTES) throw new Error(`${name} is too large to import.`);
        if (headerAt + 30 > zip.length || view.getUint32(headerAt, true) !== LOCAL_FILE_HEADER) {
            throw new Error("This .zip file is damaged.");
        }
        // The local header's own name and extra lengths can differ from the directory's.
        const dataAt = headerAt + 30 + view.getUint16(headerAt + 26, true) + view.getUint16(headerAt + 28, true);
        const data = zip.subarray(dataAt, dataAt + compressedSize);
        if (method === 0) entries.push({name, bytes: data});
        else if (method === 8) entries.push({name, bytes: await inflate(data)});
        else throw new Error(`${name} uses a compression this can't read.`);
    }
    return entries;
}

/** A script from a backup, with the saved data and on/off state Tampermonkey exported beside it. */
interface BackupScript {
    fileName: string;
    source: string;
    values: Record<string, unknown>;
    enabled: boolean;
}

function readJson(bytes: Uint8Array | undefined): any {
    if (!bytes) return undefined;
    try {
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return undefined;
    }
}

/**
 * Tampermonkey writes `Name.user.js` with `Name.options.json` and `Name.storage.json`.
 * Other managers' backups still yield their scripts, without the extras.
 */
export function readBackup(entries: ZipEntry[]): BackupScript[] {
    const byName = new Map(entries.map((e) => [e.name, e.bytes]));
    return entries.filter((e) => e.name.endsWith(".user.js")).map((entry) => {
        const stem = entry.name.slice(0, -".user.js".length);
        const options = readJson(byName.get(`${stem}.options.json`));
        const storage = readJson(byName.get(`${stem}.storage.json`));
        const values = storage?.data;
        return {
            fileName: entry.name,
            source: new TextDecoder().decode(entry.bytes),
            values: values && typeof values === "object" && !Array.isArray(values) ? values : {},
            enabled: (options?.settings?.enabled ?? options?.enabled) !== false,
        };
    });
}
