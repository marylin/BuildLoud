# Journey Logger v2 — Architecture Redesign

## Problem

Journey Logger v1 runs as a Claude Code plugin but architecturally behaves as a standalone backend service. It manages its own Anthropic API key, Neon database, Resend email, and SEO engine integration — all from within Claude Code hooks. When the API key expired, the cascade (circuit breaker → retry queue overflow → cache corruption) made Claude Code unresponsive.

The fundamental mismatch: calling an external AI API from inside the AI tool that's already running.

## Design Principles

1. **Claude Code IS the AI** — no external API keys, ever. Use `"type": "agent"` and `"type": "prompt"` hooks for intelligence.
2. **Hooks are lightweight** — command hooks for data capture, agent hooks for processing. All async, all fail-safe.
3. **Markdown is the only storage** — no database, no retry queues, no dead-letter systems.
4. **Entries are post-ready at capture time** — 80-90% quality for social sharing, in the user's voice.
5. **The user builds, the tool documents** — automatic capture of notable moments, no manual invocation required.
6. **Explicit actions only** — no silent background network calls. If it leaves the filesystem, the user triggered it.
7. **Zero dependencies** — no npm packages, no external services for core functionality.

## Architecture Overview

```
HOOKS (automatic, user never invokes)
  PostToolUse "Bash(git commit*)"
    → command hook: accumulate commit to session JSONL
  PostToolUse "Bash(gh pr *)" / "Bash(git merge*)"
    → command hook: flag notable event in session JSONL
  Stop
    → agent hook (async): Claude reads session, scores,
      writes post-ready entries in user's voice

SKILLS (on-demand)
  /journey-init     → first-run onboarding
  /journal (or /j)  → manual entry
  /journal-review   → browse + curate captured entries
  /journal-publish  → final polish to 90% post-ready
  /journal-digest   → weekly narrative summary

CONFIG (set once, edit anytime)
  ~/.claude/journey/config.md   → global defaults
  .claude/journey.md            → per-repo overrides

STORAGE (all under ~/.claude/journey/)
  entries/YYYY/MM/YYYY-MM-DD.md → journal entries (only storage)
  weekly/YYYY-WNN.md            → digests
  sessions/{id}.jsonl           → in-flight session data
  lib/cache.json                → local state (in tool install dir)
```

## Hooks

### Hook 1: PostToolUse — Accumulate Commits

```json
{
  "matcher": "Bash(git commit*)",
  "hooks": [{
    "type": "command",
    "command": "bash $JL_PATH/scripts/journey-accumulate.sh",
    "timeout": 5000
  }]
}
```

- **Updated from v1.** Lightweight bash, appends one JSONL line per commit.
- v1 wrote to a single shared `~/.claude/journey-session.jsonl`. v2 writes to session-scoped files.
- Writes to `~/.claude/journey-sessions/{session-id}.jsonl`
- **Session ID source:** Claude Code passes hook input as JSON on stdin. The `session_id` field from that JSON is used. If unavailable, the script generates a date-based fallback ID (`YYYY-MM-DD-{PID}`) to ensure isolation without perfect per-session scoping.
- Extracts: timestamp, project (cwd basename), commit message, conventional commit type
- Skips: amends, dry-runs, echo-wrapped commands
- ~5ms execution, can't fail in a way that affects Claude Code

### Hook 2: PostToolUse — Notable Events

```json
{
  "matcher": "Bash(gh pr *)",
  "hooks": [{
    "type": "command",
    "command": "bash $JL_PATH/scripts/journey-notable.sh",
    "timeout": 5000
  }]
}
```

- **New in v2.** Captures PR creation, PR merges, branch merges.
- Appends to same session JSONL with event type marker:
  ```json
  {"ts":"...","type":"pr_merged","title":"...","branch":"...","project":"..."}
  ```
- Same lightweight bash pattern as accumulate hook.

### Hook 3: Stop — Process Session (Agent)

```json
{
  "hooks": [{
    "type": "agent",
    "prompt": "... (see below)",
    "timeout": 30000,
    "async": true
  }]
}
```

**Agent prompt (full template):**

