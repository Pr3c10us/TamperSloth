# AI SDK upgrade — 2026-10-11

Versions were resolved from npm's stable `latest` tags. The table shows the
previous package.json minimums and the newly locked versions.

| Package | Previous | Updated |
| --- | --- | --- |
| ai | 6.0.177 | 7.0.137 |
| @ai-sdk/openai | 3.0.47 | 4.0.91 |
| @ai-sdk/anthropic | 3.0.63 | 4.0.78 |
| @ai-sdk/google | 3.0.52 | 4.0.93 |
| @ai-sdk/deepseek | 2.0.35 | 3.0.63 |
| @ai-sdk/xai | 3.0.72 | 5.0.20 |
| zod | 4.3.6 | 4.6.6 |

The SDK and providers share `@ai-sdk/provider` 4.0.26 and
`@ai-sdk/provider-utils` 5.0.58. Node >=22.12.0 is declared for compatibility
with both the SDK and the existing Vite toolchain. The app already uses ESM.

## Implementation review

Reviewed the official [v7 migration guide](https://ai-sdk.dev/docs/migration-guides/migration-guide-7-0),
[streamText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text),
and [DeepSeek provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek).

- Adopted `isStepCount`, `onStepEnd`, `stream`, and `createGoogle`.
- Moved trusted system instructions to `instructions`, retaining Anthropic cache options.
- Rebuild step history from `initialMessages` and `responseMessages` to preserve
  the previous compaction behavior and avoid accumulating cache breakpoints.
- Replaced deprecated image content with canonical file content for attachments
  and screenshot tool results.
- Removed deprecated usage field fallbacks and untyped tool-error casts.
- Removed the DeepSeek fetch rewrite: its provider now recognizes the Flash
  alias and supplies missing assistant reasoning. Use canonical `high` effort
  instead of the compatibility-mapped `medium` value.

Retained custom result archiving, tool activation, and Claude reasoning cleanup:
they preserve full UI results, historical user decisions, and valid signed history.
OpenAI's non-stored encrypted reasoning replay remains necessary for these runs.
xAI is updated but remains unused by the provider picker.

## Validation and limits

- `npm test`: 46 passing tests, including actual SDK provider serialization with mocked HTTP.
- `npm run build`: TypeScript and extension build pass.
- `npm run benchmark:context`: passes; serialized-character benchmark only.
- `git diff --check`: passes.
- npm audit: no `ai` or `@ai-sdk/*` findings; 28 findings elsewhere in the tree
  (3 low, 4 moderate, 20 high, 1 critical).

Live provider accounts and browser interactions were not exercised. The build
still warns about a large application chunk (~2.23 MB minified). Existing
uncommitted work was preserved.
