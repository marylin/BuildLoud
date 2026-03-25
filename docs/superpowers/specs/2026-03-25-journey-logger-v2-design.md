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

STORAGE
  YYYY/MM/YYYY-MM-DD.md         → journal entries (only storage)
  weekly/YYYY-WNN.md            → digests
  lib/cache.json                → local state (streaks, fingerprints)
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

- **Unchanged from v1.** Lightweight bash, appends one JSONL line per commit.
- Writes to `~/.claude/journey-sessions/{session-id}.jsonl`
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

Agent prompt instructs Claude to:

1. Read `~/.claude/journey-sessions/{session-id}.jsonl`
2. Read voice profile from `~/.claude/journey/config.md` (fall back to defaults)
3. Group commits by project
4. Identify notable moments:
   - PR merges
   - Large commit clusters (5+ commits on one feature)
   - Breakthrough patterns (failed attempts → success)
   - New projects (first appearance)
   - Significant refactors or architecture changes
5. Score each potential entry (0-10) using `lib/score.js` logic
6. For entries scoring 5+: write post-ready summary in user's voice
   - Focus on OUTCOMES and WHY, not technical HOW
   - Include emotional arc if present (struggle → breakthrough)
7. For entries scoring < 5: write brief factual record (one line)
8. Append to `$JL_PATH/YYYY/MM/YYYY-MM-DD.md`
9. Update local cache (streaks, projects, fingerprints)
10. Delete processed session file

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

Triggered automatically the first time any journey skill runs and `~/.claude/journey/config.md` does not exist.

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

## Path
- journal_path: D:/Repos/build-log
```

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

Four commands. All local. All instant. All offline-capable.

```
journey status    → entries this week, streaks, backlog size, hook health
journey search    → grep markdown files for text
journey doctor    → validate hooks, config, paths, no orphans
journey recover   → process orphaned session files
```

### `journey log`

Used by `/journal` skill. Writes entry to markdown via scoring pipeline.

```
journey log "summary" --type TYPE --project PROJECT [--json]

Pipeline: dedup → score → cache update → markdown write
No network. No API. Instant.
```

## Scoring (Unchanged from v1)

Deterministic, pure computation. No external calls.

| Signal | Points |
|--------|--------|
| Type: milestone | +4 |
| Type: insight/blocker | +3 |
| Type: feature | +2 |
| Type: bugfix/refactor/infra | +1 |
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
| `scripts/journey-capture.js` | ~145 | Stop agent hook |
| `migrations/` | ~50 | No DB |
| `pending-sync.jsonl` system | — | Nothing to retry |
| `lib/config.json` | — | No tenant routing |
| `.env` | — | No keys |

**~1,200 lines deleted.** Replaced by ~200 lines of hook scripts + skill markdown files.

## What Stays from v1

| Component | Why |
|-----------|-----|
| `scripts/journey-accumulate.sh` | PostToolUse hook — proven, lightweight |
| `lib/score.js` | Deterministic scoring — pure computation |
| `lib/cache.js` | Local state — streaks, fingerprints, milestones |
| `lib/markdown.js` | Markdown writer — the storage layer |
| `lib/errors.js` | Error logging — simplified, local only |
| `bin/journey.js` | CLI entry — reduced to 4 commands |
| `lib/cli/status.js` | Health report — simplified |
| `lib/cli/search.js` | Grep markdown — remove --db flag |
| `lib/cli/doctor.js` | Diagnostics — simplified |

## New Files

| File | Purpose |
|------|---------|
| `scripts/journey-notable.sh` | PostToolUse hook for PR/merge events |
| `lib/cli/recover.js` | Orphan session file recovery |
| `journey-logger-skills/journey-init.md` | Onboarding skill |
| `journey-logger-skills/journal-review.md` | Curation skill |
| `journey-logger-skills/journal-digest.md` | Digest skill |
| `config.example.md` | Voice/preference template |
| `hooks.example.json` | Updated hook configuration |

## Final File Structure

```
build-log/
├── bin/journey.js
├── lib/
│   ├── score.js
│   ├── cache.js
│   ├── markdown.js
│   ├── errors.js
│   └── cli/
│       ├── log.js
│       ├── status.js
│       ├── search.js
│       ├── doctor.js
│       └── recover.js
├── scripts/
│   ├── journey-accumulate.sh
│   └── journey-notable.sh
├── journey-logger-skills/
│   ├── journal.md
│   ├── j.md
│   ├── journal-review.md
│   ├── journal-publish.md
│   ├── journal-digest.md
│   ├── journey-init.md
│   └── README.md
├── hooks.example.json
├── config.example.md
├── YYYY/MM/YYYY-MM-DD.md
├── weekly/YYYY-WNN.md
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
6. Run `npm prune` to remove `@neondatabase/serverless`

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