```
You are the journey-logger agent. Your job is to process a coding session's
commits into a post-ready journal entry.

STEP 1: Read the session file.
  Run: cat ~/.claude/journey-sessions/{session-id}.jsonl
  If the file doesn't exist or is empty, stop — nothing to process.

STEP 2: Read the user's voice profile.
  Run: cat ~/.claude/journey/config.md
  If it doesn't exist, use a neutral professional tone.
  If a per-repo override exists at .claude/journey.md in the session's
  working directory, apply those overrides.

STEP 3: Process the session.
  Run: node {JL_PATH}/bin/journey.js process-session --file {session-file}
  This script handles: grouping by project, scoring (lib/score.js),
  cache updates (lib/cache.js), and returns structured JSON with
  scored entries. The agent does NOT reimplement scoring logic.

STEP 4: Write entries.
  For each entry returned by the process script:
  - If score >= 5: rewrite the commit summary in the user's voice.
    Focus on OUTCOMES and WHY, not technical details.
    Include the emotional arc if present (struggle → breakthrough).
    Write 2-3 sentences max.
  - If score < 5: use the raw commit summary as-is (one line).
  Append entries to {JL_PATH}/YYYY/MM/YYYY-MM-DD.md using the
  standard markdown format.

STEP 5: Clean up.
  Delete the processed session file.
```

Note: `{JL_PATH}` and `{session-id}` are injected into the prompt template
at hook registration time via the hooks.example.json configuration.
The `process-session` CLI command is new — it encapsulates the scoring
pipeline so the agent doesn't need to invoke Node modules directly.

**Failure handling:**
- `async: true` — never blocks session exit
- If agent fails, session file stays on disk
- Orphan recovery via `journey recover` CLI command
- Agent reads session-scoped file — no cross-session corruption

### Session File Isolation

Each session writes to its own file: `~/.claude/journey-sessions/{session-id}.jsonl`

- Sessions can't corrupt each other
- If finalize fails for session A, session B is unaffected
- Orphan recovery: any `.jsonl` file older than 1 hour is unprocessed
- Multiple concurrent Claude Code sessions work safely

## Onboarding: `/journey-init`

Triggered automatically the first time any journey skill runs and `~/.claude/journey/config.md` does not exist. Each skill includes a guard instruction: "Before executing, check if `~/.claude/journey/config.md` exists. If not, run `/journey-init` first." This is a single line in each skill's markdown, not duplicated logic. If the user runs `/journey-init` directly when config already exists, it shows current settings and offers to update them.

### Guided Questionnaire

```
Step 1: Scope
  "Where should I capture entries?"
  → Global (all repos) / This repo only / Both
  → Creates config in ~/.claude/journey/ or .claude/

Step 2: Voice
  "How do you write? Give me 2-3 examples of posts
   you've shared or would share about your work."
  → User provides examples or describes style
  → Claude extracts tone, sentence length, personality
  → Writes voice profile to config

Step 3: Notifications
  "When should I surface notable moments?"
  (a) Silent — capture everything, I'll review when I want
  (b) Nudge — tell me when something notable happens
  (c) Batch — collect and show me at end of day/week
  → Saves preference

  Implementation of notification modes:
  - Silent: default. Entries written to markdown, no interruption.
  - Nudge: SessionStart hook checks for unreviewed high-scoring entries
    from previous sessions. If found, Claude mentions them briefly:
    "You had 2 notable moments yesterday — run /journal-review when ready."
  - Batch: Same as nudge but only triggers once per day (tracks last
    notification timestamp in cache).

Step 4: Platforms
  "What platforms do you share on?"
  → Twitter / LinkedIn / Blog / Multiple
  → Affects default output length and formatting
```

Set once. Never asked again. User edits the config file directly for changes.

## Configuration

### Global: `~/.claude/journey/config.md`

```markdown
# Journey Logger Configuration

## Voice
Sarcastic, honest, first-person. Short sentences.
No corporate speak. No emojis unless ironic.

## Examples
- "Fifteen hours later I have a full orchestration platform."
- "The finance aesthetic we should have had from day one."

## What I never say
- "Excited to announce"
- "Thrilled to share"

## Preferences
- notification: silent
- platforms: twitter, linkedin
- score_threshold: 5
```

Default journal path is `~/.claude/journey/` — all data lives here:

```
~/.claude/journey/
├── config.md                    # this file
├── entries/
│   └── YYYY/MM/YYYY-MM-DD.md   # journal entries
├── weekly/
│   └── YYYY-WNN.md             # digests
└── sessions/
    └── {session-id}.jsonl       # in-flight session data
```

No `journal_path` config key needed unless the user wants to override the default. The tool auto-discovers `~/.claude/journey/` on all platforms.

### Per-repo override: `.claude/journey.md`

