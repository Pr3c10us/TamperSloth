import {formatElapsedTime} from "./efficiency";

/**
 * One-line label for a run of thinking and tool steps, e.g.
 * "Thought for 12s, read the page, clicked, used 4 tools".
 */

export type SummaryStep =
    | {kind: "thinking"; durationMs?: number}
    | {kind: "tool"; name: string; args?: Record<string, unknown>; failed?: boolean};

const VERBS: Record<string, string> = {
    getCurrentTab: "checked the tab", getPageText: "read the page", getPageStructure: "inspected the page",
    getElementDetails: "inspected an element", navigateTo: "opened a page", navigateHistory: "navigated",
    reloadPage: "reloaded the page", clickElement: "clicked", clickTarget: "clicked", typeText: "typed",
    selectOption: "picked an option", scrollPage: "scrolled", submitForm: "submitted a form",
    waitForElement: "waited", takeScreenshot: "took a screenshot", takeMarkedScreenshot: "took a screenshot",
    executeContentScript: "ran a script", evaluateJavaScript: "ran JavaScript", saveScript: "saved a change",
    listScripts: "listed changes", toggleScript: "toggled a change", removeScript: "removed a change",
    viewCodeFiles: "viewed files", getSkill: "loaded guidance", enableTools: "enabled tools",
    readToolResult: "reread a result", annotatePage: "drew guidance", waitForUserAction: "guided a step",
    browserTabs: "managed tabs", accessibilityTree: "read accessibility", persistentStore: "used storage",
    siteRecipes: "used site recipes", clipboard: "used the clipboard", browserDownload: "downloaded a file",
    browserNotify: "sent a notification", trustedInput: "sent input", networkCapture: "inspected the network",
    deepDOM: "inspected frames", browserGesture: "performed a gesture", getDebugInfo: "read debug info",
    getLocalStorage: "read storage", getCookies: "read cookies", askUser: "asked you",
};
const FILE_VERBS: Record<string, string> = {createFileTool: "created", strReplaceTool: "edited", deleteFileTool: "deleted"};

/** Past-tense phrase for one call; file edits name the file. */
export function toolVerb(name: string, args?: Record<string, unknown>): string {
    if (name in FILE_VERBS) {
        const path = typeof args?.path === "string" ? args.path.split(/[\\/]/).pop() : undefined;
        return path ? `${FILE_VERBS[name]} ${path}` : `${FILE_VERBS[name]} a file`;
    }
    return VERBS[name] ?? `used ${name}`;
}

export function summarizeSteps(steps: SummaryStep[]): string {
    const parts: string[] = [];
    const thinking = steps.filter(step => step.kind === "thinking");
    const tools = steps.filter((step): step is Extract<SummaryStep, {kind: "tool"}> => step.kind === "tool");
    if (thinking.length) {
        const known = thinking.filter(step => step.durationMs !== undefined);
        const total = known.reduce((sum, step) => sum + step.durationMs!, 0);
        parts.push(known.length && total >= 1000 ? `thought for ${formatElapsedTime(total)}` : "thought");
    }
    const verbs = [...new Set(tools.map(step => toolVerb(step.name, step.args)))];
    parts.push(...verbs.slice(0, 2));
    if (tools.length > 1) parts.push(`used ${tools.length} tools`);
    const failed = tools.filter(step => step.failed).length;
    if (failed) parts.push(`${failed} failed`);
    const text = parts.join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}
