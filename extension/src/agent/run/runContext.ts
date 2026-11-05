import {scanUntrusted} from "@/agent/safety/contentScreen";
import {browserCall} from "@/agent/tools/browserTools";
import {codeContextNote, lineCount} from "@/agent/tools/codeFileText";
import {serialize} from "@/agent/tools/toolOutput";
import {initialToolGroups} from "@/agent/tools/toolRuntime";
import {listFiles, readFile} from "@/storage/codeFiles";
import {loadScripts} from "@/storage/scripts";
import type {BackgroundScript} from "@/userscripts/types";
import {linkedHere, syncWorkingFile} from "@/userscripts/workingFile";

/**
 * A saved script as the run-start note lists it, with this chat's working file brought up to date
 * first. A file the user deleted stays deleted: without a path, openScript brings it back if needed.
 */
async function noteScript(script: BackgroundScript, conversationId: string) {
    const listed = {id: script.id, name: script.name, lines: lineCount(script.code)};
    try {
        if (!linkedHere(script, conversationId) || await readFile(conversationId, script.sourcePath) === null) return listed;
        const {path, code, state} = await syncWorkingFile(script, conversationId);
        return {...listed, path, lines: lineCount(code), unsaved: state === "unsaved", diverged: state === "diverged"};
    } catch {
        return listed;
    }
}

/**
 * This chat's working files and saved scripts, so an edit needs no lookup and its tools are ready.
 * Each saved script's working file is refreshed first where that loses nothing, so editing one
 * starts from its path, with no openScript step.
 */
async function loadCodeContext(conversationId: string): Promise<{note: string; hasCode: boolean}> {
    const all = await loadScripts().catch((): BackgroundScript[] => []);
    const ours = all.filter(s => s.conversationId === conversationId || linkedHere(s, conversationId));
    // One at a time: each may rewrite the stored script list.
    const scripts = [];
    for (const script of ours) scripts.push(await noteScript(script, conversationId));
    const paths = await listFiles(conversationId).catch((): string[] => []);
    const files = await Promise.all(paths.slice(0, 20).map(async path => ({path, lines: lineCount(await readFile(conversationId, path).catch(() => null) ?? "")})));
    return {
        note: codeContextNote(files, scripts),
        hasCode: scripts.length > 0 || paths.some(path => path.startsWith("scripts/")),
    };
}

/**
 * What the run starts knowing about the working tab: its URL and title, this chat's task tabs and,
 * for page work, the controls on screen with refs, so the first step can act instead of reading.
 */
export async function loadTabContext(conversationId: string, request: string): Promise<{tabContext: string; task?: unknown; hasCode: boolean}> {
    const tabId = Number(new URLSearchParams(window.location.search).get("tabId"));
    const groups = initialToolGroups(request);
    const pageWork = groups.includes("browsing") || groups.includes("guidance");
    const [tab, task, listed, code] = await Promise.all([
        tabId > 0 ? chrome.tabs.get(tabId).catch(() => undefined) : undefined,
        // A task paused for the user's answer resumes with the tabs, group and notes it already had.
        browserCall('task', {conversationId}).then(r => r.task, () => undefined),
        pageWork && tabId > 0 ? browserCall('guidance', {tabId, action: 'controls', limit: 40}).catch(() => undefined) : undefined,
        loadCodeContext(conversationId),
    ]);
    let tabContext = tab
        ? serialize({tabId, url: tab.url, title: tab.title}) + "\nThis is the working tab: make the user's requested result here (navigate it if the work belongs on another site), and keep other tabs for references."
        : "Tab metadata unavailable; call getCurrentTab if needed.";
    const controls = listed?.controls?.length ? {controls: listed.controls, ...(listed.moreControls ? {moreControls: listed.moreControls} : {})} : undefined;
    // This reaches the model without passing a tool's injection screen, so anything suspicious is left for listControls to fetch.
    if (controls && !scanUntrusted(controls).flagged) tabContext += `
On-screen controls at the start (refs work as targets for clickElement, typeText, fillForm, selectOption, submitForm and clickTarget; call listControls once the page changes): ${serialize(controls)}`;
    if (task) tabContext += `
This task's tabs (open from earlier in this chat; reuse them, and finish when done): ${serialize(task)}`;
    return {tabContext: tabContext + code.note, task, hasCode: code.hasCode};
}