```markdown
# Journey Logger — Project Override

## Voice adjustment
More technical for this repo. Audience is developers.

## Preferences
- notification: nudge
```

Claude reads global first, applies per-repo overrides. Markdown is natural for Claude to parse — no schema validation needed.

## Skills

### `/journal` (and `/j` alias)

Manual entry creation. Two modes:

**Quick mode** (with arguments):
```
/j shipped the auth flow
```
Classifies type from keywords, writes entry in user's voice via CLI:
```bash
node $JL_PATH/bin/journey.js log "$SUMMARY" --type TYPE --project PROJECT --json
```

**Guided mode** (no arguments):
```
/j
→ "What just happened?"
→ "What did you learn? (Enter to skip)"
→ "Win, blocker, or lesson?"
→ Writes entry
```

### `/journal-review` (NEW)

Browse and curate captured entries. The curation layer for high-volume builders.

```
/journal-review

Shows entries grouped by score tier:

READY TO SHARE (score 7+)
  ⭐ 9 | camvia | Mar 24 — "Rebuilt the entire design system..."
  ⭐ 8 | whateverai | Mar 23 — "Shipped JWT auth in one session..."

SOLID WORK (score 5-6)
  [entries...]

JOURNAL ONLY (score < 5)
  [brief list]

User actions:
  "publish 1, 3"    → sends to /journal-publish
  "delete 5, 6, 7"  → removes low-value clutter
  "merge 2 and 4"   → combines related entries
  "boost 3"         → rewrites with more energy

Backlog warning:
  "47 unreviewed entries. Bulk-clean entries below score 3?"
```

### `/journal-publish`

Final polish to 90% post-ready. Rewrites selected entries for target platforms.

```
/journal-publish [entry numbers or "all ready"]

For each selected entry:
1. Read voice config
2. Rewrite for target platform(s):
   - Twitter: hook + punch line, < 280 chars
   - LinkedIn: 3-4 sentences, insight-driven
   - Blog: full narrative with context
3. Output copy-paste blocks:
   --- twitter ---
   [text]
   --- end ---
4. User can tweak conversationally:
   "make it punchier" / "add the Claude angle"
```

Does NOT post anywhere. Output only.

### `/journal-digest`

Weekly narrative summary. Reads markdown files, Claude writes the digest.

```
/journal-digest [--week YYYY-WNN] [--days N]

1. Read all entries in date range from YYYY/MM/ markdown files
2. Write digest:
   - Week summary (2-3 sentences)
   - Top moments (3-5 highest-scoring)
   - Projects touched with session counts
   - Streak report
3. Save to $JL_PATH/weekly/YYYY-WNN.md
```

No DB query. No API. Claude reads files and writes.

## CLI

Five commands. All local. All instant. All offline-capable.

```
journey log             → write a manual entry (used by /journal skill)
journey status          → entries this week, streaks, backlog size, hook health
journey search          → grep markdown files for text
journey doctor          → validate hooks, config, paths, no orphans
journey recover         → process orphaned session files
journey process-session → scoring pipeline for Stop agent hook (internal)
```

### `journey log`

Used by `/journal` skill. Writes entry to markdown via scoring pipeline.

```
journey log "summary" --type TYPE --project PROJECT [--json]

Pipeline: dedup → score → cache update → markdown write
No network. No API. Instant.
```

### `journey process-session`

Internal command used by the Stop agent hook. Not user-facing.

```
journey process-session --file PATH

1. Parse JSONL session file
2. Group commits by project
3. Score each group (lib/score.js)
4. Update cache (lib/cache.js)
5. Output structured JSON for agent to consume:
   [{project, type, score, milestones, commits, raw_summary}, ...]

Does NOT write markdown — the agent handles that
(to apply voice profile and humanization).
```

## Scoring (Unchanged from v1)

Deterministic, pure computation. No external calls.

| Signal | Points |
|--------|--------|
| Type: milestone | +4 |
| Type: insight/blocker | +3 |
| Type: feature | +2 |
| Type: bugfix/refactor/infra | +1 |
| Type: exploration/planning | +0 |
| Source: manual_journal | +3 |
| Notable/milestone detected | +2 |
| New project | +2 |
| Insight phrases in summary | +1 |
| Hot project (3+ sessions/week) | +1 |

Max: 10. Threshold for humanization: 5+. Threshold for "ready to share": 7+.

Milestone detection: new_project, persistence (3+ consecutive days), breakthrough (fix after blocker), volume thresholds (10, 25, 50, 100, 250, 500, 1000), shipped (PR merged on active project).

