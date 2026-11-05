import {temporaryImageHelpers, temporaryImageToken, usesImageHelpers} from "@/background/images/imageScriptApi";
import {hasUserScripts} from "./scriptWorld";
import {buildWrappedCode} from "./wrapScriptCode";

/** Runs one-off code from the agent in a tab, without saving it. */
export async function executeOnTab(tabId: number, code: string): Promise<any> {
    const fnMatch = code.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/);
    if (!fnMatch) {
        throw new Error('code must be a named function definition, e.g. function myFn() { ... }');
    }
    const fnName = fnMatch[1];

    if (!hasUserScripts()) {
        throw new Error(
            '[Tampersloth] userScripts API not available. Go to chrome://extensions, click Tampersloth details, and enable "Allow in Developer Mode" (or "Allow User Scripts"). Then reload the extension.'
        );
    }

    // So a script can be tried with the same image calls it will have once saved.
    const imageHelpers = usesImageHelpers(code) ? temporaryImageHelpers(await temporaryImageToken()) : '';
    const wrappedCode = buildWrappedCode(code, fnName, undefined, '', imageHelpers);

    const results = await chrome.userScripts.execute({
        target: {tabId},
        js: [{code: wrappedCode}],
        world: 'USER_SCRIPT',
    });
    return results?.[0]?.result;
}
