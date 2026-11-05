export interface BackgroundScript {
    id: string;
    conversationId: string;
    name: string;
    description: string;
    code: string;
    /** The working file it was saved from, where later edits pick it up. */
    sourcePath?: string;
    urlMatchPattern: string;
    status: "active" | "paused";
    runAt: "document_start" | "document_end" | "document_idle";
    /** Present on scripts installed from a Tampermonkey-style .user.js; `code` is then the full source. */
    userscript?: ImportedUserscript;
}

/** What an installed userscript needs at run time, fetched and fixed at install. */
export interface ImportedUserscript {
    namespace: string;
    version: string;
    author: string;
    homepage: string;
    matches: string[];
    includes: string[];
    excludeMatches: string[];
    excludes: string[];
    allFrames: boolean;
    world: "USER_SCRIPT" | "MAIN";
    grants: string[];
    connects: string[];
    /** @require code, inlined so nothing remote loads when a page does. */
    requires: {url: string; code: string}[];
    /** @resource contents, base64-encoded. */
    resources: {name: string; url: string; mimeType: string; data: string}[];
    updateURL: string;
    downloadURL: string;
    /** Where it was installed from; empty for a file or pasted source. */
    sourceUrl: string;
    installedAt: number;
    /** `@run-at context-menu`: never runs on load, only from the right-click menu. */
    contextMenu?: boolean;
    /** Hosts beyond @connect the user always allowed or always blocked when asked. */
    connectAllowed?: string[];
    connectBlocked?: string[];
    /** A newer version whose permissions grew, waiting for the user to review it. */
    pendingUpdate?: {version: string; url: string};
}

export interface ScriptExecutionLog {
    scriptId: string;
    scriptName: string;
    url: string;
    timestamp: number;
    success: boolean;
    error?: string;
}

export type ContentMessage =
    | { type: "TAMPERSLOTH_EXECUTE_TEMP_SCRIPT"; script: string; id: string }
    | { type: "TAMPERSLOTH_GET_PAGE_INFO"; id: string };

export type ContentResponse =
    | { type: "TAMPERSLOTH_SCRIPT_RESULT"; id: string; result: unknown; error?: string }
    | { type: "TAMPERSLOTH_PAGE_INFO"; id: string; url: string; title: string; meta: Record<string, string> };
