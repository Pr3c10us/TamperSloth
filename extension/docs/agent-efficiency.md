# Agent efficiency

The agent starts with the core tools and enables browsing, scripting,
debugging, and visual groups as needed. A local keyword hint can
enable relevant groups up front; it is not a model call or a capability restriction.
Acting is the default, so any request that does not read as a question, a
walkthrough or a saved change starts with the browsing and input groups: enabling
them later cost a whole model step and reset the prompt cache.
The agent can always request another group with `enableTools`. Groups stay enabled
for the rest of the run to limit changes to provider cache prefixes.

Claude signs thinking against the tools and preceding history. When a run enables
another tool group or first archives an older result, request preparation removes
all earlier signed and redacted thinking from outgoing Claude messages. Those
blocks stay removed on later steps, while newly generated thinking is retained
until the next change. Text, tool calls, results, and approvals remain in place;
thinking shown in the UI is unchanged. This uses the documented block-removal
option without the thinking-binding beta header. Dropping earlier thinking can
make Claude spend more tokens reasoning again. Other providers keep their reasoning.
See [Anthropic's preserved-thinking rules](https://platform.claude.com/docs/en/build-with-claude/preserved-thinking).

Each live tab context snapshot stays in the run transcript immediately before
the response it informed. Later steps append fresh metadata while replaying
earlier snapshots unchanged, preserving the history bound to Claude's thinking.

OpenAI requests use `store: false` and explicitly include encrypted reasoning.
The SDK replays complete reasoning and function-call items, avoiding reliance
on stored item references (including accounts where storage is disabled).
See [OpenAI's reasoning guide](https://developers.openai.com/api/docs/guides/reasoning).

Gemini's reasoning parts and tool-call signatures remain on their original
parts through tool expansion and compaction; parallel calls remain grouped
ahead of their results. These signatures must not use Claude's removal policy.
See [Google's thought-signature rules](https://ai.google.dev/gemini-api/docs/generate-content/thought-signatures).

DeepSeek thinking/tool requests preserve the reasoning content returned by the
model. The transport supplies an empty `reasoning_content` field only when it
is absent on historical text or empty-thinking assistant turns. This also
covers the `deepseek-flash` alias, which the installed SDK does not recognize
as a V4 ID. Disabled thinking, requests without tools, and legacy R1 are unchanged.
See [DeepSeek's thinking-mode guide](https://api-docs.deepseek.com/guides/thinking_mode/).

## Output and context handling

- Page text defaults to 3,000 characters in concise mode and 10,000 in detailed
  mode. `nextOffset` supports further reads. DOM inspection defaults to 250 nodes,
  and file reads to 120 lines. Both support explicit expansion.
- Tool text sent to the model is bounded to 6,000 serialized characters. Large
  results retain error/status/identifier fields and an archive reference. Full
  tool results remain in the conversation. `readToolResult` retrieves exact
  character windows, original inputs, or screenshot images across turns.
- At 48,000 message characters, older large results become short receipts,
  and older file writes (600+ characters of code) keep their path but replace
  the code with a note: the file holds it, where a view or search reads it fresh.
  The latest three tool messages, loaded guidance, user answers, other tool
  inputs, call/result IDs, and reasoning/signature metadata are preserved.
  Gemini's signed call parts are never changed; for Claude a changed write
  counts as a history change, so earlier thinking is removed as described above. This is a
  compaction trigger, not a hard context limit: large user inputs and reasoning
  can still exceed it. Compaction is sticky within the run.
- Recent observations, saved-script references, and user decisions are retained
  as compact task state for follow-up turns. Historical page data is explicitly
  labeled; it must not be mistaken for a fresh observation.
- Standard screenshots are resized to at most 1,280 pixels wide. `detail: "full"`
  preserves the original resolution. Images remain image content, not base64 text.
- Selected elements are summarized using attributes, text, and child tags rather
  than inserting entire HTML subtrees into the model request.

## Fewer round trips

Current-tab metadata is supplied at run start. `navigateTo` supports readiness
waiting and a scoped text read in one call. `strReplaceTool.edits` applies ordered
replacements atomically, leaving the file unchanged if any match fails. Script
IDs and URL patterns remain available in concise listings. Routine tool labels
replace repeated narration, and specialized instructions are loaded on demand.

The page-text schema default and console `.slice(-0)` cap bugs are fixed. Virtual
file listings now return paths that the read/edit tools can consume directly.

## Writing and editing code

Scripts are written in chat working files and saved as browser scripts. The
tools aim to keep code out of the model's context unless it needs it, and to
need fewer steps:

- File views, searches, line edits and `openScript` reach the model as plain
  text: a header line, then `12<TAB>code` lines. Inside JSON every quote, tab
  and newline of the code was escaped and line numbers were padded. A 5,000-character view
  now shows about 15% more lines (69 instead of 60 in the replay below).
- A failed `strReplaceTool` says where to look. Text that wasn't found returns
  the lines holding its first line, ignoring spacing. Text found several times
  returns their line numbers. `replace_all` (or `all` per edit) does a rename
  in one call.
- `openScript` takes `query`, so opening a script from another chat and
  finding the code to change is one call.
- `executeContentScript` returns the browser's error instead of `null`. For a
  syntax error it adds the line, counted in the file rather than the
  wrapper, and the code around it, ready for `replaceLines`.
- `saveScript` (and `toggleScript`, `removeScript`) returns once the
  background has registered what storage holds. Before this, a reload right
  after a save could beat the registration and load the page without the new
  version. `reload: true` then reloads the tab in the same call.

A saved script links to one working file: `sourcePath` in the chat
`sourceConversationId` (the chat it was made in when absent). `sourceBase`
fingerprints the code the two last shared, so `workingFile.ts` can tell which
side moved:

- At the start of each run, this chat's linked files are synced: a file left
  behind by a save made elsewhere (a hand edit, an update, another chat) is
  refreshed. The run's notes give each such script its path, plus `unsaved` or
  `diverged`, so editing one needs no `openScript`. A file deleted in
  Settings → Code stays deleted. Its script is listed without a path, and
  `openScript` restores the file from the saved code.
- A file with edits of its own is never overwritten. If the saved script also
  changed, `saveScript` refuses to undo that change unless told `overwrite`,
  and `openScript` explains the choice. A file that is merely behind is refused
  too, since saving it would revert the newer code.
- Opening a script from another chat links it to this chat's file. Hand edits
  and userscript updates keep the link and the shared fingerprint.

## Faster actions

Most of a run's time is model steps, so actions carry what the next step needs:

- For page work, the run-start metadata lists the on-screen controls as refs
  (`c12`), from the same overlay as `listControls`. The list skips the model when
  it trips the prompt-injection scan; `listControls` then fetches it screened.
- `clickElement`, `typeText`, `selectOption`, `submitForm`, `fillForm` and
  `clickTarget` take a `ref`. Refs resolve in the overlay to a selector that
  matches only that element; the safety gate inspects the same element.
- Actions return `changes`: newly shown controls with refs (an opened menu or
  dialog), new dialogs, changed status or alert text, invalid fields, moved focus
  and URL or title changes, measured against the page just before the action. After
  a full navigation, or after `navigateTo` without `readText`, the new page's
  controls come back instead.
- `fillForm` fills text fields, selects, checkboxes and radios in one call and can
  submit. Each field is screened as typing into it, and the submit as clicking
  that control or submitting a sensitive form.

Waits follow the page rather than fixed timers:

- Clicks and trusted input return once the page has changed and then been quiet
  for 150 ms. When nothing changes they still wait the old maximum
  (`waitAfter`/`feedbackMs`, 500 ms). `clickElement` no longer smooth-scrolls
  and then sleeps 200 ms.
- `submitForm` (and Enter in `typeText`, and `fillForm`'s submit) waits for a
  navigation only if the tab starts loading within 400 ms. A submit handled by
  script waits for the page to settle instead of the full 5 s timeout.
- `navigateTo` defaults to `domcontentloaded`: the new document is parsed and its
  DOM has been quiet briefly. `load` still waits for every resource when asked.
  A fragment-only change returns at once.
- A rate-limited request waits as long as the provider's retry hint says (at
  least 1 s); the minute-long wait applies only when there is no hint.

Overhead inside each action:

- The ~90 KB page overlay is injected once per page and extension build. Cursor
  announcements, cues and input locks then call the installed copy, and its
  session-storage flag is written once per tab.
- Role and name targets query matching accessibility nodes instead of the whole
  tree (substring names still read the whole tree). The hover recheck resolves
  the node already found.
- Marked screenshots resolve extra candidates (click listeners, closed shadow
  roots) in batches of 50 with one marking call per batch, within a 1.5 s budget.
- A screenshot of a page that keeps changing (a carousel, a ticker) returns its
  capture flagged `freshness.changing` instead of failing after three attempts.
  Races with a navigation still retry and fail rather than return a stale page.
- Run setup reads settings, the plan budget, the tab, the task and the controls
  concurrently. A task-only lookup replaces listing every open tab.

## Run settings and measurements

Settings → Preferences controls the maximum steps (default 200), aggregate token
budget (default 1,000,000; zero disables it), and DeepSeek reasoning effort.
Balanced requests `medium`, while Thorough requests `max`; the provider may map
effort levels internally. Other providers retain their existing settings.

The budget includes all reported input and output tokens across steps, including
cached input and reasoning output without counting those subcategories twice.
It is checked after each step, so a final step can exceed the budget. Missing
provider usage cannot be counted. Three failures of the same tool with the same
arguments stop the run; UI labels do not affect this comparison. Stopped work
can be continued in a subsequent message.

Assistant response summaries include elapsed wall time (for example, `2m 14s`),
including tool execution and time waiting for user answers. Timing starts when
the message is sent and finishes on completion, failure, or cancellation.
Responses also expose step counts, tool counts, input/output tokens, cache
reads, reasoning tokens, repeated calls, and compaction counts. Full per-step and
per-tool metrics are stored on the assistant message and logged as
`[Tampersloth] run metrics`. Character metrics are payload-size diagnostics;
image data characters do not measure image tokens.

## Reproducible checks

Run `npm test`, `npm run benchmark:context`, and `npm run build`.

The 38 tests cover output limits, pagination, escaping, file-edit atomicity,
archive recovery, preservation of decisions and valid signed reasoning, cancellation,
and the real AI SDK streaming loop using a mock model. Claude regressions also
inspect JSON requests serialized by the Anthropic SDK with a mocked transport,
including signed and redacted thinking after tool changes and history compaction.
The provider suite exercises every OpenAI, Gemini, and DeepSeek picker model
through the production model factory and real SDK serializers with mocked
transports. It checks tool expansion, parallel calls, actual compaction, approval
preservation, historical text turns, and empty DeepSeek reasoning. Streaming
checks cover all three providers, including OpenAI encrypted reasoning completed
after an initially partial item. Tests make no live provider requests and do not
control a real browser tab.

The script session replay runs the real file and script tools on in-memory
storage, through the runtime's projections and compaction, for a 298-line
script (20,099 characters). The calls are fixed, and a step the tools make
unnecessary is skipped:

| Run | Steps | Sent chars before | Sent chars after | History chars before → after |
| --- | ---: | ---: | ---: | ---: |
| Create, test, edit, save, verify | 16 → 15 | 1,304,266 | 1,212,998 (−7.0%) | 442,650 → 403,283 |
| Change a script from another chat | 9 → 8 | 509,451 | 450,135 (−11.6%) | 24,792 → 18,287 |

The new parameters and wording add 130 characters to the scripting tools and
guidance, which are counted in both runs. The replay never crosses the
48,000-character compaction trigger, so the write compaction above saves
nothing in it, and it does not count the steps a failed test run's error saves
over finding the cause another way.

The audit baseline is stored in `tests/fixtures/context-baseline.json`. These
measurements count locally serialized schema, prompt, and guidance characters,
not provider tokens. Initial tool/instruction sizes exclude user content and
small per-run tab metadata; the baseline does not include later skill fetches.

The tools have grown since the original 35,362-character baseline, so the table
compares the current build with the one before action tools loaded up front.

| Task | Initial tools | Before chars | After chars |
| --- | ---: | ---: | ---: |
| Read a page | 14 | 39,081 | 39,892 |
| Research several pages | 22 → 28 | 46,354 | 59,505 |
| Create a script | 24 | 48,074 | 48,885 |
| Debug a script | 27 | 51,271 | 52,082 |
| Modify a script | 24 | 48,074 | 48,885 |

Requests that act (research here, which browses and searches) now carry the
input group and `fillForm` from the first step: about 13,000 more characters,
cached after the first step, in exchange for not spending a step on `enableTools`.
Skill content is 5,889 characters (originally 23,516). The fixed 20-step
page-reading replay serializes 1,279,765 characters against 2,666,215 originally
(52.0%). This replay measures payload size; it does not establish equivalent
task success, actual token savings, pricing, or cache-hit rates.

For live evaluation, run the same tasks with the same model against controlled
pages, compare saved run metrics, and check the resulting behavior and sources.
The target remains 50% fewer total tokens on multi-step tasks without reducing
completion or verification quality. Live provider A/B runs have not been performed.
