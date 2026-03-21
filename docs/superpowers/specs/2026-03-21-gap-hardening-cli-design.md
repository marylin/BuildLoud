# Journey Logger: Gap Hardening & CLI Design

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Reliability hardening + unified CLI for journey-logger

## Problem Statement

Journey Logger v1.1 has 18 identified gaps across capture, storage, intelligence, and output layers. The two highest-severity gaps (silent hook failures, retry queue data loss) risk losing journal entries without any user-visible signal. The remaining medium-severity gaps degrade reliability, usability, and pipeline correctness.

This design addresses 11 of 18 gaps through two coordinated changes:
1. Reliability hardening of existing modules
2. A zero-dependency CLI (`journey`) that unifies operations and makes pipeline health observable

## Gaps Addressed

| # | Layer | Gap | Severity | Fix |
|---|-------|-----|----------|-----|
| 1 | Capture | No cross-source dedup | Medium | Content fingerprint in write-entry |
| 3 | Capture | Silent hook failures | High | Error log file + status command |
| 4 | Capture | No orphaned JSONL recovery | Medium | Startup check in capture script |
| 6 | Storage | No bulk DB ↔ markdown sync | Medium | `journey sync` command |
| 7 | Storage | Cache corruption no recovery | Medium | Atomic write + backup rotation |
| 8 | Storage | Retry queue silent drops | High | Drop logging + status visibility |
| 10 | Intelligence | Humanization no retry | Medium | `journey rehumanize` command |
| 15 | Output | No unified CLI | Medium | `journey` entry point |
| 16 | Output | Digest window not anchored | Medium | `last_digest_date` in cache |
| 17 | Output | README under-documents seo-engine | Low | README expansion |
| 18 | Output | seo-feed not idempotent | Medium | Content fingerprint dedup |

### Gaps NOT addressed (deferred)

| # | Gap | Reason |
|---|-----|--------|
| 2 | Accumulator misses heredoc commits | Low severity, edge case |
| 5 | Journal markdown gitignored (SPOF) | By design — `journey sync` mitigates |
| 9 | No migration tooling | Low severity, premature |
| 11 | Score is write-once | Low severity, acceptable trade-off |
| 12 | No scoring feedback loop | Low severity, future phase |
| 13 | Platform classification naive | Low severity, works for now |
| 14 | Milestone detection misses non-PR ships | Low severity, edge case |

### Future phase (documented separately)

- Web dashboard for entries/scores/milestones — see `docs/05-Plans/future-roadmap.md`

---

## Section 1: CLI Architecture

### Entry point

`bin/journey.js` with shebang line. Registered in `package.json`:

```json
{
  "bin": { "journey": "./bin/journey.js" }
}
```

Users run `npx journey <command>` or `npm link` for global access.

### Parser

Node.js built-in `util.parseArgs` (available since v18.3). Zero external dependencies.

### Command routing

Simple switch/case in `bin/journey.js` that dynamic-imports from `lib/cli/<command>.js`. Each command module exports `async run(args)`.

### File structure

```
bin/
  journey.js              # Entry point: parseArgs, route to command
lib/
  cli/
    status.js             # Pipeline health report
    top.js                # Query top entries
    sync.js               # DB ↔ markdown sync
    rehumanize.js         # Retry failed humanizations
    digest.js             # Weekly digest wrapper
    search.js             # Search entries
  errors.js               # Shared error logging
```

### Design constraints

- Zero new npm dependencies — use only Node.js builtins
- Existing `scripts/` unchanged — hooks still call them directly
- CLI is a separate user-facing surface, not a replacement for hooks
- All output is plain text to stdout — no colors, no spinners

---

## Section 2: Reliability Hardening

### 2.1 Error logging (fixes #3)

**New file:** `lib/errors.js` (~30 LOC)

```
logError(context: string, error: Error | string) → void
```

- Appends to `~/.claude/journey-errors.log`
- Format: `[ISO timestamp] [context] message`
- Creates file if not exists
- Keeps last 500 lines (rotate on write if exceeded)

**Integration points:**
- `journey-accumulate.sh`: redirect stderr to log file on failure
- `journey-capture.js`: wrap main pipeline in try/catch, call `logError` on failure
- `lib/db.js`: log queue drops and connection failures
- `lib/humanize.js`: log API failures

### 2.2 Retry queue improvements (fixes #8)

**Changes to:** `lib/db.js`

- Before dropping expired entries (>7 days), write them to error log with `QUEUE_DROP` prefix
- `processPendingQueue()` remains internal (not exported); its return value is used only within `db.js`
- New public export: `getQueueStats()` → `{ pending, oldest, newest }`
  - Reads `pending-sync.jsonl` without loading into memory (line count + first/last timestamps)
  - This is the only new public API from db.js; the status command calls this

### 2.3 Cache resilience (fixes #7)

**Changes to:** `lib/cache.js`

