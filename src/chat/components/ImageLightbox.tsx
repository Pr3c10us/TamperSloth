import {useSyncExternalStore, type ReactNode} from "react";
import {Dialog} from "radix-ui";
import {X} from "lucide-react";
import {cn} from "@/lib/utils";

interface OpenImage {
    src: string;
    alt: string;
}

// One lightbox for the whole panel; any thumbnail can open it.
let current: OpenImage | null = null;
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

function setCurrent(next: OpenImage | null) {
    current = next;
    for (const fn of listeners) fn();
}

export function openImage(src: string, alt = "") {
    setCurrent({src, alt});
}

/** A thumbnail that opens its image full size on click (or Enter/Space). */
export function ZoomableImage({src, alt = "", className, children}: { src: string; alt?: string; className?: string; children: ReactNode }) {
    return (
        <button
            type="button"
            onClick={event => {
                event.stopPropagation();
                openImage(src, alt);
            }}
            aria-label={alt ? `View ${alt} full size` : "View image full size"}
            className={cn("block cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring/60", className)}
        >
            {children}
        </button>
    );
}

/** Full-size view of the image last opened with `openImage`. Click anywhere or press Esc to close. */
export function ImageLightbox() {
    const image = useSyncExternalStore(subscribe, () => current, () => null);
    return (
        <Dialog.Root open={!!image} onOpenChange={open => { if (!open) setCurrent(null); }}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
                <Dialog.Content
                    aria-describedby={undefined}
                    onClick={() => setCurrent(null)}
                    className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center p-4 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0"
                >
                    <Dialog.Title className="sr-only">{image?.alt || "Image preview"}</Dialog.Title>
                    {image && (
                        <img
                            src={image.src}
                            alt={image.alt}
                            className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
                        />
                    )}
                    <Dialog.Close
                        aria-label="Close preview"
                        className="absolute right-3 top-3 inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    >
                        <X className="size-4" strokeWidth={2} />
                    </Dialog.Close>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
