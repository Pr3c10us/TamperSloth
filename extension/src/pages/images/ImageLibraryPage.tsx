import {useEffect, useRef, useState} from "react";
import {useNavigate} from "react-router-dom";
import {ArrowLeft, ChevronDown, Code, Download, ImagePlus, PackageOpen, Pencil, Save, Trash2} from "lucide-react";
import {toast} from "sonner";
import {Button} from "@/ui/shadcn/button";
import {Input} from "@/ui/shadcn/input";
import {Toaster} from "@/ui/shadcn/sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/ui/shadcn/alert-dialog";
import {PageHeader, PageHeaderAction, PageHeaderTitle} from "@/ui/PageHeader";
import {
    deleteImage,
    exportImages,
    imageFileName,
    imageNameFromFile,
    importImages,
    listImages,
    prepareImage,
    readImage,
    renameImage,
    subscribeToImages,
    writeImage,
    type LibraryImage,
} from "@/storage/imageLibrary";

/** Shows through transparent pixels, so a cut-out doesn't look like it has a white background. */
const CHECKERBOARD = "repeating-conic-gradient(var(--muted) 0% 25%, transparent 0% 50%) 0 0 / 12px 12px";

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function imageFacts(image: LibraryImage) {
    const type = image.mimeType.split("/")[1].replace("svg+xml", "SVG").replace("x-icon", "ICO").toUpperCase();
    return [image.width && image.height ? `${image.width}×${image.height}` : null, type, formatBytes(image.size)].filter(Boolean).join(" · ");
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/** A picture of a saved image, read when it's shown; blob: URLs die with the page, so nothing keeps one. */
function ImageThumb({image, className}: {image: LibraryImage; className: string}) {
    const [url, setUrl] = useState<string>();
    useEffect(() => {
        let current: string | undefined;
        let cancelled = false;
        void readImage(image.name).then((record) => {
            if (!record || cancelled) return;
            current = URL.createObjectURL(record.blob);
            setUrl(current);
        });
        return () => {
            cancelled = true;
            if (current) URL.revokeObjectURL(current);
        };
    }, [image.name, image.updatedAt]);
    return (
        <div className={className} style={{background: CHECKERBOARD}}>
            {url && <img src={url} alt="" className="h-full w-full object-contain"/>}
        </div>
    );
}

export default function ImageLibraryPage() {
    const navigate = useNavigate();
    const [images, setImages] = useState<LibraryImage[] | null>(null);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [renaming, setRenaming] = useState<{from: string; to: string} | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
    const addInput = useRef<HTMLInputElement>(null);
    const importInput = useRef<HTMLInputElement>(null);

    const refresh = () => listImages().then(setImages).catch(() => setImages([]));

    // The agent can save or delete images while this page is open.
    useEffect(() => {
        void refresh();
        return subscribeToImages(() => void refresh());
    }, []);

    const addFiles = async (files: FileList) => {
        const taken = new Set((await listImages()).map((image) => image.name));
        let added = 0;
        for (const file of files) {
            try {
                const name = imageNameFromFile(file.name, taken);
                await writeImage({...await prepareImage(file), name});
                taken.add(name);
                added++;
            } catch (error) {
                toast.error(`Could not add ${file.name}`, {description: error instanceof Error ? error.message : String(error)});
            }
        }
        if (added) toast.success(`Added ${added} image${added !== 1 ? "s" : ""}.`);
        await refresh();
    };

    const backUp = async () => {
        try {
            const exported = await exportImages();
            downloadBlob(new Blob([JSON.stringify({tamperslothImages: exported})], {type: "application/json"}),
                `tampersloth-images-${new Date().toISOString().slice(0, 10)}.json`);
        } catch {
            toast.error("Could not back up your images.");
        }
    };

    const restore = async (file: File) => {
        try {
            const parsed = JSON.parse(await file.text());
            if (!Array.isArray(parsed?.tamperslothImages)) throw new Error("Not a backup");
            const {added, kept, failed} = await importImages(parsed.tamperslothImages);
            toast.success(`Restored ${added.length} image${added.length !== 1 ? "s" : ""}.`, {
                description: [kept.length ? `Kept your own copy of ${kept.join(", ")}.` : "", failed.length ? `Couldn't read ${failed.join(", ")}.` : ""].filter(Boolean).join(" ") || undefined,
            });
            await refresh();
        } catch {
            toast.error("That isn't a TamperSloth image backup.");
        }
    };

    const download = async (image: LibraryImage) => {
        const record = await readImage(image.name);
        if (record) downloadBlob(record.blob, imageFileName(image));
    };

    const copySnippet = async (image: LibraryImage) => {
        await navigator.clipboard.writeText(`const image = await MH_getImage(${JSON.stringify(image.name)});`);
        toast.success("Copied the line a script uses to read it.");
    };

    const applyRename = async () => {
        if (!renaming) return;
        try {
            const name = await renameImage(renaming.from, renaming.to);
            setExpanded(name);
            setRenaming(null);
            await refresh();
            toast.success(`Renamed to "${name}".`, {description: "Scripts that ask for the old name need updating."});
        } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
        }
    };

    const remove = async () => {
        if (!confirmDelete) return;
        const name = confirmDelete;
        setConfirmDelete(null);
        await deleteImage(name);
        await refresh();
        toast.success(`"${name}" deleted.`);
    };

    return (
        <div className="relative flex h-full flex-col overflow-hidden border-l border-border bg-background font-sans">
            <input
                ref={addInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                    if (e.target.files?.length) void addFiles(e.target.files).finally(() => { e.target.value = ""; });
                }}
            />
            <input
                ref={importInput}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void restore(file);
                }}
            />
            <Toaster position="bottom-center"/>

            <PageHeader>
                <PageHeaderAction label="Back" onClick={() => navigate("/gallery")}>
                    <ArrowLeft/>
                </PageHeaderAction>
                <PageHeaderTitle className="flex-1">Saved images</PageHeaderTitle>
                <div className="flex shrink-0 items-center gap-0.5">
                    <PageHeaderAction label="Add images" onClick={() => addInput.current?.click()}>
                        <ImagePlus/>
                    </PageHeaderAction>
                    <PageHeaderAction label="Restore a backup" onClick={() => importInput.current?.click()}>
                        <PackageOpen/>
                    </PageHeaderAction>
                    {!!images?.length && (
                        <PageHeaderAction label="Back up all images" onClick={() => void backUp()}>
                            <Save/>
                        </PageHeaderAction>
                    )}
                </div>
            </PageHeader>

            <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
                {images?.length === 0 && (
                    <div className="mt-10 flex flex-col items-center gap-5 px-2 text-center">
                        <p className="font-heading text-[22px] italic leading-snug text-foreground">No images yet.</p>
                        <p className="-mt-2 text-[13px] leading-relaxed text-muted-foreground">
                            Ask the sloth to save one from any page, or add your own. They stay in this browser, and scripts can use them on any site.
                        </p>
                        <Button variant="outline" onClick={() => addInput.current?.click()} className="w-full gap-2">
                            <ImagePlus strokeWidth={1.5} className="size-3.5"/>
                            Add images
                        </Button>
                    </div>
                )}
                {!!images?.length && (
                    <div className="overflow-hidden rounded-[10px] border border-border bg-card">
                        {images.map((image, i) => {
                            const isExpanded = expanded === image.name;
                            return (
                                <div
                                    key={image.name}
                                    className={[i < images.length - 1 && "border-b border-muted", isExpanded && "bg-background"].filter(Boolean).join(" ")}
                                >
                                    <button
                                        onClick={() => { setExpanded(isExpanded ? null : image.name); setRenaming(null); }}
                                        className="flex w-full cursor-pointer items-center gap-3 px-3.5 py-2.5 text-left"
                                    >
                                        <ImageThumb image={image} className="size-10 shrink-0 overflow-hidden rounded-[6px] border border-border"/>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[14px] font-medium text-foreground">{image.name}</span>
                                            <span className="block truncate font-mono text-[10.5px] tracking-[.04em] text-muted-foreground">{imageFacts(image)}</span>
                                        </span>
                                        <ChevronDown
                                            strokeWidth={1.5}
                                            className={["size-3.5 shrink-0 text-muted-foreground transition-transform duration-200", isExpanded && "rotate-180"].filter(Boolean).join(" ")}
                                        />
                                    </button>
                                    {isExpanded && (
                                        <div className="px-3.5 pb-3.5">
                                            <ImageThumb image={image} className="mb-3 h-44 w-full overflow-hidden rounded-[8px] border border-border"/>
                                            {image.description && <p className="mb-2 text-[13px] leading-relaxed text-muted-foreground">{image.description}</p>}
                                            {image.source && <p className="mb-3 truncate font-mono text-[10.5px] text-muted-foreground" title={image.source}>{image.source}</p>}
                                            {renaming?.from === image.name ? (
                                                <form
                                                    className="flex items-center gap-1.5"
                                                    onSubmit={(e) => { e.preventDefault(); void applyRename(); }}
                                                >
                                                    <Input
                                                        autoFocus
                                                        aria-label={`New name for ${image.name}`}
                                                        value={renaming.to}
                                                        onChange={(e) => setRenaming({from: image.name, to: e.target.value})}
                                                        className="h-7 min-w-0 flex-1 text-[12px]"
                                                    />
                                                    <Button type="submit" size="sm" className="h-7 px-2 text-[11.5px]">Rename</Button>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => setRenaming(null)} className="h-7 px-2 text-[11.5px]">Cancel</Button>
                                                </form>
                                            ) : (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Button variant="outline" size="sm" onClick={() => void copySnippet(image)} className="h-7 gap-1 px-2 text-[11.5px]">
                                                        <Code strokeWidth={1.5} className="size-[11px]"/>
                                                        Copy for scripts
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => setRenaming({from: image.name, to: image.name})} className="h-7 gap-1 px-2 text-[11.5px]">
                                                        <Pencil strokeWidth={1.5} className="size-[11px]"/>
                                                        Rename
                                                    </Button>
                                                    <Button variant="outline" size="sm" onClick={() => void download(image)} className="h-7 gap-1 px-2 text-[11.5px]">
                                                        <Download strokeWidth={1.5} className="size-[11px]"/>
                                                        Download
                                                    </Button>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setConfirmDelete(image.name)}
                                                        className="h-7 gap-1 px-2 text-[11.5px] text-destructive hover:border-destructive hover:bg-destructive hover:text-white"
                                                    >
                                                        <Trash2 strokeWidth={1.5} className="size-[11px]"/>
                                                        Delete
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
                <AlertDialogContent className="max-w-xs rounded-[10px] border-foreground">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="font-heading text-[22px] leading-tight">Delete {confirmDelete}?</AlertDialogTitle>
                        <AlertDialogDescription className="text-[13px] leading-relaxed text-muted-foreground">
                            This can't be undone. Scripts that use this image will stop finding it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep it</AlertDialogCancel>
                        <AlertDialogAction onClick={() => void remove()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
