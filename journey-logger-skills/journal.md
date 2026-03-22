# /journal -- Build-in-Public Journal Entry

Capture a moment from your build-in-public journey. Writes to local markdown journal and optionally to Neon DB.

## Path Resolution

Determine the journey-logger installation path in this order:
1. If `$JOURNEY_LOGGER_PATH` env var is set, use that
2. Otherwise, use the parent directory of this skill file (the skill pack lives inside the journey-logger repo)

Store the resolved path as `JL_PATH` for use in commands below.

Before running any command, verify the path exists:
```bash
test -f "$JL_PATH/lib/write-entry.js" || echo "ERROR: journey-logger not found at $JL_PATH"
```

If the path is invalid, tell the user to set `JOURNEY_LOGGER_PATH` in their `.env` or shell profile.

## Behavior

**If the user provided arguments (quick mode):**

Parse the arguments as the journal entry. Determine:
- `project`: current working directory basename (or extract from text if mentioned)
- `type`: classify from text -- look for keywords:
  - "shipped", "built", "added", "created" -> `feature`
  - "fixed", "resolved", "patched" -> `bugfix`
  - "refactored", "cleaned", "restructured" -> `refactor`
  - "stuck", "blocked", "can't", "issue" -> `blocker`
  - "learned", "realized", "insight", "figured out" -> `insight`
  - "milestone", "launched", "first", "shipped to prod" -> `milestone`
  - Default -> `feature`
- `summary`: the full argument text as-is
- `source`: `manual_journal`

Then construct and execute a Bash command (substituting actual values for JL_PATH, PROJECT_NAME, TYPE, and the summary):

```bash
node --input-type=module -e "
import { write } from '$JL_PATH/lib/write-entry.js';
const r = await write({
  project: 'PROJECT_NAME',
  type: 'TYPE',
  source: 'manual_journal',
  summary: 'THE_SUMMARY_TEXT',
  raw_input: 'THE_RAW_INPUT'
});
console.log('Score:', r.score, r.milestones.length ? 'Milestones: ' + r.milestones.join(', ') : '');
"
```

**IMPORTANT:** You (Claude) construct this command dynamically with the real values. Escape quotes in the summary properly. Do not ask the user to run it -- execute it yourself via Bash tool.

Print a one-line confirmation: "Logged: [project] [type] -- [first 60 chars of summary]"

**If no arguments (guided mode):**

Ask these questions ONE AT A TIME:
1. "What just happened?" -> captures the summary
2. "What did you learn or what was surprising? (press Enter to skip)" -> appends to summary if provided
3. "Is this a win, a blocker, or a lesson?" -> maps to type: win -> feature, blocker -> blocker, lesson -> insight

Then write the entry using the same approach above.

**IMPORTANT:**
- Do NOT ask for confirmation before writing. Just write it.
- Keep output minimal -- one line confirmation, nothing more.
- The project name comes from the current working directory basename.
- If the user is at a repo root that contains multiple projects, ask which project this is about.