## Build-in-Public Content Categories

Based on research, the Stop hook agent should detect these patterns beyond simple commit types:

| Category | Signal | Why it matters |
|----------|--------|---------------|
| Shipping & speed | "Built X in Y hours with AI" | Highest engagement category |
| Breakthroughs | Failed attempts → success pattern | Emotional arc, relatable |
| Before/after | UI redesigns, architecture changes, refactors | Visual contrast, shareable |
| AI workflow | What Claude Code did well vs what needed manual work | Trending category 2025-2026 |
| Decisions & tradeoffs | Architecture choices, stack decisions | Underrepresented, high value |
| Failures & postmortems | Broke something, hard bugs | Vulnerability builds trust |
| New projects | First commit on something new | Origin stories drive follows |
| Persistence streaks | 5+ consecutive days on a project | Shows commitment |

The scoring system and Stop hook agent prompt should weight these patterns when evaluating entries.

## What Gets Deleted from v1

| Component | Lines | Replaced by |
|-----------|-------|-------------|
| `lib/api.js` | ~120 | Claude agent hooks (native intelligence) |
| `lib/humanize.js` | ~80 | `/journal-publish` skill |
| `lib/db.js` | ~250 | Markdown storage (no DB) |
| `lib/seo-feed.js` | ~60 | User decides where content goes |
| `lib/env.js` | ~40 | No API keys to load |
| `lib/validate.js` | ~50 | Simplified doctor command |
| `lib/cli/top.js` | ~40 | `/journal-review` skill |
| `lib/cli/sync.js` | ~120 | No DB to sync |
| `lib/cli/rehumanize.js` | ~80 | `/journal-publish` skill |
| `lib/cli/digest.js` | ~30 | `/journal-digest` skill |
| `scripts/generate-digest.js` | ~150 | `/journal-digest` skill |
| `lib/write-entry.js` | ~90 | Pipeline replaced by `process-session` + agent hook |
| `scripts/journey-capture.js` | ~145 | Stop agent hook |
| `scripts/generate-digest.js` | ~150 | `/journal-digest` skill |
| `scripts/sync-pr-entries.js` | ~80 | No DB to sync PR entries to |
| `scripts/migrate.js` | ~60 | No DB migrations |
| `migrations/` | ~50 | No DB |
| `pending-sync.jsonl` system | — | Nothing to retry |
| `lib/config.json` | — | No tenant routing |
| `.env` | — | No keys |

**~1,400+ lines deleted.** Replaced by ~200 lines of hook scripts + skill markdown files.

## What Stays from v1

Components marked "rewrite" keep their purpose but need significant changes to remove deleted dependencies.

| Component | Status | Notes |
|-----------|--------|-------|
| `scripts/journey-accumulate.sh` | **Rewrite** | Update to write session-scoped files with session ID |
| `lib/score.js` | **Keep as-is** | Pure computation, no external deps |
| `lib/cache.js` | **Keep as-is** | Local state, no external deps. Note: file-based lock has TOCTOU risk under concurrent agent hooks — acceptable for journal data, document as known limitation |
| `lib/markdown.js` | **Keep as-is** | Append-only markdown writer |
| `lib/errors.js` | **Keep as-is** | Error logging, local only |
| `bin/journey.js` | **Rewrite** | Remove `env.js` and `validate.js` imports. Register 5 commands: `log`, `status`, `search`, `doctor`, `recover`. Add new `process-session` command for agent hook. |
| `lib/cli/log.js` | **Rewrite** | Remove `write-entry.js` import. Call `score.js`, `cache.js`, `markdown.js` directly. |
| `lib/cli/status.js` | **Rewrite** | Remove DB ping and queue stats. Report from cache + markdown + session dir only. |
| `lib/cli/search.js` | **Simplify** | Remove `--db` flag and Neon query path. Keep local grep. |
| `lib/cli/doctor.js` | **Rewrite** | Remove DB/API key validation. Check: hooks configured, config.md exists, paths valid, no orphans. |

## New Files

| File | Purpose |
|------|---------|
| `scripts/journey-notable.sh` | PostToolUse hook for PR/merge events |
| `lib/cli/recover.js` | Orphan session file recovery |
| `lib/cli/process-session.js` | Scoring pipeline for agent hook (replaces write-entry.js) |
| `journey-logger-skills/journey-init.md` | Onboarding skill |
| `journey-logger-skills/journal-review.md` | Curation skill |
| `journey-logger-skills/journal-digest.md` | Digest skill |
| `config.example.md` | Voice/preference template |
| `hooks.example.json` | Updated hook configuration |

