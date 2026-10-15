import {useId, useState} from "react";
import {useNavigate} from "react-router-dom";
import {AlertCircle, Check, ChevronRight, Copy, Settings} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {summarizeError} from "../lib/errorSummary";
import {Hint} from "./Hint";

/** The raw error text, collapsed behind a "Details" toggle, with a copy button. */
export function ErrorDetails({details, className}: { details: string; className?: string }) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const bodyId = useId();

    const copy = async () => {
        await navigator.clipboard.writeText(details);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className={className}>
            <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => setOpen(!open)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-sm font-mono text-[10px] uppercase tracking-[.12em] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
            >
                {open ? "Hide details" : "Details"}
                <ChevronRight aria-hidden className={cn("size-3 transition-transform duration-200", open && "rotate-90")} strokeWidth={2}/>
            </button>
            <div id={bodyId} className="ts-collapse" data-open={open} inert={!open}>
                <div>
                    <div className="relative mt-2 rounded-md border border-border bg-muted/40">
                        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words p-2.5 pr-9 font-mono text-[11px] leading-relaxed text-muted-foreground">
                            {details}
                        </pre>
                        <Hint label={copied ? "Copied" : "Copy error"}>
                            <button
                                type="button"
                                onClick={copy}
                                aria-label="Copy error"
                                className="absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                                {copied ? <Check className="size-3" strokeWidth={2.5}/> : <Copy className="size-3" strokeWidth={2}/>}
                            </button>
                        </Hint>
                    </div>
                </div>
            </div>
        </div>
    );
}

/** A short, plain error line; the full message is one click away. */
export function ErrorNotice({message, className}: { message: string; className?: string }) {
    const {summary, details, action} = summarizeError(message);
    const navigate = useNavigate();
    return (
        <div role="alert" className={cn("flex flex-col gap-1.5", className)}>
            <div className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="mt-[3px] size-3.5 shrink-0" strokeWidth={1.75}/>
                <span className="min-w-0 leading-snug">{summary}</span>
            </div>
            {action === "settings" && (
                <div className="pl-5.5">
                    <Button variant="outline" size="xs" onClick={() => navigate("/settings?tab=connections")}>
                        <Settings strokeWidth={1.5}/>
                        Open connections
                    </Button>
                </div>
            )}
            {details && <ErrorDetails details={details} className="pl-5.5"/>}
        </div>
    );
}