- `save()`: write to `cache.json.tmp` → rename to `cache.json` (atomic write)
- Keep one backup: before overwriting, copy current `cache.json` → `cache.json.bak`
- `load()`: validate JSON structure with expected keys check
  - If corrupted: try `cache.json.bak`
  - If both bad: reset to empty state, log error via `logError`
- Add `lastCapture` field to cache schema — `recordSession()` sets `data.lastCapture = new Date().toISOString()` on each write
- New export: `getStats()` → `{ totalEntries, weeklyCount, currentStreak, lastCapture, projectsThisWeek }`
  - `currentStreak`: maximum `count` value across all projects in `data.streaks` (the longest active streak)

### 2.4 Orphaned JSONL recovery (fixes #4)

**Changes to:** `scripts/journey-capture.js`

On startup, before processing current session:
1. Check for `~/.claude/journey-session-processing.jsonl` (the single processing file created by atomic rename). If it exists and is older than 5 minutes, treat as orphaned.
2. Process orphaned file through the normal summary → write-entry pipeline
3. Clean up processed file
4. Also check for `~/.claude/journey-session.jsonl` older than 1 hour (no active session heuristic)
5. Log recoveries to error log with `RECOVERY` prefix

**Pre-existing bug fix:** The accumulator (`journey-accumulate.sh`) writes `message` as the JSON key, but `journey-capture.js` reads `c.msg`. Fix the capture script to read `c.message || c.msg` for backwards compatibility during this change.

### 2.5 Cross-source deduplication (fixes #1, #18)

**Changes to:** `lib/write-entry.js`

Before writing:
1. Compute fingerprint: `sha256(project + date + summary.slice(0, 100)).slice(0, 12)`
2. Check against `recent_fingerprints` array in cache (last 50 entries)
3. If match: skip write, log `DEDUP` to error log, return early
4. If no match: add fingerprint to cache, proceed with write