## Final File Structure

```
build-log/
├── bin/journey.js              # CLI entry (6 commands: log, status, search,
│                               #   doctor, recover, process-session)
├── lib/
│   ├── score.js                # Deterministic scoring (keep as-is)
│   ├── cache.js                # Local state (keep as-is)
│   ├── markdown.js             # Storage layer (keep as-is)
│   ├── errors.js               # Error logging (keep as-is)
│   └── cli/
│       ├── log.js              # Manual entry (rewrite: remove write-entry dep)
│       ├── status.js           # Health report (rewrite: remove DB deps)
│       ├── search.js           # Grep markdown (simplify: remove --db)
│       ├── doctor.js           # Diagnostics (rewrite: remove DB/API checks)
│       ├── recover.js          # Orphan recovery (NEW)
│       └── process-session.js  # Scoring pipeline for agent hook (NEW)
├── scripts/
│   ├── journey-accumulate.sh   # PostToolUse hook (rewrite: session-scoped files)
│   └── journey-notable.sh     # PostToolUse hook for PRs/merges (NEW)
├── journey-logger-skills/
│   ├── journal.md              # /journal skill (update)
│   ├── j.md                    # /j alias (keep as-is)
│   ├── journal-review.md       # Curation skill (NEW)
│   ├── journal-publish.md      # Publishing skill (rewrite)
│   ├── journal-digest.md       # Digest skill (NEW)
│   ├── journey-init.md         # Onboarding skill (NEW)
│   └── README.md               # Plugin readme (rewrite)
├── hooks.example.json          # Hook config template (rewrite)
├── config.example.md           # Voice/preference template (NEW)
│                               # Journal data lives in ~/.claude/journey/
│                               #   entries/YYYY/MM/YYYY-MM-DD.md
│                               #   weekly/YYYY-WNN.md
│                               #   sessions/{id}.jsonl
├── package.json                # ZERO dependencies
├── CLAUDE.md
└── README.md
```

## Migration from v1

1. Existing markdown entries are preserved — they're the source of truth
2. Database can be kept as an external archive but is no longer read/written by the tool
3. Run `/journey-init` to set up voice profile and preferences
4. Update hooks in `~/.claude/settings.json` from `hooks.example.json`
5. Remove `.env` (no longer needed for core functionality)
6. Run `npm uninstall @neondatabase/serverless` to remove the only dependency

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Agent hook fails on Stop | Session file preserved, `journey recover` processes it |
| Agent hook times out (30s) | Async — never blocks. File stays for recovery. |
| Multiple concurrent sessions | Session-scoped files prevent cross-contamination |
| Orphaned session files accumulate | `journey doctor` warns, `journey recover` processes |
| Voice profile missing | Agent falls back to neutral professional tone |
| Markdown files grow over time | `/journal-review` has bulk-clean for low-value entries |
| User forgets to review | Configurable notification preference (silent/nudge/batch) |
| Cache lock contention under concurrent sessions | Existing spinlock allows proceed-without-lock after 3 retries. Acceptable for journal data — worst case is a slightly off entry count, not data loss. Document as known limitation. |
| Notification modes need a SessionStart hook | Add optional SessionStart prompt hook for nudge/batch modes — reads cache for unreviewed high-scoring entries, mentions them briefly. Only fires if notification != silent. |

## Known Limitations

1. **Cache concurrency:** `lib/cache.js` uses a file-based spinlock. Under concurrent agent hooks (multiple sessions ending simultaneously), two agents could read stale cache data. Worst case: an entry count is off by 1, or a duplicate fingerprint isn't caught. This is acceptable for journal data — no data is lost, just slightly inaccurate stats. A future improvement could use OS-level file locking.

2. **Session ID availability:** The session-scoped file design depends on extracting a session identifier from Claude Code's hook input JSON. If Claude Code doesn't provide a stable `session_id` field, the fallback is a `YYYY-MM-DD-{PID}` pattern, which provides date-level isolation but not perfect per-session scoping. This should be validated during implementation.

3. **Agent hook on Stop timing:** The Stop event fires when Claude finishes responding, not when the process exits. The agent hook spawns a subagent in the background. If Claude Code is terminated forcefully (killed, crash), the Stop hook may not fire. Session files are preserved for `journey recover` in this case.
