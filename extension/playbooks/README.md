# Playbooks

A playbook is a tested process for a task, such as designing in Figma or researching a topic. The model always sees every enabled playbook's name and description. When one fits the task, it calls `loadPlaybook` to fetch the full text before its first page action.

Playbooks ship inside the extension, so changing one needs a new build and store release.

## Adding a playbook

Create a folder named after the playbook's ID, with two files:

```text
playbooks/
  figma-design/
    config.json
    playbook.md
```

Nothing else needs registering. Run `npm test` to check it: the tests fail on anything invalid in this folder. A broken playbook that reaches a build is skipped and logged, and the rest keep working.

## config.json

```json
{
  "id": "figma-design",
  "name": "Design in Figma",
  "description": "Use when creating or editing designs on the Figma canvas, including when the request names Figma from another site.",
  "enabled": true,
  "tools": ["browser", "scripting"],
  "lastVerified": "2026-11-02"
}
```

| Field | Required | What it does |
|---|---|---|
| `id` | Yes | Kebab-case, and must match the folder name. |
| `name` | Yes | Short title, up to 80 characters. |
| `description` | Yes | Up to 300 characters. The model chooses from this alone, so say when to use the playbook. |
| `enabled` | No | Defaults to `true`. Set `false` to take it out of the index without deleting it. |
| `tools` | No | Tool groups to switch on when it loads, which saves the model an `enableTools` step. Only ever adds tools. |
| `lastVerified` | Yes | `YYYY-MM-DD`: the date you last confirmed the process still works. The model sees it when the playbook loads. |

Tool groups are `browsing`, `scripting`, `debugging`, `visual`, `browser`, `input`, `network`, `system` and `guidance`, as defined by `TOOL_GROUPS` in `src/chat/lib/toolRuntime.ts`.

## playbook.md

These four sections are required, and you can add others:

```markdown
## Start here
The exact first approach.

## Avoid
Known traps, and why they fail.

## Fallback
What failure looks like, and what to try next.

## Done check
How to verify the result.
```

The whole file goes to the model when the playbook loads, so write it as instructions to the model.