This covers:
- Stop-hook + PR-hook overlap (#1)
- seo-feed re-run duplicate appends (#18) — `pushEntry` also checks fingerprints before appending

---

## Section 3: CLI Commands

### 3.1 `journey status` (fixes #3, #8, #15)

Reads local state by default. `--db` flag adds DB health check.

**Local checks:**
- Last capture timestamp (from cache)
- Current streak (from cache)
- Pending queue size + oldest entry age (from `pending-sync.jsonl`)
- Recent errors (last 5 from `journey-errors.log`)
- Weekly stats: entry count, project count (from cache)

**DB checks (--db flag):**
- Connection test (SELECT 1)
- Row count in `journey_entries`
- Latest entry date

**Output format:**
```
Last capture:  2026-03-21 14:32 UTC (2h ago)
Streak:        3 days
Queue:         1 pending (oldest: 4h)
Errors:        none
Weekly:        8 entries across 3 projects
```

With `--db`:
```
DB:            connected (342 entries, latest: 2026-03-21)
```

### 3.2 `journey top` (fixes #15)

Queries Neon for top-scoring entries.

**Flags:**
- (default): top 10 this week
- `--month`: top 10 this month
- `--all`: top 10 all time
- `-n <count>`: change result limit

**Query:** `SELECT * FROM journey_entries WHERE created_at > $window ORDER BY social_score DESC, created_at DESC LIMIT $n`

**Output:** Tabular — score, date, project, summary (truncated to terminal width).

### 3.3 `journey search <query>` (fixes #15)

Two-tier search:

1. **Local** (default): recursive grep across `YYYY/MM/*.md` files matching query string. Searches from the repo root (same `BASE_PATH` used by `lib/markdown.js`).
2. **DB** (`--db` flag): `WHERE summary ILIKE '%query%' OR metadata::text ILIKE '%query%'`

Output: matching lines with file path and line number (local) or score + date + summary (DB).

### 3.4 `journey sync` (fixes #6)

Generalizes `sync-pr-entries.js` for all sources.

**Subcommands:**
- `journey sync pull`: query DB entries missing locally → write markdown via `lib/markdown.js`
  - Fingerprints are computed at sync time from DB row data (`project + date + summary.slice(0, 100)`), not stored in DB. Compared against fingerprints computed from existing local markdown files.
  - Humanize if score >= 5 and no `public_summary` in metadata
- `journey sync push`: re-insert locally-queued entries that failed to reach DB (processes `pending-sync.jsonl`). Does NOT parse markdown back into structured entries — that would require a markdown parser and the local format is lossy (no tags, no metadata). For full DB ↔ local parity, use `sync pull` from a DB that has the authoritative entries.
- `journey sync status`: show counts — local-only (by date scan), DB-only (by query), synced

**Note:** `sync-pr-entries.js` becomes a thin wrapper calling `journey sync pull --source pr_hook` or is deprecated with a note.

### 3.5 `journey rehumanize` (fixes #10)

Finds entries qualifying for humanization (score >= 5) but missing `public_summary`.

**Modes:**
- `journey rehumanize`: dry run — list candidates with score, date, project
- `journey rehumanize --run`: execute — call Haiku for each, update DB metadata. For local markdown, append a `> Public: ...` blockquote below the original entry (append-only, consistent with journal design — no in-place edits).
- `journey rehumanize --id <uuid>`: target specific entry

**Rate limiting:** 2 calls/second (500ms delay between Haiku requests) to avoid API throttling.

**Source:** queries DB for `WHERE social_score >= 5 AND (metadata->>'public_summary' IS NULL)`.

### 3.6 `journey digest` (wraps #16 fix)

Replaces direct `node scripts/generate-digest.js` invocation.

**Modes:**
- `journey digest`: generate for current window (since `last_digest_date` in cache, fallback 7 days)
- `journey digest --preview`: show entry count and top entries without generating
- `journey digest --email`: generate and send via Resend

**After generation:** stores `last_digest_date` in cache for anchored windows.

**Email behavior:** The refactored core logic (exported function) accepts an `{ email: boolean }` option:
- Standalone script (`node scripts/generate-digest.js`): passes `email: true` when `RESEND_API_KEY` + `DIGEST_EMAIL` are set (preserves current behavior for n8n)
- CLI (`journey digest`): passes `email: false` by default; `--email` flag overrides to `true`
- This avoids surprise emails when using the CLI interactively

**Note:** `generate-digest.js` is refactored to export its core logic; `journey digest` calls it. The script remains runnable standalone for n8n compatibility.

---

## Section 4: README & Docs Update (fixes #17)

### seo-engine section expansion

Current README section (4 lines) expanded to cover:
- **Config routing:** explain `branded_projects` → `whateverai` tenant, `default_tenant` for everything else
- **Silent failure mode:** if `topic-seeds.md` doesn't exist in the tenant directory, the push silently skips — this is by design (seo-engine manages its own tenant setup)
- **What gets pushed:** raw `summary` (not humanized content) — seo-engine handles enhancement
- **Verification:** `journey status` shows seo-engine push stats

### New CLI section

Add complete CLI reference to README:
- All 6 subcommands with flags and example output
- Installation: `npm link` for global access or `npx journey`
- Note that hooks are separate — CLI is for querying and operations

---

## Testing Strategy

### New test files

| File | Tests | Coverage |
|------|-------|----------|
| `tests/errors.test.js` | ~5 | log rotation, format, file creation |
| `tests/cli-status.test.js` | ~8 | local checks, DB flag, error display, empty state |
| `tests/cli-top.test.js` | ~5 | time windows, limit flag, empty results |
| `tests/cli-search.test.js` | ~5 | local grep, DB flag, no results |
| `tests/cli-sync.test.js` | ~8 | pull, push, status, fingerprint matching, dedup |
| `tests/cli-rehumanize.test.js` | ~6 | dry run, --run, --id, rate limiting, skip already-humanized |
| `tests/cli-digest.test.js` | ~5 | window anchoring, preview, email flag |

### Changes to existing test files

- `tests/cache.test.js`: add tests for atomic write, backup recovery, corruption handling, `getStats()`
- `tests/db.test.js`: add tests for `getQueueStats()`, drop logging, processed/dropped counts
- `tests/write-entry.test.js`: add tests for fingerprint dedup, duplicate suppression
- `tests/seo-feed.test.js`: add test for idempotent append (fingerprint check)

### Estimated: ~50 new tests total

### Mocking strategy

- DB queries mocked via injected SQL client (same pattern as existing tests)
- File I/O via temp directories + `setBasePath()` (same pattern)
- Haiku API via `globalThis.fetch` mock (same pattern)
- `journey-errors.log` via temp file path injection

---

## Scope Summary

| Category | Files | Estimated LOC |
|----------|-------|---------------|
| New: `lib/errors.js` | 1 | ~30 |
| New: `bin/journey.js` | 1 | ~50 |
| New: `lib/cli/*.js` (6 commands) | 6 | ~400 |
| Modified: `lib/cache.js` | 1 | ~40 delta |
| Modified: `lib/db.js` | 1 | ~30 delta |
| Modified: `lib/write-entry.js` | 1 | ~20 delta |
| Modified: `lib/seo-feed.js` | 1 | ~10 delta |
| Modified: `scripts/journey-capture.js` | 1 | ~30 delta |
| Modified: `scripts/generate-digest.js` | 1 | ~20 delta |
| New tests | 7 | ~300 |
| Modified tests | 4 | ~60 delta |
| Docs (README, CHANGELOG) | 2 | ~100 delta |
| **Total** | **27** | **~1,090** |

## Dependencies

None. All implementation uses Node.js builtins:
- `util.parseArgs` — CLI argument parsing
- `node:crypto` — SHA-256 fingerprinting (already used)
- `node:fs`, `node:path` — file operations (already used)
- `node:test`, `node:assert/strict` — testing (already used)
- `@neondatabase/serverless` — DB queries (already a dependency)
