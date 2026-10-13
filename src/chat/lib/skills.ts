export type SkillId =
    | "verify_before_acting" | "virtual_file_system"
    | "research_workflow" | "script_creation_workflow" | "script_format"
    | "injection_timing" | "persistent_storage" | "scope_confirmation"
    | "script_management" | "element_picker" | "quality_assurance" | "debugging_workflow";

export interface Skill {description: string; content: string}

export const skills: Record<SkillId, Skill> = {
    verify_before_acting: {
        description: "Live verification and source handling.",
        content: `Verify web facts, selectors, URLs, and page behavior from live tools. Use observed links, user-provided URLs, or known entry points; never invent deep links. For historical designs inspect archived pages; for brand styling inspect representative live elements. Verify API details from official documentation. Reuse evidence while valid; re-inspect after relevant mutations/navigation. State uncertainty or access limitations. Keep source URLs with findings.`,
    },
    virtual_file_system: {
        description: "Virtual file conventions and surgical editing.",
        content: `Use one self-contained script per scripts/<kebab-case-name>.js file. createFileTool fails if it exists. viewCodeFiles reads numbered lines or lists a path ending in /. strReplaceTool edits a unique exact string; its edits array applies several replacements atomically in order. Line-number prefixes are display-only. Re-read only when contents are unknown or changed. Files persist across turns. Delete working files only after verified handoff, unless iteration continues. Saved scripts are separate; manage them with listScripts/toggleScript/removeScript.`,
    },
    research_workflow: {
        description: "Navigate, inspect, interact, report.",
        content: `Use supplied tab context. navigateTo({url, waitForSelector, readText:true}) can navigate, wait, and read together. Read scoped text for facts; DOM for links and controls; screenshots for visual questions. Enable browsing for click/type/select/scroll/submit. Recheck after navigation or relevant page changes; do not repeat successful waits. Report findings with observed URLs. Confirm consequential actions before executing them.`,
    },
    script_creation_workflow: {
        description: "Inspect, author, test, confirm scope, save, verify.",
        content: `Script workflow:
1. Inspect the actual target DOM; inspect styles only if adding UI. Reuse valid observations.
2. Create scripts/<kebab-case-name>.js with one self-contained named function. Return a short status. Use separate files for separate changes.
3. executeContentScript({path}); verify the requested effect using DOM checks, or screenshots for visual work. Enable debugging if needed. Capture console errors while reproducing failures.
4. Edit with strReplaceTool: old_str must match exactly once. Use edits for multiple related replacements. Re-read only if unsure of contents; never include displayed line-number prefixes.
5. Confirm scope with askUser: this page, similar pages (derived pattern), or all pages (explain breadth). Use the confirmed Chrome URL match pattern.
6. Choose runAt: document_end for hiding/removing; document_idle for UI additions; document_start only when pre-DOM execution is required. At document_start the body may not exist.
7. saveScript reads the tested file. Reload, then verify the saved behavior. Handle missing elements gracefully. Do not claim success from a save acknowledgement alone.
8. Delete the working file after verified handoff unless iteration continues. Saved scripts are canonical after handoff.`,
    },
    script_format: {
        description: "Named-function and sandbox requirements.",
        content: `Each file must define one top-level named function, e.g. function highlightLinks() { document.querySelectorAll('a').forEach(el => el.style.backgroundColor = 'yellow'); return 'Links highlighted'; }. The runner invokes it automatically. Bare statements, arrow functions and top-level IIFEs are invalid. Keep it self-contained. The USER_SCRIPT sandbox can modify DOM but cannot access page globals/framework state. It is exempt from page CSP. Each script has an isolated instance per page load. MH_* persistence is available only to saved scripts; fetch persistent_storage before using it.`,
    },
    injection_timing: {
        description: "Choose when saved scripts run.",
        content: `document_idle: default for UI/features after page load. document_end: DOM ready, useful for hiding elements early. document_start: before page parsing, for early CSS/observers; body and queried elements may not exist. Scripts use the isolated USER_SCRIPT world, so overriding its globals does not replace the page's globals.`,
    },
    persistent_storage: {
        description: "MH_* saved-script persistence API.",
        content: `Saved scripts have isolated persistent storage. All functions are async: MH_setValue(key,value), MH_getValue(key) (null if missing), MH_deleteValue(key), MH_listValues() (all pairs). Values must be JSON-serializable. These functions are unavailable in executeContentScript tests: simulate with variables there, then add persistence for the saved version and verify after reload. Keep a regular named outer function and use an async IIFE inside:
function countVisits() { (async () => { const n = (await MH_getValue('visits')) || 0; await MH_setValue('visits', n + 1); })(); }
Use ordinary variables for temporary page state.`,
    },
    scope_confirmation: {
        description: "Confirm persistent-script URL scope.",
        content: `Before saving, use askUser to confirm this page, similar pages, or all pages (<all_urls>, with a breadth warning). Derive similar-page patterns from the actual URL, e.g. https://example.com/user/123/posts -> https://example.com/user/*/posts. The UI provides Other for a custom pattern. Validate and use the user's selected scope.`,
    },
    script_management: {
        description: "Manage saved browser scripts.",
        content: `listScripts returns IDs, names, status and URL patterns. conversationOnly filters to this chat. toggleScript pauses/resumes by ID; removeScript permanently deletes by ID after confirmation. These act on saved scripts, not virtual working files.`,
    },
    element_picker: {
        description: "Resolve ambiguous element references.",
        content: `If the target cannot be identified from context, ask the user to select it with the element picker and send another message. Selected-element summaries accompany the message. Reinspect the live element if more detail is needed.`,
    },
    quality_assurance: {
        description: "Verification before and after saving.",
        content: `Verify requested behavior and missing-element handling before saving. Inspect console errors when diagnosing failures or risky execution. Use screenshots for visual changes; DOM checks for nonvisual changes. After saving, reload and verify actual injection. Delete the working file after handoff unless still iterating.`,
    },
    debugging_workflow: {
        description: "Diagnose failures using targeted evidence.",
        content: `Inspect the exact error and relevant selector/file range. getDebugInfo captures console output during its observation window; reproduce the failure during capture, not before it. Use network capture only for network issues and narrow with urlFilter. Read-only inspections can run together. Use screenshots only for visual failures. Change the failing condition before retrying identical arguments. Patch surgically, rerun, and verify.`,
    },
};
