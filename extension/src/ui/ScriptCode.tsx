import {memo} from "react";
import {Prism as SyntaxHighlighter} from "react-syntax-highlighter";
import {oneDark, oneLight} from "react-syntax-highlighter/dist/esm/styles/prism";
import {useResolvedTheme} from "./theme";

interface ScriptCodeProps {
    code: string;
    lineNumbers?: boolean;
    wrap?: boolean;
    fontSize?: string;
    padding?: string;
    /** Cut long lines off instead of scrolling, for previews that can't be scrolled. */
    clip?: boolean;
}

/** Read-only, theme-aware JavaScript source, shared by the viewer tab and the gallery preview. */
export const ScriptCode = memo(function ScriptCode({
    code,
    lineNumbers = false,
    wrap = false,
    fontSize = "13px",
    padding = "16px 18px",
    clip = false,
}: ScriptCodeProps) {
    const theme = useResolvedTheme();
    // The library's own line numbers turn every token into a flex item, which
    // scrambles wrapped lines; one block per line with a CSS number wraps cleanly.
    const lineStyle: React.CSSProperties = wrap
        ? {whiteSpace: "pre-wrap", overflowWrap: "anywhere"}
        : {whiteSpace: "pre"};
    return (
        <SyntaxHighlighter
            language="javascript"
            style={theme === "dark" ? oneDark : oneLight}
            wrapLines
            lineProps={{
                style: lineStyle,
                className: lineNumbers
                    ? "relative block pl-[4em] [counter-increment:line] before:absolute before:left-0 before:w-[2.75em] before:text-right before:text-muted-foreground/55 before:select-none before:content-[counter(line)]"
                    : "block",
            }}
            customStyle={{margin: 0, padding, background: "transparent", fontSize, lineHeight: "1.65", overflow: clip ? "hidden" : "auto"}}
            codeTagProps={{style: {display: "block", counterReset: "line", fontFamily: "var(--font-mono)", background: "transparent"}}}
            PreTag="div"
        >
            {code}
        </SyntaxHighlighter>
    );
});
