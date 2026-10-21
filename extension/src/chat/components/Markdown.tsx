import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { memo, useState, useCallback, useMemo } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ZoomableImage } from "./ImageLightbox";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

const LANGUAGE_LABELS: Record<string, string> = {
    js: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX",
    py: "Python", rb: "Ruby", go: "Go", rs: "Rust",
    java: "Java", kt: "Kotlin", swift: "Swift", cs: "C#",
    cpp: "C++", c: "C", html: "HTML", css: "CSS",
    scss: "SCSS", json: "JSON", yaml: "YAML", yml: "YAML",
    sql: "SQL", sh: "Shell", bash: "Bash", zsh: "Zsh",
    md: "Markdown", xml: "XML", toml: "TOML", graphql: "GraphQL",
    dockerfile: "Dockerfile", makefile: "Makefile", php: "PHP",
    lua: "Lua", r: "R", dart: "Dart", zig: "Zig",
};

function getLanguageInfo(className?: string): { lang: string; label: string } | null {
    const match = className?.match(/language-(\w+)/);
    if (!match) return null;
    const lang = match[1].toLowerCase();
    const label = LANGUAGE_LABELS[lang] ?? lang.charAt(0).toUpperCase() + lang.slice(1);
    return { lang, label };
}

function extractText(node: React.ReactNode): string {
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(extractText).join("");
    if (node !== null && node !== undefined && typeof node === "object" && "props" in node) {
        const element = node as { props: { children?: React.ReactNode } };
        return extractText(element.props.children);
    }
    return "";
}

function CopyButton({ text, className }: { text: string; className?: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = useCallback(() => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [text]);
    return (
        <Button
            variant="ghost"
            size="xs"
            onClick={handleCopy}
            className={cn("h-6 gap-1 px-1.5 text-[10px]", className)}
        >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
        </Button>
    );
}

const codeBlockStyle: React.CSSProperties = {
    margin: 0,
    padding: "12px 14px",
    background: "transparent",
    fontSize: "12.5px",
    lineHeight: "1.6",
};

// Parsing runs remark + Prism over the whole string, so only re-run it when the
// text actually changed — during streaming only one block's text is growing.
export const MarkdownContent = memo(function MarkdownContent({ content, className }: { content: string; className?: string }) {
    const components = useMemo(
        () => ({
            p: ({ children }: any) => (
                <p className="my-1.5 leading-[var(--lh-normal)] text-inherit">{children}</p>
            ),
            strong: ({ children }: any) => (
                <strong className="font-semibold text-inherit">{children}</strong>
            ),
            em: ({ children }: any) => <em className="italic text-inherit">{children}</em>,
            h1: ({ children }: any) => (
                <h1 className="font-heading text-2xl font-normal mt-5 mb-2 leading-[var(--lh-tight)] tracking-[var(--tracking-tight)]">
                    {children}
                </h1>
            ),
            h2: ({ children }: any) => (
                <h2 className="font-heading text-xl font-normal mt-4 mb-1.5 leading-[var(--lh-tight)] tracking-[var(--tracking-tight)]">
                    {children}
                </h2>
            ),
            h3: ({ children }: any) => (
                <h3 className="font-heading text-lg font-normal mt-3 mb-1 leading-[var(--lh-snug)] tracking-[var(--tracking-tight)]">
                    {children}
                </h3>
            ),
            h4: ({ children }: any) => (
                <h4 className="font-heading text-base font-normal mt-2 mb-1 leading-[var(--lh-snug)] tracking-[var(--tracking-tight)]">
                    {children}
                </h4>
            ),
            ul: ({ children }: any) => (
                <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>
            ),
            ol: ({ children }: any) => (
                <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>
            ),
            li: ({ children }: any) => (
                <li className="leading-[var(--lh-normal)]">{children}</li>
            ),
            a: ({ href, children }: any) => (
                <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent underline underline-offset-[3px] decoration-[1px] hover:text-[var(--link-hover)] transition-colors duration-[var(--dur-fast)]"
                >
                    {children}
                </a>
            ),
            img: ({ src, alt }: any) => typeof src === "string" && src ? (
                <ZoomableImage src={src} alt={alt ?? ""} className="my-2 inline-block max-w-full rounded-sm">
                    <img src={src} alt={alt ?? ""} loading="lazy" className="max-h-72 max-w-full rounded-sm border border-border object-contain" />
                </ZoomableImage>
            ) : null,
            blockquote: ({ children }: any) => (
                <blockquote className="border-l-2 border-accent pl-4 my-3 italic text-muted-foreground">
                    {children}
                </blockquote>
            ),
            code: ({ className: codeClassName, children, ...props }: any) => {
                const langInfo = getLanguageInfo(codeClassName);
                if (langInfo) {
                    const codeText = extractText(children).replace(/\n$/, "");
                    return (
                        <div className="my-3 overflow-hidden rounded-sm border border-border bg-card text-card-foreground">
                            <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
                                <span className="eyebrow text-muted-foreground">
                                    {langInfo.label}
                                </span>
                                <CopyButton
                                    text={codeText}
                                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                                />
                            </div>
                            <SyntaxHighlighter
                                style={oneDark}
                                language={langInfo.lang}
                                customStyle={codeBlockStyle}
                                codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
                                PreTag="div"
                            >
                                {codeText}
                            </SyntaxHighlighter>
                        </div>
                    );
                }
                return (
                    <code
                        className="rounded-sm border border-border bg-muted px-[0.4em] py-[0.1em] font-mono text-[0.85em]"
                        {...props}
                    >
                        {children}
                    </code>
                );
            },
            pre: ({ children }: any) => <>{children}</>,
            hr: () => <Separator className="my-6" />,
            table: ({ children }: any) => (
                <div className="my-3 overflow-x-auto rounded-sm border border-border">
                    <table className="w-full caption-bottom text-sm">{children}</table>
                </div>
            ),
            thead: ({ children }: any) => <TableHeader>{children}</TableHeader>,
            tbody: ({ children }: any) => <TableBody>{children}</TableBody>,
            tr: ({ children }: any) => <TableRow>{children}</TableRow>,
            th: ({ children }: any) => (
                <TableHead className="eyebrow h-8 px-3 text-muted-foreground">{children}</TableHead>
            ),
            td: ({ children }: any) => (
                <TableCell className="px-3 py-2 text-sm">{children}</TableCell>
            ),
        }),
        [],
    );

    return (
        <div className={cn("wrap-anywhere", className)}>
            <Markdown remarkPlugins={[remarkGfm]} components={components}>
                {content}
            </Markdown>
        </div>
    );
});
