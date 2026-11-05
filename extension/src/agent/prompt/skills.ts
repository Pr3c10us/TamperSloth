export type SkillId =
    | "verify_before_acting" | "virtual_file_system"
    | "research_workflow" | "script_creation_workflow" | "script_format"
    | "injection_timing" | "persistent_storage" | "image_library" | "scope_confirmation"
    | "script_management" | "element_picker" | "quality_assurance" | "debugging_workflow";

interface Skill {description: string; content: string}

export const skills: Record<SkillId, Skill> = {
    verify_before_acting: {
        description: "Live verification and source handling.",
        content: `Verify web facts, selectors, URLs, and page behavior from live tools. Navigate directly when the URL was seen on the page, given by the user, or is a well-known entry point (e.g. a site's homepage, login, settings, or search page); never guess unseen deep links. For historical designs inspect archived pages; for brand styling inspect representative live elements. Verify API details from official documentation. Reuse evidence while valid; re-inspect after relevant mutations/navigation. State uncertainty or access limitations. Keep source URLs with findings.`,
    },
    virtual_file_system: {
        description: "Virtual file conventions and surgical editing.",
        content: `Use one self-contained script per scripts/<kebab-case-name>.js file. createFileTool fails if it exists; appendToFile adds the next piece of a long file. viewCodeFiles reads numbered lines, finds lines with query, or lists a path ending in /. strReplaceTool edits a unique exact string; its edits array applies several replacements atomically in order. replaceLines replaces a line range without retyping it. Line-number prefixes are display-only. Re-read only when contents are unknown or changed. Files persist across turns, so keep them after saving; they are the fast way back into a script. Saved scripts are separate; openScript brings one back into a working file, and listScripts/toggleScript/removeScript manage them.`,
    },
    research_workflow: {
        description: "Navigate, inspect, interact, report.",
        content: `Use supplied tab context. navigateTo({url, waitForSelector, readText:true}) can navigate, wait, and read together. Read scoped text for facts; DOM for links and controls; screenshots for visual questions. Enable browsing for click/type/select/scroll/submit. Recheck after navigation or relevant page changes; do not repeat successful waits. Report findings with observed URLs. Confirm consequential actions before executing them.`,
    },
    script_creation_workflow: {
        description: "Inspect, author, test, confirm scope, save, verify.",
        content: `Script workflow:
1. Inspect the actual target DOM; inspect styles only if adding UI. Reuse valid observations.
2. Create scripts/<kebab-case-name>.js with one self-contained named function. Return a short status. Use separate files for separate changes. Write the code straight into the file, all of it in one createFileTool call: never draft it in your thinking or in chat, and never split it into pieces, since each piece costs a whole step. A reply's output is limited and thinking counts toward it; if a write is cut off, its finished lines are kept and a note says where appendToFile carries on.
3. executeContentScript({path}); verify the requested effect using DOM checks, or screenshots for visual work. Enable debugging if needed. Capture console errors while reproducing failures.
4. Edit in place, never by rewriting the file. strReplaceTool: old_str must match exactly once (replace_all for a rename); use edits for multiple related replacements. replaceLines for a large block. Find the code with viewCodeFiles query rather than reading the file; never include displayed line-number prefixes.
5. Confirm scope with askUser: this page, similar pages (derived pattern), or all pages (explain breadth). Use the confirmed Chrome URL match pattern.
6. Choose runAt: document_end for hiding/removing; document_idle for UI additions; document_start only when pre-DOM execution is required. At document_start the body may not exist.
7. saveScript reads the tested file; reload: true reloads the tab with the saved version. Verify the saved behavior. Handle missing elements gracefully. Do not claim success from a save acknowledgement alone.
8. Keep the working file after saving. To change a saved script later: openScript (with query) only if the notes give no path, viewCodeFiles query to find the code, strReplaceTool or replaceLines to edit it, test, then saveScript with its scriptId, which updates it in place. Reading all of a large script or writing it again is never needed for an edit.`,
    },
    script_format: {
        description: "Named-function and sandbox requirements.",
        content: `Each file must define one top-level named function, e.g. function highlightLinks() { document.querySelectorAll('a').forEach(el => el.style.backgroundColor = 'yellow'); return 'Links highlighted'; }. The runner invokes it automatically. Bare statements, arrow functions and top-level IIFEs are invalid. Keep it self-contained. The USER_SCRIPT sandbox can modify DOM but cannot access page globals/framework state. It is exempt from page CSP. Each script has an isolated instance per page load, but the DOM is shared with the user's other active scripts, which run in no set order. Give what you add a data-ts-ui value unique to this script and clean up only those values; never remove everything matching [data-ts-ui], or hide or remove what another script added. MH_* persistence is available only to saved scripts; fetch persistent_storage before using it. Images the imageLibrary tool saved are read with MH_getImage(name), in tests too; fetch image_library first.`,
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
    image_library: {
        description: "Save images in the browser and use them from scripts on any site.",
        content: `Save with the imageLibrary tool, which reads the bytes itself: for an image on the page (one you just generated, say) pass its selector or ref, or its url. Never read an image into your own output as base64; it costs far more than a name. Check the returned preview.
In saved scripts, executeContentScript and ISOLATED evaluateJavaScript: await MH_getImage(name) gives null if it's missing, or {name, mimeType, width, height, size, description, dataUrl, blob, objectUrl(), bitmap(), file(filename)}. await MH_listImages() gives the metadata of all of them. In MAIN evaluateJavaScript they aren't available; call them in ISOLATED and pass objectUrl() across, but on a site with a strict Content Security Policy an <img> made in MAIN is blocked, so build it in ISOLATED there. Installed userscripts use GM_getImage(name) and GM_listImages() with those @grant lines.
To attach one to a chat message or form, call imageLibrary upload rather than writing a script, then check the page shows it: pageResponded false means no sign the page took it. Pick what suits the use. <img src> and JS use objectUrl(); cursor: url() uses dataUrl; <canvas> uses bitmap(); uploads use file(). For a picture, use a real <img>, with object-fit for a background-style crop: from a script's world it loads even on a site with a strict Content Security Policy, where a CSS background-image is blocked, even from dataUrl. Use a CSS background only if you confirm it painted. If an image doesn't load, check the console and draw it on a <canvas> from bitmap(), which the policy doesn't cover. bitmap() can't read SVGs.
Save at the size it'll be used, with maxSize: Chrome ignores a CSS cursor over 128px and may swap one over 32px back to the normal cursor near the window's edge. Generated images usually have a solid background; ask for a transparent one if the use needs it. Scripts ask by name, so delete and rename report which saved scripts that breaks.`,
    },
    scope_confirmation: {
        description: "Confirm persistent-script URL scope.",
        content: `Before saving, use askUser to confirm this page, similar pages, or all pages (<all_urls>, with a breadth warning). Derive similar-page patterns from the actual URL, e.g. https://example.com/user/123/posts -> https://example.com/user/*/posts. The UI provides Other for a custom pattern. Validate and use the user's selected scope.`,
    },
    script_management: {
        description: "Manage saved browser scripts.",
        content: `listScripts returns IDs, names, status, URL patterns and sizes. conversationOnly filters to this chat. openScript puts a saved script's code in a working file to edit, and saveScript with scriptId updates it in place. toggleScript pauses/resumes by ID; removeScript permanently deletes by ID after confirmation.`,
    },
    element_picker: {
        description: "Resolve ambiguous element references.",
        content: `If the target cannot be identified from context, ask the user to select it with the element picker and send another message. Selected-element summaries accompany the message. Reinspect the live element if more detail is needed.`,
    },
    quality_assurance: {
        description: "Verification before and after saving.",
        content: `Verify requested behavior and missing-element handling before saving. Inspect console errors when diagnosing failures or risky execution. Use screenshots for visual changes; DOM checks for nonvisual changes. After saving, reload and verify actual injection.`,
    },
    debugging_workflow: {
        description: "Diagnose failures using targeted evidence.",
        content: `Inspect the exact error and relevant selector/file range. getDebugInfo captures console output during its observation window; reproduce the failure during capture, not before it. Use network capture only for network issues and narrow with urlFilter. Read-only inspections can run together. Use screenshots only for visual failures. Change the failing condition before retrying identical arguments. Patch surgically, rerun, and verify.`,
    },
};
