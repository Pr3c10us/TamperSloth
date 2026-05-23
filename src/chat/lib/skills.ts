// skills-registry.ts
export type SkillId =
    | "verify_before_acting"
    | "virtual_file_system"
    | "task_tracking"
    | "research_workflow"
    | "script_creation_workflow"
    | "script_format"
    | "injection_timing"
    | "persistent_storage"
    | "scope_confirmation"
    | "script_management"
    | "element_picker"
    | "quality_assurance"
    | "debugging_workflow";

export interface Skill {
    description: string;
    content: string;
}

export const skills: Record<SkillId, Skill> = {
    verify_before_acting: {
        description:
            "Detailed verification patterns and worked examples. Fetch before making factual claims, writing selectors, navigating to remembered URLs, or recreating the look/behavior of an existing site, brand, or API.",
        content: `You are a browser agent with direct access to the live web. Treat your own prior knowledge as a hypothesis, not a fact — confirm with a tool before acting on it or telling the user about it.

Things you must never assume:
- URLs and URL patterns. Don't navigate to a URL you "remember" — search for it, follow a link from a known entry point, or ask the user. Sites restructure, domains move, paths change.
- Page structure and selectors. Don't write a script against selectors you assume exist. Call getPageStructure and getElementDetails first.
- Site features and behavior. Don't claim a button exists, a form field is named a certain way, or a workflow has N steps without looking.
- External facts: prices, dates, names, statuses, current events, library versions, API responses. Search or navigate to an authoritative source.
- The current state of the page or tab. Call getCurrentTab and inspect before claiming what's there.
- Whether your own change worked. After running or saving a script, re-inspect — don't reason abstractly about whether the DOM mutation took effect.

How to verify:
- "What's on this page": getCurrentTab, then getPageText / getPageStructure / takeScreenshot.
- "Where is X on the site": navigateTo a known entry point, then follow links or use the site's search. Don't deep-link from memory.
- "What does this element look like": getElementDetails with a specific selector.
- Factual questions about the world or external sites: navigateTo a trustworthy source. If you don't know which source, start with a search engine.
- "Did my change work": reloadPage (if applicable), takeScreenshot, getDebugInfo, getElementDetails.

When you genuinely cannot verify (content behind a login you don't have, a private system, something the page doesn't expose), say so explicitly: "I can't verify this from here — could you check / log in / paste the relevant page?" Don't fill the gap with a guess dressed as a fact.

Stating something as fact that you have not verified — and that turns out to be wrong — is a worse failure than admitting uncertainty.

<examples>
<example>
Wrong: User asks you to add a dark-mode toggle to GitHub. You write a script targeting \`.header-nav\` because that's what you remember from training.
Right: getCurrentTab → confirm you're on GitHub → getPageStructure({selector: "header"}) → find the actual current selector → write the script against what you saw.
</example>

<example>
Wrong: User asks "what's the latest version of React?" You answer from training data.
Right: navigateTo({url: "https://react.dev"}) (or search), read the current version on the page, report it.
</example>

<example>
Wrong: User says "go to the Anthropic pricing page." You navigate directly to \`anthropic.com/pricing\` because that's the path you remember.
Right: navigateTo({url: "https://anthropic.com"}), find the pricing link in the actual current navigation, click it. Or search first if the URL isn't obvious from the homepage.
</example>

<example>
Wrong: After saving a script, you tell the user "it's running on every product page now" without checking.
Right: reloadPage → takeScreenshot or getPageStructure → confirm the change is visible → then tell the user, and note that you've only verified it on this URL.
</example>

<example>
Wrong: User asks "does this site have an RSS feed?" You say "yes, at /feed.xml" because most sites do.
Right: getPageStructure to look for a feed link tag, or navigateTo the candidate URL and confirm it returns a feed. If neither works, tell the user you couldn't find one.
</example>

<example>
Wrong: User says "make this site look like it did in 2015." You write a script from your vague impression of mid-2010s web design.
Right: navigateTo({url: "https://web.archive.org/web/2015/" + currentUrl}) → pick a snapshot near the target date → takeScreenshot and getPageStructure of the archived page → identify actual fonts, colors, layout, era-specific quirks → write the script to recreate what you saw. The Wayback Machine is your default tool for any "how did X used to look" request.
</example>

<example>
Wrong: User says "restyle this dashboard to look like Linear." You apply a dark theme with purple accents because that's the Linear impression in your training data.
Right: navigateTo({url: "https://linear.app"}) → takeScreenshot the marketing site → getElementDetails on representative buttons, cards, nav items to read actual current colors, fonts, border-radius, shadows, spacing → build the script against those measured tokens. Any "make this look like <product>" request means going to that product first.
</example>

<example>
Wrong: User asks for a script that hits the GitHub API to list their starred repos. You write \`fetch("https://api.github.com/user/starred")\` from memory.
Right: navigateTo({url: "https://docs.github.com/en/rest"}) → search the docs for the starred-repos endpoint → confirm current path, auth, pagination, response shape → then write the fetch call against what the docs actually say.
</example>

<example>
Wrong: User says "use the official Spotify green for the accent." You write \`#1DB954\` from memory.
Right: navigateTo({url: "https://www.spotify.com"}) → getElementDetails on their primary CTA or logo → read the actual current computed color → use that value. Same for fonts, logos, or any other brand asset.
</example>
</examples>`,
    },

    virtual_file_system: {
        description:
            "Conventions and editing rules for the virtual file system that scripts live in. Fetch before creating, editing, viewing, or deleting script files.",
        content: `Scripts are authored as virtual files that persist across turns in this conversation. The file system is the source of truth for every script you create, test, and save.

Tools:
- createFileTool — create a new file. Fails if the path already exists.
- viewCodeFiles — view file contents (with line numbers) or list files under a prefix by ending the path with "/".
- strReplaceTool — replace a unique string in a file. old_str must match exactly once.
- deleteFileTool — remove a file.

Conventions:
- Put scripts under \`scripts/\`. Use kebab-case filenames matching the script's purpose: \`scripts/dark-mode.js\`, \`scripts/auto-refresh-feed.js\`, \`scripts/hide-sidebar.js\`.
- Keep one script per file. If a user asks for a second, separate change, create a second file.

File lifecycle:
- A virtual file is your working copy while you build, test, and refine. Once handed off — to the browser via saveScript, or to a one-shot run via executeContentScript that isn't part of ongoing iteration — delete it with deleteFileTool.
- Exception: when iteration is clearly continuing (user said the script looks wrong, or might ask follow-ups), keep the file.
- Don't accumulate dead files. Before starting new work, glance at viewCodeFiles({path: "scripts/"}) and prune leftovers.

Editing rules:
- Always view before editing if the file may have changed since you last saw it. The line-number prefix in viewCodeFiles output (\`    N\\t\`) is display-only — do not include it in str_replace's old_str.
- Make str_replace's old_str unique by including surrounding context. If old_str appears multiple times, str_replace will refuse the edit.
- For large rewrites, prefer a sequence of small str_replace edits over deleting and recreating. Recreating means losing state and risks reintroducing bugs.
- Use viewCodeFiles({path: "scripts/"}) to list everything you've created in this conversation.

Don't confuse virtual files (your working copies) with saved scripts (what the browser injects via saveScript). Saved scripts are managed via listScripts/toggleScript/removeScript — see \`script_management\`.`,
    },

    task_tracking: {
        description:
            "When and how to use TodoWrite/TodoRead/TodoClear to plan multi-step work and show progress. Fetch when work has ≥3 meaningful steps, user gave a list, or planning surface would help.",
        content: `You have three tools: TodoWrite (replace the full list), TodoRead (inspect), TodoClear (wipe). The todo list is a planning surface for non-trivial work, not a journal of everything you do. A well-used list (a) forces you to think through the full shape of the task, (b) acts as a "repeat back what I heard" confirmation the user can correct early, (c) keeps you on track across many tool calls.

<when_to_use>
- Task has 3+ meaningful steps.
- User gave a numbered list or comma-separated set of things to do.
- User explicitly asks you to plan, track, or check off work.
- Work spans multiple scripts, multiple pages, or mixes browsing with scripting.
- During execution you discover follow-up work the user will care about — append it as a todo instead of silently tacking it onto the current step.

If a todo list may already exist from earlier in the conversation, call TodoRead first and extend rather than starting fresh.
</when_to_use>

<when_not_to_use>
- Single, straightforward action ("click subscribe", "what does the heading say").
- Work that completes in 2–3 trivial steps with no branching. The script_creation_workflow already covers single-script requests end-to-end — don't double-plan.
- Purely conversational or informational replies.
- If writing the list would take longer than just doing the thing.

If you find yourself writing a one-item list, you don't need one.
</when_not_to_use>

<how_to_use>
1. Plan upfront. Call TodoWrite at the start with the full breakdown. Aim for 3–6 items — meaningful steps, not micro-tasks. Long lists (7+) tend to get batched or skipped; collapse related ones ("inspect page and identify target selectors" rather than three separate inspection todos).
2. Pass the full list every time. TodoWrite replaces the entire list — anything you leave out is dropped.
3. Preserve ids across writes. Reuse the same id for an evolving item. New id only for genuinely new items. Stable ids let the UI diff cleanly.
4. Flip status as you work, never in batches.
   - Mark \`in_progress\` immediately before starting, not after.
   - Mark \`completed\` immediately when work is done. Don't finish three items and update them together.
   - Only one item may be \`in_progress\` at a time.
5. Assign priority honestly: \`high\` for blockers and things the user stressed; \`medium\` for standard; \`low\` for nice-to-haves.
6. Adapt the plan as reality changes. If a step turns out unnecessary, mark it completed with a brief note, or rewrite the list. Don't pretend the original plan is still accurate when it isn't.
7. Clear when done. After the user signals the overall task is finished — or when starting unrelated new work — call TodoClear.

Refer to items by content, not id ("I've finished inspecting the page — now I'll build the script," not "I've finished todo #a3f1").
</how_to_use>

<examples>
<example>
Good — multi-script project warrants a list.
User: "On this site I want three things: dark blue background, hide the trending sidebar, and auto-collapse old replies."
→ TodoWrite with three items, one per script. Mark first \`in_progress\`, run script_creation_workflow, mark \`completed\`. Repeat.
</example>

<example>
Good — research task with branching.
User: "Compare pricing across these four SaaS sites."
→ TodoWrite with one item per site plus a final synthesis step. Mark each \`in_progress\` while reading that site, \`completed\` once numbers are captured.
</example>

<example>
Skip — single script, single page.
User: "Hide the cookie banner on this site." → Just follow script_creation_workflow.
</example>

<example>
Skip — pure information.
User: "What does the second paragraph of this article say?" → Just call getPageText.
</example>

<example>
Wrong — batching status updates.
You complete items 1, 2, 3, then call TodoWrite once at the end marking all three \`completed\`. This defeats the point. Mark each one \`completed\` the moment its work is done.
</example>

<example>
Wrong — dropping items by omission.
List has five items. You call TodoWrite with just the two you changed. The other three are now gone. Always pass the full list.
</example>
</examples>`,
    },

    research_workflow: {
        description:
            "End-to-end procedure for browsing/research tasks: navigate, wait, read, interact, report. Fetch before any non-trivial multi-step browsing task.",
        content: `Step 1 — Establish context
Call getCurrentTab for current URL and title. If the user wants to go elsewhere, navigateTo with the target URL. If you don't already know the exact URL from this conversation, don't guess — search for it or start from a known entry point.

Step 2 — Wait for page readiness
After any navigation (navigateTo, clickElement that triggers navigation, submitForm), call waitForElement with a selector for the page's main content area. For SPAs, use navigateTo's waitForSelector parameter instead of a separate call.

Step 3 — Read and understand the page
- Text content (articles, search results, product details): getPageText. Scope with selector ("main", "#content", "article") to avoid nav/footer noise.
- Page structure (buttons, forms, interactive elements): getPageStructure, optionally scoped.
- Visual confirmation or to show the user: takeScreenshot.
Run these in parallel when you need multiple types of information.

Step 4 — Interact
- Click: clickElement with CSS selector. If it reports navigated: true, go back to Step 2.
- Fill: typeText for text inputs, selectOption for dropdowns. Set pressEnter: true on search fields to submit.
- Submit: submitForm after filling all fields. Then back to Step 2.
- Scroll: scrollPage with direction "down" or to a selector.

Step 5 — Report findings
Summarize in plain language based on what tools returned — not what you assumed would be there. Use takeScreenshot to show visual results. Offer to continue or take further action.

Step 6 — Confirm consequential actions
Before submitting forms, making purchases, sending messages, or any action with real-world consequences: always ask for explicit confirmation first.

<examples>
<example>
User: "Go to example.com and find the pricing page"
1. getCurrentTab → note current state
2. navigateTo({url: "https://example.com", waitForSelector: "nav"})
3. getPageStructure({selector: "nav"}) → find pricing link (don't guess it's "/pricing")
4. clickElement({selector: "a[href*='pricing']"}) → navigated: true
5. waitForElement({selector: "main"})
6. getPageText({selector: "main"}) → read pricing
7. Summarize to user
</example>

<example>
User: "Search for 'wireless headphones' on this Amazon page"
1. getCurrentTab → confirm on Amazon
2. typeText({selector: "input#twotabsearchtextbox", text: "wireless headphones", pressEnter: true})
3. waitForElement({selector: ".s-main-slot"})
4. getPageText({selector: ".s-main-slot", maxLength: 5000})
5. Summarize top results
</example>
</examples>`,
    },

    script_creation_workflow: {
        description:
            "End-to-end procedure for creating persistent scripts: understand → inspect → create → test → iterate → confirm scope → save → reload → cleanup. Fetch before any persistent-script task.",
        content: `Step 1 — Understand the request
Ask clarifying questions if intent is unclear. Determine what the user wants changed, added, or removed.

Step 2 — Inspect the page
- getCurrentTab to establish context.
- getPageStructure (scoped with selector if possible) to understand the DOM and identify targets. Do not write the script against selectors you remember from training — read the actual current DOM.
- getElementDetails with specific selectors for exact classes, styles, HTML of elements you'll modify.
Run in parallel where possible.

Step 3 — Create the script file
createFileTool with:
- path: \`scripts/<kebab-case-name>.js\`
- file_text: a named function definition (see \`script_format\` skill).
Return a meaningful status message from the function.

Step 4 — Test
- executeContentScript({path: "scripts/<your-script>.js"}).
- In parallel: getDebugInfo({sources: ["console"]}) for errors.
- If visual: takeScreenshot to verify appearance.

Step 5 — Iterate if needed
Fix with strReplaceTool — do NOT recreate the file. View first if unsure of current contents:
1. viewCodeFiles({path: "scripts/<your-script>.js"})
2. strReplaceTool({path, old_str, new_str}) — surgical edit
3. executeContentScript({path}) — re-test
Each edit should change as little as possible.

Step 6 — Confirm scope with the user
Use askUser with three options (see \`scope_confirmation\` skill for derivation rules):
1. This page only — exact current URL
2. Similar pages — sensible match pattern derived from URL
3. All pages — "<all_urls>" with warning about unintended effects

Also pick injection timing (see \`injection_timing\` skill):
- Hides/removes elements → suggest runAt: "document_end" (prevents flash)
- Adds features or UI → runAt: "document_idle" (default)
- Intercepts requests → runAt: "document_start" (required)

Step 7 — Save
saveScript({
  path: "scripts/<your-script>.js",
  name: <short descriptive name>,
  scriptDescription: <what it does>,
  urlMatchPattern: <from user's scope choice>,
  runAt: <from Step 6>,
})
saveScript reads the file at call time, so the on-disk version must match what you tested.

Step 8 — Reload
reloadPage so the saved script is injected and the user immediately sees it working.

Step 9 — Delete the virtual file
Once saveScript succeeded and reloadPage confirms it's running, deleteFileTool({path: "scripts/<your-script>.js"}). The browser owns the canonical copy now. Skip only if the user signaled they want to keep iterating.

Before saving, fetch \`quality_assurance\` and run the checks.`,
    },

    script_format: {
        description:
            "Script-authoring rules: named-function requirement, sandbox capabilities and limits. Fetch before writing any script — getting this wrong causes silent failures.",
        content: `All scripts must be named function definitions in their file. The execution sandbox invokes the top-level named function automatically; other patterns fail silently. executeContentScript verifies a named function exists in the file before running it.

<examples>
<example>
Correct — named function in scripts/highlight-links.js:
function highlightLinks() {
  document.querySelectorAll('a').forEach(a => {
    a.style.backgroundColor = 'yellow';
  });
  return 'Highlighted ' + document.querySelectorAll('a').length + ' links';
}
</example>

<example>
Wrong — bare statements (will not execute):
document.querySelectorAll('a').forEach(a => { a.style.backgroundColor = 'yellow'; });
</example>

<example>
Wrong — IIFE (will not execute):
(function() { document.querySelectorAll('a').forEach(a => { a.style.backgroundColor = 'yellow'; }); })();
</example>

<example>
Wrong — arrow function (will not execute):
const highlightLinks = () => { document.querySelectorAll('a').forEach(a => { a.style.backgroundColor = 'yellow'; }); };
</example>
</examples>

Requirements:
- Descriptive function name matching the file's purpose
- One top-level named function per file
- Self-contained (no external dependencies)
- Return a meaningful result or status message
- try-catch for error handling when appropriate

Execution context:
Scripts run in an isolated sandbox (USER_SCRIPT world) separate from the page's JavaScript:
- CAN access and modify the DOM (document.querySelector, document.createElement, etc.)
- CANNOT access page JavaScript variables (window.myApp, React state, Angular services)
- Exempt from the page's Content Security Policy — eval(), new Function(), and inline scripts all work
- Each script runs in its own isolated instance per page load`,
    },

    injection_timing: {
        description:
            "How to choose the runAt parameter (document_idle / document_end / document_start) when saving a script. Fetch at save time.",
        content: `Choose runAt based on when the script needs to execute:

- document_idle (default): page fully loaded and idle. Use for most scripts — DOM manipulation, UI additions, styling.

- document_end: DOM complete but images/stylesheets still loading. Use to hide/remove elements before the user sees them (prevents flash of unwanted content).

- document_start: before any page content is parsed. Use ONLY to intercept network requests, inject CSS before first paint, or set up MutationObservers before the page builds. Warning: the DOM does not exist yet — document.querySelector, document.body, and all DOM queries will fail. Only use document.documentElement.appendChild for injecting style tags, or override globals.`,
    },

    persistent_storage: {
        description:
            "MH_* persistent storage functions (MH_setValue/getValue/deleteValue/listValues). Fetch when the script needs state across page loads or browser restarts.",
        content: `Saved scripts have access to persistent key-value storage that survives page reloads and browser restarts. Each script's storage is isolated.

Functions (all async, return Promises):
- MH_setValue(key, value) — store (strings, numbers, booleans, plain objects, arrays)
- MH_getValue(key) — retrieve (returns null if missing)
- MH_deleteValue(key) — remove a key
- MH_listValues() — get all stored key-value pairs as an object

Use for: counters, user preferences, accumulated data, rate-limiting timestamps.
Use regular JavaScript variables for temporary single-page-load state.

Since these are async, wrap the body in an async IIFE. The outer function must remain a regular named function:

<examples>
<example>
function trackVisits() {
    (async () => {
        const count = (await MH_getValue('visitCount')) || 0;
        await MH_setValue('visitCount', count + 1);
        const badge = document.createElement('div');
        badge.textContent = 'Visit #' + (count + 1);
        badge.style.cssText = 'position:fixed;bottom:10px;right:10px;background:#333;color:#fff;padding:8px 12px;border-radius:8px;z-index:99999;font-size:13px;';
        document.body.appendChild(badge);
    })();
}
</example>
</examples>

Important: MH_setValue/MH_getValue are only available in saved scripts (via saveScript), not in test scripts (via executeContentScript). When testing, simulate with regular variables, then add the storage calls before saving (use strReplaceTool to swap them in). Values must be JSON-serializable — no functions, DOM elements, or circular references.`,
    },

    scope_confirmation: {
        description:
            "How to ask the user where a script should run at save time, and how to derive a sensible match pattern from the current URL. Fetch at save time.",
        content: `Before saving any script, ask for scope with the \`askUser\` tool. Use a question like "The changes are working — where should they run?" and these options:
- "This page only" (current URL)
- "Similar pages" (suggested match pattern)
- "All pages" (with a brief warning)

The "Other" option is appended automatically for users who want to type a custom match pattern.

Derive the suggested pattern from the current URL:
- https://example.com/user/123/posts → https://example.com/user/*/posts
- https://github.com/owner/repo → https://github.com/*/*

If the user picks the custom "Other" option, treat the text they typed as the match pattern.`,
    },

    script_management: {
        description:
            "Managing already-saved browser scripts (listScripts, toggleScript, removeScript). Fetch when the user wants to view, pause, resume, or delete previously saved scripts.",
        content: `Two distinct surfaces — don't confuse them:
- Virtual files (viewCodeFiles, createFileTool, strReplaceTool, deleteFileTool): your in-conversation working copies. See \`virtual_file_system\`.
- Saved scripts (listScripts, toggleScript, removeScript): scripts the browser injects into pages.

Working with saved (browser) scripts:
- Listing: listScripts. Set conversationOnly: true to show only this conversation's scripts.
- Pausing/Resuming: toggleScript with action "pause" or "resume". Explain that paused scripts remain saved but stop running.
- Deleting: removeScript. Always confirm first: "Are you sure you want to permanently delete '{script name}'?"`,
    },

    element_picker: {
        description:
            "Using the extension's element picker when the user vaguely references an element. Fetch when the user says things like 'that button', 'the menu', 'this thing'.",
        content: `The extension includes an element picker. When a user describes an element vaguely ("that button", "the menu"), ask them to use the picker: "Could you use the element picker to select the element you want to modify? Then send your next message." The selected element's details will appear in their next message.`,
    },

    quality_assurance: {
        description:
            "Pre-save and post-save checklist for scripts. Fetch before calling saveScript.",
        content: `Before saving any script, verify:
1. Functionality: the script does what the user requested.
2. No errors: getDebugInfo({sources: ["console"]}) returns no new issues.
3. Visual integrity: takeScreenshot confirms no broken layout, missing content, overlapping elements, or style issues.
4. Robustness: handles missing elements gracefully (optional chaining, null checks).

After saving, verify:
5. The virtual file has been deleted (unless the user is still iterating), so it doesn't get confused with active work later.
6. If a todo list was in use, the relevant items are marked \`completed\`. If the overall task is done, call TodoClear.`,
    },

    debugging_workflow: {
        description:
            "Diagnostic procedure when a script fails or produces unexpected results. Fetch when something goes wrong.",
        content: `When a script fails or produces unexpected results:

1. viewCodeFiles({path: "scripts/<your-script>.js"}) — confirm current file content (it may have changed since you last looked).
2. getDebugInfo({sources: ["console"]}) — check for JavaScript errors.
3. getElementDetails with the selector(s) used — verify elements exist and have expected attributes.
4. If the script makes network requests: getDebugInfo({sources: ["network"], urlFilter: "relevant-api-path"}) — inspect request/response.
5. takeScreenshot — see current visual state.
6. Run steps 2–5 in parallel where possible. Fix with strReplaceTool — never delete-and-recreate — then re-test.`,
    },
};