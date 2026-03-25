---
name: journal
description: Use when logging a build-in-public journal entry — coding wins, blockers, insights, or milestones. Triggers on /journal, "log this", "journal entry", or "capture this moment".
---

# /journal — Build-in-Public Journal Entry

## Guard
Before executing, check if `~/.claude/journey/config.md` exists. If not, run `/journey-init` first.

## Path Resolution
`$JL_PATH`: `$JOURNEY_LOGGER_PATH` env var, or the parent directory of this skill file.

## Quick Mode (with arguments)

Classify the entry type from keywords:
- "shipped", "built", "added", "created" → `feature`
- "fixed", "resolved", "patched" → `bugfix`
- "refactored", "cleaned" → `refactor`
- "stuck", "blocked", "can't" → `blocker`
- "learned", "realized", "figured out" → `insight`
- "milestone", "launched", "first" → `milestone`
- Default → `feature`

Run via CLI:

```bash
node $JL_PATH/bin/journey.js log "$SUMMARY" --type TYPE --project PROJECT_NAME --json
```

Where:
- `PROJECT_NAME`: current working directory basename
- `TYPE`: classified from keywords above
- `$SUMMARY`: the user's text as-is (shell-escape quotes)

Print one line: `Logged: [project] [type] — [first 60 chars]`

## Guided Mode (no arguments)

Ask ONE question at a time:
1. "What just happened?"
2. "What did you learn or what was surprising? (Enter to skip)"
3. "Is this a win, a blocker, or a lesson?" → maps to type

Then run the same CLI command.

## Rules

- Do NOT ask for confirmation. Just write it.
- Keep output to one line.
- If at a multi-project root, ask which project.
