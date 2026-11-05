import {javascriptLanguage} from "@codemirror/lang-javascript";

/**
 * The first line the parser couldn't make sense of, or null. The parser recovers
 * rather than stops and isn't the browser's own, so treat this as "looks wrong".
 */
export function findSyntaxProblem(code: string): {line: number; offset: number} | null {
    let offset = -1;
    javascriptLanguage.parser.parse(code).iterate({
        enter(node) {
            if (offset >= 0) return false;
            if (node.type.isError) offset = node.from;
            return undefined;
        },
    });
    if (offset < 0) return null;
    return {line: code.slice(0, offset).split("\n").length, offset};
}
