import {readFile, saveScript, writeFile} from "../chat/lib/storage";
import type {BackgroundScript} from "../chat/lib/types";
import {prepareUserscript, userscriptFields} from "./installUserscript";
import {parseUserscript} from "./userscript";

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * Why this code can't run as this script, if so. A plain script starts from its
 * first named function, so without one the runner has nothing to call.
 */
export function scriptCodeProblem(script: BackgroundScript, code: string): string | null {
    if (script.userscript) {
        try {
            parseUserscript(code);
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    return /function\s+[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/.test(code)
        ? null
        : "This script needs a named function to start from, like function main() { … }.";
}

/**
 * The script with its code replaced. A userscript's header decides where and how
 * it runs, so that's read again too; its @require and @resource files are fetched
 * only if the list changed. Throws with a readable message.
 */
export async function withEditedCode(script: BackgroundScript, code: string): Promise<BackgroundScript> {
    const us = script.userscript;
    if (!us) return {...script, code};

    const parsed = parseUserscript(code);
    const filesChanged = !sameList(parsed.requires, us.requires.map((file) => file.url))
        || !sameList(parsed.resources.map((file) => `${file.name} ${file.url}`), us.resources.map((file) => `${file.name} ${file.url}`));
    const files = filesChanged ? await prepareUserscript(code, us.sourceUrl) : {requires: us.requires, resources: us.resources};

    return {
        ...script,
        name: parsed.name,
        description: parsed.description,
        code,
        urlMatchPattern: parsed.matches[0] ?? parsed.includes[0] ?? "",
        runAt: parsed.runAt,
        userscript: {...us, ...userscriptFields(parsed), requires: files.requires, resources: files.resources},
    };
}

/**
 * Saves a hand edit. The chat's working file follows along when it was in step,
 * so the agent's next save can't bring the old code back. A working file with
 * edits of its own is left alone: those aren't ours to discard.
 */
export async function saveEditedScript(script: BackgroundScript, code: string): Promise<BackgroundScript> {
    const updated = await withEditedCode(script, code);
    if (script.sourcePath && script.conversationId) {
        const working = await readFile(script.conversationId, script.sourcePath);
        if (working === script.code) await writeFile(script.conversationId, script.sourcePath, code);
    }
    await saveScript(updated);
    return updated;
}
