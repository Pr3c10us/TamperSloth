import {readFile, writeFile} from "@/storage/codeFiles";
import {updateScript} from "@/storage/scripts";
import type {BackgroundScript} from "./types";

/**
 * A saved script and the chat working file it was saved from hold the same code
 * until one of them changes. A fingerprint of the code they last shared
 * (`sourceBase`) tells which one moved, so the file can follow the saved script
 * when that loses nothing, and a save never quietly undoes a change made elsewhere.
 */

/** A short fingerprint of code (length and FNV-1a hash). */
export function codeFingerprint(code: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < code.length; i++) {
        hash ^= code.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return `${code.length.toString(36)}.${(hash >>> 0).toString(36)}`;
}

/** The chat whose working file `sourcePath` names. */
export const linkedChat = (script: BackgroundScript) => script.sourceConversationId ?? script.conversationId;

/** Whether this chat holds the script's working file. */
export const linkedHere = (script: BackgroundScript, conversationId: string): script is BackgroundScript & {sourcePath: string} =>
    Boolean(script.sourcePath) && linkedChat(script) === conversationId;

/** Scripts saved before fingerprints count their current code as the one they share. */
const sharedBase = (script: BackgroundScript) => script.sourceBase ?? codeFingerprint(script.code);

/**
 * How a working file stands against its saved script. unsaved: only the file
 * changed since they last matched. stale: only the saved script did (a hand
 * edit, an update, a save from another chat). diverged: both did.
 */
export function compareWorkingFile(script: BackgroundScript, file: string): "saved" | "unsaved" | "stale" | "diverged" {
    if (file === script.code) return "saved";
    const base = sharedBase(script);
    if (codeFingerprint(script.code) === base) return "unsaved";
    return codeFingerprint(file) === base ? "stale" : "diverged";
}

/** Links the script to a working file that now holds its saved code. */
export async function linkWorkingFile(script: BackgroundScript, conversationId: string, path: string): Promise<BackgroundScript> {
    const link = {sourceConversationId: conversationId, sourcePath: path, sourceBase: codeFingerprint(script.code)};
    if (link.sourcePath === script.sourcePath && linkedChat(script) === conversationId && link.sourceBase === script.sourceBase) return script;
    await updateScript(script.id, link);
    return {...script, ...link};
}

export interface SyncedFile {
    path: string;
    code: string;
    /** Edits only the file has, or edits on both sides. */
    state: "saved" | "unsaved" | "diverged";
    script: BackgroundScript;
}

/**
 * This chat's working file for a script it holds, brought up to date wherever
 * nothing is lost: a missing file is restored from the saved code and a stale
 * one refreshed. A file with edits of its own stays as it is.
 */
export async function syncWorkingFile(script: BackgroundScript & {sourcePath: string}, conversationId: string): Promise<SyncedFile> {
    const path = script.sourcePath;
    const file = await readFile(conversationId, path);
    const state = file === null ? "stale" : compareWorkingFile(script, file);
    if (state === "stale") await writeFile(conversationId, path, script.code);
    const code = state === "stale" ? script.code : file!;
    // Fix the shared code once, so a later change on either side can be told apart.
    const keep = state === "diverged" || (state === "unsaved" && script.sourceBase !== undefined);
    const pinned = keep ? script : await linkWorkingFile(script, conversationId, path);
    return {path, code, state: state === "stale" ? "saved" : state, script: pinned};
}
