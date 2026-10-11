# Agent efficiency

The agent now starts with nine core tools and enables browsing, scripting,
debugging, visual, and task-tracking groups as needed. A local keyword hint can
enable relevant groups up front; it is not a model call or a capability restriction.
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
- Todo cards retain their full UI data, but write acknowledgements sent to the
  model no longer echo both the old and new lists.
- At 48,000 message characters, older large results become short receipts.
  The latest three tool messages, loaded guidance, user answers, tool inputs,
  call/result IDs, and reasoning/signature metadata are preserved. This is a
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

## Run settings and measurements

Settings → Preferences controls the maximum steps (default 200), aggregate token
budget (default 250,000; zero disables it), and DeepSeek reasoning effort.
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

The audit baseline is stored in `tests/fixtures/context-baseline.json`. These
measurements count locally serialized schema, prompt, and guidance characters,
not provider tokens. Initial tool/instruction sizes exclude user content and
small per-run tab metadata; the baseline does not include later skill fetches.

| Task | Initial tools | Before chars | After chars | Reduction |
| --- | ---: | ---: | ---: | ---: |
| Read a page | 9 | 35,362 | 9,133 | 74.2% |
| Research several pages | 17 | 35,362 | 15,812 | 55.3% |
| Create a script | 19 | 35,362 | 17,390 | 50.8% |
| Debug a script | 22 | 35,362 | 20,348 | 42.5% |
| Modify a script | 19 | 35,362 | 17,390 | 50.8% |

Skill content fell from 23,516 to 6,227 characters. A fixed 20-step page-reading
replay reduced cumulative serialized context from 2,666,215 to 664,585 characters
(75.1%). This replay measures payload reduction; it does not establish equivalent
task success, actual token savings, pricing, or cache-hit rates.

For live evaluation, run the same tasks with the same model against controlled
pages, compare saved run metrics, and check the resulting behavior and sources.
The target remains 50% fewer total tokens on multi-step tasks without reducing
completion or verification quality. Live provider A/B runs have not been performed.
