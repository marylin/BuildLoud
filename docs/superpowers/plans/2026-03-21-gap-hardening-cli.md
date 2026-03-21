# Gap Hardening & CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden journey-logger reliability (error logging, cache resilience, dedup, queue improvements) and add a zero-dependency `journey` CLI with 6 subcommands.

**Architecture:** Reliability fixes go into existing modules (`cache.js`, `db.js`, `write-entry.js`, `seo-feed.js`, `journey-capture.js`). New `lib/errors.js` provides shared error logging. CLI entry point at `bin/journey.js` routes to command modules in `lib/cli/`. All changes use Node.js builtins only — no new npm dependencies.

**Tech Stack:** Node.js 18+ builtins (`util.parseArgs`, `node:crypto`, `node:fs`, `node:test`), `@neondatabase/serverless` (existing dep)

**Spec:** `docs/superpowers/specs/2026-03-21-gap-hardening-cli-design.md`

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `lib/errors.js` | Shared `logError()` + `readErrors()` + `setLogPath()` |
| `bin/journey.js` | CLI entry point: parseArgs, route to command |
| `lib/cli/status.js` | `journey status` — pipeline health report |
| `lib/cli/top.js` | `journey top` — query top entries from DB |
| `lib/cli/search.js` | `journey search` — grep local markdown + optional DB |
| `lib/cli/sync.js` | `journey sync` — pull/push/status between DB and local |
| `lib/cli/rehumanize.js` | `journey rehumanize` — retry failed humanizations |
| `lib/cli/digest.js` | `journey digest` — weekly digest wrapper |
| `tests/errors.test.js` | Tests for error logging module |
| `tests/cli-status.test.js` | Tests for status command |
| `tests/cli-top.test.js` | Tests for top command |
| `tests/cli-search.test.js` | Tests for search command |
| `tests/cli-sync.test.js` | Tests for sync command |
| `tests/cli-rehumanize.test.js` | Tests for rehumanize command |
| `tests/cli-digest.test.js` | Tests for digest command |

### Modified files
| File | Changes |
|------|---------|
| `lib/cache.js` | Atomic write, backup rotation, `lastCapture` field, `getStats()`, `recent_fingerprints` |
| `lib/db.js` | `getQueueStats()` export, drop logging via `logError` |
| `lib/write-entry.js` | Fingerprint dedup before write |
| `lib/seo-feed.js` | Fingerprint check before append |
| `lib/humanize.js` | Add `logError` for API failures |
| `scripts/journey-capture.js` | Orphan recovery, `c.message \|\| c.msg` fix, error logging |
| `scripts/generate-digest.js` | Export core logic, accept `{ email }` option, use `last_digest_date` |
| `package.json` | Add `"bin"` field |
| `README.md` | Expand seo-engine docs + add CLI section |
| `tests/cache.test.js` | Tests for atomic write, backup, corruption, getStats |
| `tests/db.test.js` | Tests for getQueueStats, drop logging |
| `tests/write-entry.test.js` | Tests for fingerprint dedup |
| `tests/seo-feed.test.js` | Test for idempotent append |

---

## Task 1: Error Logging Module

**Files:**
- Create: `lib/errors.js`
- Create: `tests/errors.test.js`

- [ ] **Step 1: Write failing tests for logError**

```js
// tests/errors.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LOG_PATH = join(import.meta.dirname, 'test-journey-errors.log');

let errors;
beforeEach(async () => {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
  errors = await import('../lib/errors.js');
  errors.setLogPath(LOG_PATH);
});
afterEach(() => {
  if (existsSync(LOG_PATH)) unlinkSync(LOG_PATH);
});

describe('logError', () => {
  it('creates log file and writes formatted line', () => {
    errors.logError('TEST_CTX', 'something broke');
    const content = readFileSync(LOG_PATH, 'utf8');
    assert.match(content, /\[\d{4}-\d{2}-\d{2}T.*\] \[TEST_CTX\] something broke/);
  });

  it('appends multiple errors', () => {
    errors.logError('A', 'first');
    errors.logError('B', 'second');
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
  });

  it('accepts Error objects', () => {
    errors.logError('ERR', new Error('oops'));
    const content = readFileSync(LOG_PATH, 'utf8');
    assert.match(content, /\[ERR\] oops/);
  });

  it('rotates when exceeding 500 lines', () => {
    // Pre-write 499 lines in bulk for performance, then add 2 via logError
    const bulkLines = Array.from({ length: 499 }, (_, i) =>
      `[2026-03-21T00:00:00.000Z] [FILL] line ${i}`
    ).join('\n') + '\n';
    writeFileSync(LOG_PATH, bulkLines);
    errors.logError('FILL', 'line 499');
    errors.logError('FILL', 'line 500');
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n');
    assert.ok(lines.length <= 500);
    // Most recent line should be the last written
    assert.match(lines[lines.length - 1], /line 500/);
  });
});

describe('readErrors', () => {
  it('returns empty array when no log file', () => {
    const result = errors.readErrors(5);
    assert.deepEqual(result, []);
  });

  it('returns last N lines', () => {
    errors.logError('A', 'one');
    errors.logError('B', 'two');
    errors.logError('C', 'three');
    const result = errors.readErrors(2);
    assert.equal(result.length, 2);
    assert.match(result[1], /three/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/errors.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/errors.js**

```js
// lib/errors.js
import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let LOG_PATH = join(process.env.HOME || process.env.USERPROFILE || '.', '.claude', 'journey-errors.log');

export function setLogPath(p) { LOG_PATH = p; }
export function getLogPath() { return LOG_PATH; }

const MAX_LINES = 500;

export function logError(context, error) {
  const msg = error instanceof Error ? error.message : String(error);
  const line = `[${new Date().toISOString()}] [${context}] ${msg}\n`;
  appendFileSync(LOG_PATH, line);

  // Rotate if needed
  try {
    const content = readFileSync(LOG_PATH, 'utf8');
    const lines = content.trim().split('\n');
    if (lines.length > MAX_LINES) {
      writeFileSync(LOG_PATH, lines.slice(-MAX_LINES).join('\n') + '\n');
    }
  } catch { /* rotation failure is non-critical */ }
}

export function readErrors(n = 5) {
  if (!existsSync(LOG_PATH)) return [];
  try {
    const lines = readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n);
  } catch { return []; }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/errors.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Integrate logError into lib/humanize.js**

In `lib/humanize.js`, add import at top:
```js
import { logError } from './errors.js';
```

Replace the silent `return null` on API failure (line 75: `if (!res.ok) return null;`) with:
```js
if (!res.ok) {
  logError('HUMANIZE', `Haiku API returned ${res.status}`);
  return null;
}
```

And wrap the JSON parse in a logged catch:
```js
let parsed;
try { parsed = JSON.parse(match[0]); } catch (err) {
  logError('HUMANIZE', `Failed to parse Haiku response: ${err.message}`);
  return null;
}
```

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npm test`
Expected: All 64 + 5 = 69 tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/errors.js lib/humanize.js tests/errors.test.js
git commit -m "feat(errors): add shared error logging module, integrate into humanize"
```

---

## Task 2: Cache Resilience

**Files:**
- Modify: `lib/cache.js`
- Modify: `tests/cache.test.js`

- [ ] **Step 1: Write failing tests for atomic write, backup, corruption recovery, lastCapture, getStats**

Append to `tests/cache.test.js`:

```js
  it('creates backup on save', () => {
    cache.recordSession('proj');
    // First save creates the file but no backup (nothing to back up)
    // Second save should create backup
    cache.recordSession('proj', '2026-03-19');
    const bakPath = CACHE_PATH.replace('.json', '.bak');
    assert.ok(existsSync(bakPath));
  });

  it('recovers from corrupted cache using backup', () => {
    cache.recordSession('proj');
    // Corrupt main file
    writeFileSync(CACHE_PATH, '{invalid json!!!');
    const data = cache.load();
    // Should recover from backup or reset
    assert.ok(data.week);
  });

  it('resets to default when both files corrupted', () => {
    writeFileSync(CACHE_PATH, 'garbage');
    writeFileSync(CACHE_PATH.replace('.json', '.bak'), 'also garbage');
    const data = cache.load();
    assert.equal(data.totalEntries, 0);
  });

  it('stores lastCapture timestamp on recordSession', () => {
    cache.recordSession('proj');
    const data = cache.load();
    assert.ok(data.lastCapture);
    assert.match(data.lastCapture, /^\d{4}-\d{2}-\d{2}T/);
  });

  it('getStats returns correct shape', () => {
    cache.recordSession('alpha', '2026-03-18');
    cache.recordSession('alpha', '2026-03-19');
    cache.recordSession('alpha', '2026-03-20');
    cache.recordSession('beta', '2026-03-20');
    const stats = cache.getStats();
    assert.equal(typeof stats.totalEntries, 'number');
    assert.equal(typeof stats.weeklyCount, 'number');
    assert.equal(typeof stats.currentStreak, 'number');
    assert.ok(stats.lastCapture);
    assert.ok(Array.isArray(stats.projectsThisWeek));
    assert.equal(stats.currentStreak, 3); // alpha has 3-day streak
  });

  it('stores and checks recent_fingerprints', () => {
    cache.addFingerprint('abc123');
    assert.ok(cache.hasFingerprint('abc123'));
    assert.ok(!cache.hasFingerprint('xyz789'));
  });

  it('caps fingerprints at 50', () => {
    for (let i = 0; i < 55; i++) cache.addFingerprint(`fp${i}`);
    const data = cache.load();
    assert.equal(data.recent_fingerprints.length, 50);
    // Oldest should be dropped
    assert.ok(!cache.hasFingerprint('fp0'));
    assert.ok(cache.hasFingerprint('fp54'));
  });
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `node --test tests/cache.test.js`
Expected: New tests FAIL (getStats, lastCapture, fingerprints not defined)

- [ ] **Step 3: Implement cache resilience changes**

Modify `lib/cache.js`:
- Import `logError` from `./errors.js`
- `save()`: copy current to `.bak` before writing; write to `.tmp` then rename
- `load()`: validate with expected keys; on parse error try `.bak`; on both fail, reset + logError
- `recordSession()`: add `data.lastCapture = new Date().toISOString()` before `save(data)`
- `defaultCache()`: add `recent_fingerprints: []` to defaults
- New export `getStats()`: reads cache, returns `{ totalEntries, weeklyCount, currentStreak, lastCapture, projectsThisWeek }`
  - `weeklyCount`: sum of values in `weeklyProjects`
  - `currentStreak`: `Math.max(0, ...Object.values(data.streaks).map(s => s.count))`
  - `projectsThisWeek`: `Object.keys(data.weeklyProjects)`
- New exports `addFingerprint(fp)` and `hasFingerprint(fp)`:
  - `addFingerprint`: load data, push to `recent_fingerprints`, trim to last 50, save. **Important:** `write-entry.js` calls `addFingerprint` before `recordSession`. To avoid a double-save race (where `recordSession`'s `load()` overwrites the fingerprint), `addFingerprint` must be called AFTER `recordSession` in `write-entry.js`, or both functions should operate on the same in-memory data. The simplest fix: in `write-entry.js`, call `cache.addFingerprint(fp)` AFTER `cache.recordSession()` (move the fingerprint add to after step 3 in write-entry.js).
  - `hasFingerprint`: load data, check inclusion in `recent_fingerprints` array
- Update existing `afterEach` in `tests/cache.test.js` to also clean up `.bak` and `.tmp` files:
  ```js
  afterEach(() => {
    for (const suffix of ['.json', '.bak', '.tmp']) {
      const p = CACHE_PATH.replace('.json', suffix);
      if (existsSync(p)) unlinkSync(p);
    }
  });
  ```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/cache.test.js`
Expected: All tests pass (8 existing + 7 new = 15)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/cache.js tests/cache.test.js
git commit -m "feat(cache): add atomic write, backup recovery, getStats, fingerprints"
```

---

## Task 3: Retry Queue Improvements

**Files:**
- Modify: `lib/db.js`
- Modify: `tests/db.test.js`

- [ ] **Step 1: Write failing tests for getQueueStats and drop logging**

Append to `tests/db.test.js`:

```js
describe('getQueueStats', () => {
  it('returns zeros when no queue file', () => {
    const stats = db.getQueueStats();
    assert.deepEqual(stats, { pending: 0, oldest: null, newest: null });
  });

  it('returns correct stats for populated queue', () => {
    const ts1 = '2026-03-20T10:00:00Z';
    const ts2 = '2026-03-21T10:00:00Z';
    writeFileSync(QUEUE_PATH,
      JSON.stringify({ project: 'a', _queued_at: ts1 }) + '\n' +
      JSON.stringify({ project: 'b', _queued_at: ts2 }) + '\n'
    );
    const stats = db.getQueueStats();
    assert.equal(stats.pending, 2);
    assert.equal(stats.oldest, ts1);
    assert.equal(stats.newest, ts2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/db.test.js`
Expected: FAIL — getQueueStats not defined

- [ ] **Step 3: Implement getQueueStats in lib/db.js**

Add to `lib/db.js`:

```js
import { logError } from './errors.js';
```

New export after `clearQueue()`:

```js
export function getQueueStats() {
  if (!existsSync(QUEUE_PATH)) return { pending: 0, oldest: null, newest: null };
  try {
    const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n').filter(Boolean);
    const entries = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (entries.length === 0) return { pending: 0, oldest: null, newest: null };
    const timestamps = entries.map(e => e._queued_at).filter(Boolean).sort();
    return {
      pending: entries.length,
      oldest: timestamps[0] || null,
      newest: timestamps[timestamps.length - 1] || null
    };
  } catch {
    return { pending: 0, oldest: null, newest: null };
  }
}
```

Also modify `readQueue()` to call `logError` when dropping expired entries. The current code chains `.map().filter().filter()` into `valid`. Refactor to capture the pre-filter count:

```js
export function readQueue() {
  if (!existsSync(QUEUE_PATH)) return [];
  const lines = readFileSync(QUEUE_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const parsed = lines
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
  const valid = parsed.filter(e => new Date(e._queued_at).getTime() > cutoff);
  const dropped = parsed.length - valid.length;
  if (dropped > 0) {
    logError('QUEUE_DROP', `Dropped ${dropped} expired entries (>7 days) from retry queue`);
  }
  if (valid.length > 50) {
    console.warn(`[journey] Retry queue has ${valid.length} entries (>50). Check DB connectivity.`);
  }
  return valid;
}
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `node --test tests/db.test.js`
Expected: All tests pass (6 existing + 2 new = 8)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/db.js tests/db.test.js
git commit -m "feat(db): add getQueueStats export and drop logging"
```

---

## Task 4: Cross-Source Deduplication

**Files:**
- Modify: `lib/write-entry.js`
- Modify: `lib/seo-feed.js`
- Modify: `tests/write-entry.test.js`
- Modify: `tests/seo-feed.test.js`

- [ ] **Step 1: Write failing test for write-entry dedup**

Append to `tests/write-entry.test.js`:

```js
it('skips duplicate entries by fingerprint', async () => {
  const entry = {
    project: 'dedup-test', type: 'feature', source: 'stop_hook',
    summary: 'Same summary for dedup testing'
  };
  const first = await write(entry);
  assert.ok(first.markdownPath);
  assert.ok(first.score >= 0);

  // Writing the same entry again should be skipped
  const second = await write({ ...entry });
  assert.equal(second.deduplicated, true);
});
```

- [ ] **Step 2: Write failing test for seo-feed idempotency**

Append to `tests/seo-feed.test.js`:

```js
it('does not append duplicate entry to topic-seeds', () => {
  const entry = { project: 'whatai', social_score: 8, summary: 'Unique seed entry' };
  seoFeed.pushEntry(entry, '2026-03-21');
  seoFeed.pushEntry(entry, '2026-03-21'); // same entry again
  const content = readFileSync(seedsPath, 'utf8');
  const matches = content.match(/Unique seed entry/g);
  assert.equal(matches.length, 1); // only once
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node --test tests/write-entry.test.js tests/seo-feed.test.js`
Expected: FAIL

- [ ] **Step 4: Implement dedup in write-entry.js**

Modify `lib/write-entry.js`:

```js
import { createHash } from 'node:crypto';
```

At the top of `write()`, before milestone detection — check only, don't add yet:

```js
// Dedup check (check before, add after recordSession to avoid save race)
const dateStr = date.toISOString().slice(0, 10);
const fp = createHash('sha256')
  .update(entry.project + dateStr + (entry.summary || '').slice(0, 100))
  .digest('hex').slice(0, 12);
if (cache.hasFingerprint(fp)) {
  return { deduplicated: true, markdownPath: null, score: 0, milestones: [], notable: false };
}
```

Then AFTER the existing `cache.recordSession()` call (step 3), add the fingerprint so both writes share the same save cycle:

```js
// 3. Update cache (must happen after scoring but recorded for future entries)
cache.recordSession(entry.project, date.toISOString().slice(0, 10));
cache.addFingerprint(fp); // Add after recordSession to avoid double-save race
if (entry.type === 'blocker') cache.recordBlocker(entry.project);
```

- [ ] **Step 5: Implement idempotency in seo-feed.js**

Modify `pushEntry` in `lib/seo-feed.js` — after computing `line`, before writing:

```js
// Check if this exact line already exists
if (content.includes(line)) return false;
```

- [ ] **Step 6: Run tests to verify all pass**

Run: `node --test tests/write-entry.test.js tests/seo-feed.test.js`
Expected: PASS

- [ ] **Step 7: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add lib/write-entry.js lib/seo-feed.js tests/write-entry.test.js tests/seo-feed.test.js
git commit -m "feat(dedup): add content fingerprint dedup in write-entry and seo-feed"
```

---

## Task 5: Orphaned JSONL Recovery & Accumulator Bug Fix

**Files:**
- Modify: `scripts/journey-capture.js`

- [ ] **Step 1: Fix the message/msg field mismatch**

In `scripts/journey-capture.js`, line 61 change:

```js
// Before
const commitList = commits.map(c => `- ${c.msg || '(no message)'}`).join('\n');
// After
const commitList = commits.map(c => `- ${c.message || c.msg || '(no message)'}`).join('\n');
```

Also fix line 100 (fallback summary):
```js
// Before
summary = `Session with ${commits.length} commit(s): ${commits.map(c => c.msg).filter(Boolean).join('; ')}`;
// After
summary = `Session with ${commits.length} commit(s): ${commits.map(c => c.message || c.msg).filter(Boolean).join('; ')}`;
```

And line 113 (metadata) — keep `msg` as the metadata key for backward compatibility, but source from the right field:
```js
// Before
commits: commits.map(c => ({ msg: c.msg, ts: c.ts }))
// After
commits: commits.map(c => ({ msg: c.message || c.msg, ts: c.ts }))
```

- [ ] **Step 2: Add orphan recovery function**

Add before `main()`:

```js
import { statSync } from 'node:fs';
import { logError } from '../lib/errors.js';

async function recoverOrphans() {
  // Check for orphaned processing file
  try {
    if (existsSync(PROCESSING_FILE)) {
      const stat = statSync(PROCESSING_FILE);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 5 * 60 * 1000) { // older than 5 minutes
        logError('RECOVERY', `Processing orphaned file: ${PROCESSING_FILE} (age: ${Math.round(ageMs / 60000)}m)`);
        await processFile(PROCESSING_FILE);
      }
    }
  } catch (err) {
    logError('RECOVERY', err);
  }

  // Check for stale session file (no active session)
  try {
    if (existsSync(JSONL_FILE)) {
      const stat = statSync(JSONL_FILE);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 60 * 60 * 1000) { // older than 1 hour
        logError('RECOVERY', `Processing stale session file: ${JSONL_FILE} (age: ${Math.round(ageMs / 3600000)}h)`);
        renameSync(JSONL_FILE, PROCESSING_FILE);
        await processFile(PROCESSING_FILE);
      }
    }
  } catch (err) {
    logError('RECOVERY', err);
  }
}
```

- [ ] **Step 3: Extract processFile from main, add error logging**

Refactor `main()` to extract the core processing into `processFile(filePath)`. Add `logError` calls in catch blocks. Call `recoverOrphans()` at the start of `main()`.

- [ ] **Step 4: Add error logging to the fatal catch**

```js
main().catch(err => {
  logError('CAPTURE_FATAL', err);
  try { unlinkSync(PROCESSING_FILE); } catch {}
  process.exit(1);
});
```

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass (capture script changes are tested via integration tests)

- [ ] **Step 6: Commit**

```bash
git add scripts/journey-capture.js
git commit -m "fix(capture): add orphan recovery, fix message/msg field, add error logging"
```

---

## Task 6: CLI Entry Point

**Files:**
- Create: `bin/journey.js`
- Modify: `package.json`

- [ ] **Step 1: Create bin/journey.js**

```js
#!/usr/bin/env node
// bin/journey.js — Journey Logger CLI
import { parseArgs } from 'node:util';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
const { loadEnv } = await import(join(__dirname, '..', 'lib', 'env.js'));
loadEnv(join(__dirname, '..', '.env'));

const commands = {
  status: '../lib/cli/status.js',
  top: '../lib/cli/top.js',
  search: '../lib/cli/search.js',
  sync: '../lib/cli/sync.js',
  rehumanize: '../lib/cli/rehumanize.js',
  digest: '../lib/cli/digest.js',
};

const command = process.argv[2];

if (!command || command === '--help' || command === '-h') {
  console.log(`Usage: journey <command> [options]

Commands:
  status        Pipeline health report
  top           Query top entries from DB
  search        Search entries (local + DB)
  sync          Sync DB ↔ local markdown
  rehumanize    Retry failed humanizations
  digest        Generate weekly digest

Run 'journey <command> --help' for command-specific options.`);
  process.exit(0);
}

if (!commands[command]) {
  console.error(`Unknown command: ${command}\nRun 'journey --help' for available commands.`);
  process.exit(1);
}

const mod = await import(join(__dirname, commands[command]));
const args = process.argv.slice(3);
try {
  await mod.run(args);
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
```

- [ ] **Step 2: Add bin field to package.json**

Add to `package.json`:
```json
"bin": {
  "journey": "./bin/journey.js"
}
```

- [ ] **Step 3: Verify entry point runs**

Run: `node bin/journey.js --help`
Expected: Prints usage with 6 commands listed

- [ ] **Step 4: Commit**

```bash
git add bin/journey.js package.json
git commit -m "feat(cli): add journey CLI entry point with command routing"
```

---

## Task 7: `journey status` Command

**Files:**
- Create: `lib/cli/status.js`
- Create: `tests/cli-status.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cli-status.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';
import * as db from '../lib/db.js';
import * as errors from '../lib/errors.js';

const TMP = join(import.meta.dirname, 'tmp-status');
const CACHE_PATH = join(TMP, 'cache.json');
const QUEUE_PATH = join(TMP, 'pending-sync.jsonl');
const LOG_PATH = join(TMP, 'errors.log');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  cache.setCachePath(CACHE_PATH);
  db.setQueuePath(QUEUE_PATH);
  errors.setLogPath(LOG_PATH);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('journey status', () => {
  it('outputs status with no data (fresh state)', async () => {
    const { run } = await import('../lib/cli/status.js');
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    await run([]);
    console.log = origLog;
    const output = lines.join('\n');
    assert.match(output, /Last capture/i);
    assert.match(output, /Queue/i);
    assert.match(output, /Weekly/i);
  });

  it('shows queue stats when entries pending', async () => {
    db.enqueue({ project: 'test', type: 'feature', source: 'stop_hook', summary: 'x' });
    const { run } = await import('../lib/cli/status.js');
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    await run([]);
    console.log = origLog;
    const output = lines.join('\n');
    assert.match(output, /1 pending/);
  });

  it('shows recent errors when present', async () => {
    errors.logError('TEST', 'something broke');
    const { run } = await import('../lib/cli/status.js');
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(' '));
    await run([]);
    console.log = origLog;
    const output = lines.join('\n');
    assert.match(output, /something broke/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli-status.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement lib/cli/status.js**

```js
// lib/cli/status.js
import { parseArgs } from 'node:util';
import * as cache from '../cache.js';
import { getQueueStats } from '../db.js';
import { readErrors } from '../errors.js';

function timeAgo(isoStr) {
  if (!isoStr) return 'never';
  const ms = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: { db: { type: 'boolean', default: false } },
    strict: false,
  });

  const stats = cache.getStats();
  const queue = getQueueStats();
  const recentErrors = readErrors(5);

  // Last capture
  const captureStr = stats.lastCapture
    ? `${stats.lastCapture.slice(0, 16).replace('T', ' ')} UTC (${timeAgo(stats.lastCapture)})`
    : 'never';
  console.log(`Last capture:  ${captureStr}`);

  // Streak
  console.log(`Streak:        ${stats.currentStreak} day${stats.currentStreak !== 1 ? 's' : ''}`);

  // Queue
  const queueStr = queue.pending === 0
    ? 'empty'
    : `${queue.pending} pending (oldest: ${timeAgo(queue.oldest)})`;
  console.log(`Queue:         ${queueStr}`);

  // Errors
  if (recentErrors.length === 0) {
    console.log(`Errors:        none`);
  } else {
    console.log(`Errors:        ${recentErrors.length} recent`);
    for (const line of recentErrors) {
      console.log(`  ${line}`);
    }
  }

  // Weekly
  const projList = stats.projectsThisWeek.join(', ') || 'none';
  console.log(`Weekly:        ${stats.weeklyCount} entries across ${stats.projectsThisWeek.length} projects`);

  // DB check (optional)
  if (values.db) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const [{ count }] = await sql`SELECT count(*)::int as count FROM journey_entries`;
      const [{ latest }] = await sql`SELECT max(created_at)::text as latest FROM journey_entries`;
      console.log(`DB:            connected (${count} entries, latest: ${latest ? latest.slice(0, 10) : 'none'})`);
    } catch (err) {
      console.log(`DB:            error — ${err.message}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cli-status.test.js`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/cli/status.js tests/cli-status.test.js
git commit -m "feat(cli): add journey status command"
```

---

## Task 8: `journey top` Command

**Files:**
- Create: `lib/cli/top.js`
- Create: `tests/cli-top.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cli-top.test.js
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('journey top', () => {
  it('formats entries as table rows', async () => {
    // Mock neon to return test data
    const origFetch = globalThis.fetch;
    const mockEntries = [
      { social_score: 8, created_at: '2026-03-21T10:00:00Z', project: 'alpha', summary: 'Built auth system' },
      { social_score: 6, created_at: '2026-03-20T10:00:00Z', project: 'beta', summary: 'Fixed login bug' },
    ];

    const { formatRow } = await import('../lib/cli/top.js');
    const row = formatRow(mockEntries[0], 80);
    assert.match(row, /8/);
    assert.match(row, /alpha/);
    assert.match(row, /Built auth/);
  });

  it('builds correct query window for --month', async () => {
    const { getWindow } = await import('../lib/cli/top.js');
    const win = getWindow({ month: true });
    const diff = Date.now() - new Date(win).getTime();
    // Should be roughly 30 days
    assert.ok(diff > 29 * 86400000);
    assert.ok(diff < 32 * 86400000);
  });

  it('builds correct query window for --all', async () => {
    const { getWindow } = await import('../lib/cli/top.js');
    const win = getWindow({ all: true });
    assert.equal(win, '1970-01-01T00:00:00.000Z');
  });

  it('defaults to 7-day window', async () => {
    const { getWindow } = await import('../lib/cli/top.js');
    const win = getWindow({});
    const diff = Date.now() - new Date(win).getTime();
    assert.ok(diff > 6 * 86400000);
    assert.ok(diff < 8 * 86400000);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli-top.test.js`
Expected: FAIL

- [ ] **Step 3: Implement lib/cli/top.js**

```js
// lib/cli/top.js
import { parseArgs } from 'node:util';

export function getWindow(flags) {
  if (flags.all) return '1970-01-01T00:00:00.000Z';
  const days = flags.month ? 30 : 7;
  return new Date(Date.now() - days * 86400000).toISOString();
}

export function formatRow(entry, width = 80) {
  const score = String(entry.social_score).padStart(2);
  const date = entry.created_at.slice(0, 10);
  const proj = entry.project.slice(0, 15).padEnd(15);
  const usedWidth = 2 + 1 + 10 + 1 + 15 + 1; // score + spaces + date + space + project + space
  const summaryWidth = Math.max(20, width - usedWidth);
  const summary = entry.summary.length > summaryWidth
    ? entry.summary.slice(0, summaryWidth - 3) + '...'
    : entry.summary;
  return `${score} ${date} ${proj} ${summary}`;
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      month: { type: 'boolean', default: false },
      all: { type: 'boolean', default: false },
      n: { type: 'string', default: '10' },
    },
    strict: false,
  });

  const limit = parseInt(values.n, 10) || 10;
  const since = getWindow(values);

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  const entries = await sql`
    SELECT * FROM journey_entries
    WHERE created_at > ${since}
    ORDER BY social_score DESC, created_at DESC
    LIMIT ${limit}
  `;

  if (entries.length === 0) {
    console.log('No entries found.');
    return;
  }

  const width = process.stdout.columns || 80;
  for (const entry of entries) {
    console.log(formatRow(entry, width));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cli-top.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cli/top.js tests/cli-top.test.js
git commit -m "feat(cli): add journey top command"
```

---

## Task 9: `journey search` Command

**Files:**
- Create: `lib/cli/search.js`
- Create: `tests/cli-search.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cli-search.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import * as markdown from '../lib/markdown.js';

const TMP = join(import.meta.dirname, 'tmp-search');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  markdown.setBasePath(TMP);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('journey search', () => {
  it('finds matching lines in local markdown', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'), '# 2026-03-21\n## 10:00 — proj [feature]\nBuilt the auth system\n');

    const { searchLocal } = await import('../lib/cli/search.js');
    const results = searchLocal('auth', TMP);
    assert.ok(results.length > 0);
    assert.match(results[0], /auth/);
  });

  it('returns empty for no matches', async () => {
    const { searchLocal } = await import('../lib/cli/search.js');
    const results = searchLocal('nonexistent', TMP);
    assert.equal(results.length, 0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli-search.test.js`
Expected: FAIL

- [ ] **Step 3: Implement lib/cli/search.js**

```js
// lib/cli/search.js
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = join(__dirname, '..', '..');

export function searchLocal(query, basePath = DEFAULT_BASE) {
  const results = [];
  const queryLower = query.toLowerCase();

  // Scan YYYY/MM/*.md files
  let years;
  try { years = readdirSync(basePath).filter(d => /^\d{4}$/.test(d)); } catch { return results; }

  for (const year of years) {
    const yearPath = join(basePath, year);
    let months;
    try { months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d)); } catch { continue; }

    for (const month of months) {
      const monthPath = join(yearPath, month);
      let files;
      try { files = readdirSync(monthPath).filter(f => f.endsWith('.md')); } catch { continue; }

      for (const file of files) {
        const filePath = join(monthPath, file);
        const content = readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            results.push(`${year}/${month}/${file}:${i + 1}: ${lines[i]}`);
          }
        }
      }
    }
  }
  return results;
}

export async function run(args) {
  const { values, positionals } = parseArgs({
    args,
    options: { db: { type: 'boolean', default: false } },
    strict: false,
    allowPositionals: true,
  });

  const query = positionals[0];
  if (!query) {
    console.error('Usage: journey search <query> [--db]');
    process.exit(1);
  }

  // Local search
  const localResults = searchLocal(query);
  if (localResults.length > 0) {
    console.log(`Local matches (${localResults.length}):`);
    for (const line of localResults) console.log(`  ${line}`);
  } else {
    console.log('No local matches.');
  }

  // DB search (optional)
  if (values.db) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const pattern = `%${query}%`;
      const rows = await sql`
        SELECT social_score, created_at, project, summary
        FROM journey_entries
        WHERE summary ILIKE ${pattern} OR metadata::text ILIKE ${pattern}
        ORDER BY created_at DESC LIMIT 20
      `;
      if (rows.length > 0) {
        console.log(`\nDB matches (${rows.length}):`);
        for (const r of rows) {
          console.log(`  ${String(r.social_score).padStart(2)} ${r.created_at.slice(0, 10)} ${r.project}: ${r.summary.slice(0, 60)}`);
        }
      } else {
        console.log('\nNo DB matches.');
      }
    } catch (err) {
      console.log(`\nDB search failed: ${err.message}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cli-search.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/cli/search.js tests/cli-search.test.js
git commit -m "feat(cli): add journey search command"
```

---

## Task 10: `journey sync` Command

**Files:**
- Create: `lib/cli/sync.js`
- Create: `tests/cli-sync.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cli-sync.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as markdown from '../lib/markdown.js';
import * as db from '../lib/db.js';

const TMP = join(import.meta.dirname, 'tmp-sync');
const QUEUE_PATH = join(TMP, 'pending-sync.jsonl');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  markdown.setBasePath(TMP);
  db.setQueuePath(QUEUE_PATH);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('countLocalEntries', () => {
  it('counts entry headers in markdown files', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n## 10:00 — proj [feature]\nFirst entry\n\n## 14:00 — proj [bugfix]\nSecond entry\n');

    const { countLocalEntries } = await import('../lib/cli/sync.js');
    const count = countLocalEntries(TMP);
    assert.equal(count, 2);
  });

  it('returns 0 when no markdown files', async () => {
    const { countLocalEntries } = await import('../lib/cli/sync.js');
    const count = countLocalEntries(TMP);
    assert.equal(count, 0);
  });
});

describe('pullEntries', () => {
  it('writes DB entries to local markdown', async () => {
    const { pullEntry } = await import('../lib/cli/sync.js');
    const dbRow = {
      project: 'test-proj', type: 'feature', source: 'stop_hook',
      summary: 'Built something great', social_score: 3,
      created_at: '2026-03-21T10:30:00Z', metadata: {}
    };
    pullEntry(dbRow, TMP);
    const filePath = join(TMP, '2026', '03', '2026-03-21.md');
    assert.ok(existsSync(filePath));
    const content = readFileSync(filePath, 'utf8');
    assert.match(content, /Built something great/);
  });

  it('skips entry if already exists locally (by content match)', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'),
      '# 2026-03-21\n## 10:30 — test-proj [feature]\nBuilt something great\n');

    const { pullEntry } = await import('../lib/cli/sync.js');
    const dbRow = {
      project: 'test-proj', type: 'feature', source: 'stop_hook',
      summary: 'Built something great', social_score: 3,
      created_at: '2026-03-21T10:30:00Z', metadata: {}
    };
    const result = pullEntry(dbRow, TMP);
    assert.equal(result, false); // skipped — already local
  });
});

describe('sync push', () => {
  it('reads pending queue entries', async () => {
    db.enqueue({ project: 'test', type: 'feature', source: 'stop_hook', summary: 'queued' });
    const stats = db.getQueueStats();
    assert.equal(stats.pending, 1);
  });
});

describe('sync status output', () => {
  it('reports local and queue counts', async () => {
    const dir = join(TMP, '2026', '03');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, '2026-03-21.md'), '# 2026-03-21\n## 10:00 — proj [feature]\nEntry\n');
    db.enqueue({ project: 'q', type: 'feature', source: 'stop_hook', summary: 'x' });

    const { countLocalEntries } = await import('../lib/cli/sync.js');
    assert.equal(countLocalEntries(TMP), 1);
    assert.equal(db.getQueueStats().pending, 1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli-sync.test.js`
Expected: FAIL

- [ ] **Step 3: Implement lib/cli/sync.js**

```js
// lib/cli/sync.js
import { parseArgs } from 'node:util';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as md from '../markdown.js';
import { getQueueStats, readQueue, insert, clearQueue } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BASE = join(__dirname, '..', '..');

export function countLocalEntries(basePath = DEFAULT_BASE) {
  let count = 0;
  let years;
  try { years = readdirSync(basePath).filter(d => /^\d{4}$/.test(d)); } catch { return 0; }
  for (const year of years) {
    let months;
    try { months = readdirSync(join(basePath, year)).filter(d => /^\d{2}$/.test(d)); } catch { continue; }
    for (const month of months) {
      let files;
      try { files = readdirSync(join(basePath, year, month)).filter(f => f.endsWith('.md')); } catch { continue; }
      for (const file of files) {
        const content = readFileSync(join(basePath, year, month, file), 'utf8');
        const headers = content.match(/^## \d{2}:\d{2} — /gm);
        if (headers) count += headers.length;
      }
    }
  }
  return count;
}

export function pullEntry(dbRow, basePath = DEFAULT_BASE) {
  // Check if entry content already exists locally
  const date = new Date(dbRow.created_at);
  const year = date.getUTCFullYear().toString();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const filePath = join(basePath, year, month, `${year}-${month}-${day}.md`);

  if (existsSync(filePath)) {
    const content = readFileSync(filePath, 'utf8');
    if (content.includes(dbRow.summary.slice(0, 80))) return false; // already local
  }

  // Write via markdown module
  const oldBase = DEFAULT_BASE;
  md.setBasePath(basePath);
  md.writeEntry({
    project: dbRow.project,
    type: dbRow.type,
    source: dbRow.source,
    summary: dbRow.summary,
    social_score: dbRow.social_score,
    metadata: dbRow.metadata,
  }, date);
  md.setBasePath(oldBase);
  return true;
}

export async function run(args) {
  const { positionals } = parseArgs({
    args,
    options: {},
    strict: false,
    allowPositionals: true,
  });

  const sub = positionals[0];
  if (!sub || !['pull', 'push', 'status'].includes(sub)) {
    console.log('Usage: journey sync <pull|push|status>');
    return;
  }

  if (sub === 'status') {
    const localCount = countLocalEntries();
    const queue = getQueueStats();
    console.log(`Local entries:  ${localCount}`);
    console.log(`Pending queue:  ${queue.pending}`);
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(process.env.DATABASE_URL);
      const [{ count }] = await sql`SELECT count(*)::int as count FROM journey_entries`;
      console.log(`DB entries:     ${count}`);
    } catch (err) {
      console.log(`DB entries:     error — ${err.message}`);
    }
  }

  if (sub === 'pull') {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const rows = await sql`SELECT * FROM journey_entries ORDER BY created_at DESC`;
    let pulled = 0;
    for (const row of rows) {
      if (pullEntry(row)) pulled++;
    }
    console.log(`Pulled ${pulled} new entries (${rows.length - pulled} already local).`);
  }

  if (sub === 'push') {
    const queue = readQueue();
    if (queue.length === 0) {
      console.log('No pending entries to push.');
      return;
    }
    console.log(`Pushing ${queue.length} pending entries...`);
    let ok = 0;
    for (const entry of queue) {
      const { _queued_at, ...rest } = entry;
      const result = await insert(rest);
      if (result.ok) ok++;
    }
    console.log(`Pushed ${ok}/${queue.length} entries.`);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cli-sync.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/cli/sync.js tests/cli-sync.test.js
git commit -m "feat(cli): add journey sync command"
```

---

## Task 11: `journey rehumanize` Command

**Files:**
- Create: `lib/cli/rehumanize.js`
- Create: `tests/cli-rehumanize.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cli-rehumanize.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('journey rehumanize', () => {
  it('formatCandidate produces readable output', async () => {
    const { formatCandidate } = await import('../lib/cli/rehumanize.js');
    const row = { social_score: 7, created_at: '2026-03-21T10:00:00Z', project: 'alpha', summary: 'Built auth' };
    const line = formatCandidate(row);
    assert.match(line, /7/);
    assert.match(line, /alpha/);
    assert.match(line, /Built auth/);
  });

  it('buildUpdateQuery returns valid SQL params', async () => {
    const { buildUpdateParams } = await import('../lib/cli/rehumanize.js');
    const result = { public_summary: 'Public version', suggested_platform: 'twitter', public_summary_version: 'abc123' };
    const params = buildUpdateParams('some-uuid', result);
    assert.equal(params.id, 'some-uuid');
    assert.match(params.metadata, /public_summary/);
  });

  it('appendPublicSummary formats blockquote correctly', async () => {
    const { formatBlockquote } = await import('../lib/cli/rehumanize.js');
    const bq = formatBlockquote('This is the public version');
    assert.equal(bq, '\n> Public: This is the public version\n');
  });

  it('delay function waits approximately 500ms', async () => {
    const { rateLimit } = await import('../lib/cli/rehumanize.js');
    const start = Date.now();
    await rateLimit();
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 400); // allow 100ms tolerance
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli-rehumanize.test.js`
Expected: FAIL

- [ ] **Step 3: Implement lib/cli/rehumanize.js**

```js
// lib/cli/rehumanize.js
import { parseArgs } from 'node:util';
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { humanize } from '../humanize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_PATH = join(__dirname, '..', '..');

export function formatCandidate(row) {
  const score = String(row.social_score).padStart(2);
  const date = row.created_at.slice(0, 10);
  return `${score} ${date} ${row.project}: ${row.summary.slice(0, 60)}`;
}

export function buildUpdateParams(id, result) {
  return {
    id,
    metadata: JSON.stringify({
      public_summary: result.public_summary,
      suggested_platform: result.suggested_platform,
      public_summary_version: result.public_summary_version,
    }),
  };
}

export function formatBlockquote(publicSummary) {
  return `\n> Public: ${publicSummary}\n`;
}

export function rateLimit() {
  return new Promise(resolve => setTimeout(resolve, 500));
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      run: { type: 'boolean', default: false },
      id: { type: 'string' },
    },
    strict: false,
  });

  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);

  // Query candidates
  let candidates;
  if (values.id) {
    candidates = await sql`
      SELECT * FROM journey_entries
      WHERE id = ${values.id} AND social_score >= 5
        AND (metadata->>'public_summary' IS NULL)
    `;
  } else {
    candidates = await sql`
      SELECT * FROM journey_entries
      WHERE social_score >= 5 AND (metadata->>'public_summary' IS NULL)
      ORDER BY social_score DESC, created_at DESC
    `;
  }

  if (candidates.length === 0) {
    console.log('No candidates for humanization.');
    return;
  }

  // Dry run (default)
  if (!values.run) {
    console.log(`${candidates.length} candidates for humanization:\n`);
    for (const row of candidates) {
      console.log(`  ${formatCandidate(row)}`);
    }
    console.log(`\nRun with --run to execute.`);
    return;
  }

  // Execute humanization
  let success = 0;
  for (const row of candidates) {
    try {
      const result = await humanize(row, { force: true });
      if (!result) {
        console.log(`  SKIP ${row.id} — humanize returned null`);
        continue;
      }

      // Update DB metadata
      const merged = { ...(row.metadata || {}), ...result };
      await sql`UPDATE journey_entries SET metadata = ${JSON.stringify(merged)} WHERE id = ${row.id}`;

      // Append blockquote to local markdown
      const date = new Date(row.created_at);
      const year = date.getUTCFullYear().toString();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const mdPath = join(BASE_PATH, year, month, `${year}-${month}-${day}.md`);
      if (existsSync(mdPath)) {
        appendFileSync(mdPath, formatBlockquote(result.public_summary));
      }

      console.log(`  OK   ${row.project}: ${result.public_summary.slice(0, 50)}...`);
      success++;
    } catch (err) {
      console.log(`  FAIL ${row.id}: ${err.message}`);
    }

    // Rate limit between API calls
    await rateLimit();
  }

  console.log(`\nHumanized ${success}/${candidates.length} entries.`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/cli-rehumanize.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/cli/rehumanize.js tests/cli-rehumanize.test.js
git commit -m "feat(cli): add journey rehumanize command"
```

---

## Task 12: `journey digest` Command + Digest Window Anchoring

**Files:**
- Create: `lib/cli/digest.js`
- Modify: `scripts/generate-digest.js`
- Create: `tests/cli-digest.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/cli-digest.test.js
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import * as cache from '../lib/cache.js';

const TMP = join(import.meta.dirname, 'tmp-digest');
const CACHE_PATH = join(TMP, 'cache.json');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
  cache.setCachePath(CACHE_PATH);
});
afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('getDigestWindow', () => {
  it('uses last_digest_date from cache when present', async () => {
    const lastDate = '2026-03-14T08:00:00.000Z';
    cache.save({ ...cache.load(), last_digest_date: lastDate });

    const { getDigestWindow } = await import('../lib/cli/digest.js');
    const since = getDigestWindow();
    assert.equal(since, lastDate);
  });

  it('falls back to 7 days when no last_digest_date', async () => {
    const { getDigestWindow } = await import('../lib/cli/digest.js');
    const since = getDigestWindow();
    const diff = Date.now() - new Date(since).getTime();
    assert.ok(diff > 6 * 86400000);
    assert.ok(diff < 8 * 86400000);
  });
});

describe('saveDigestDate', () => {
  it('stores last_digest_date in cache', async () => {
    const { saveDigestDate } = await import('../lib/cli/digest.js');
    saveDigestDate();
    const data = cache.load();
    assert.ok(data.last_digest_date);
    assert.match(data.last_digest_date, /^\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/cli-digest.test.js`
Expected: FAIL

- [ ] **Step 3: Refactor generate-digest.js to export core logic**

In `scripts/generate-digest.js`, extract the core logic into an exported function:

```js
// Add at top of file, after imports:
export async function generateDigest({ since, email = false } = {}) {
  const sql = neon(process.env.DATABASE_URL);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const sinceDate = since || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const entries = await sql`
    SELECT * FROM journey_entries WHERE created_at >= ${sinceDate}
    ORDER BY social_score DESC
  `;
  // ... (rest of existing logic: Haiku call, write markdown, mark entries)

  // Email: only send if email=true AND env vars present
  if (email) {
    const resendKey = process.env.RESEND_API_KEY;
    const digestEmail = process.env.DIGEST_EMAIL;
    if (resendKey && digestEmail) {
      // ... existing email logic
    }
  }

  return { entries: entries.length, weeklyPath };
}

// Standalone entry point
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const hasEmail = !!(process.env.RESEND_API_KEY && process.env.DIGEST_EMAIL);
  generateDigest({ email: hasEmail }).catch(console.error);
}
```

This preserves backward compatibility: `node scripts/generate-digest.js` works as before (auto-emails when env vars set). The CLI wrapper passes `email: false` by default.

- [ ] **Step 4: Implement lib/cli/digest.js**

```js
// lib/cli/digest.js
import { parseArgs } from 'node:util';
import * as cache from '../cache.js';

export function getDigestWindow() {
  const data = cache.load();
  if (data.last_digest_date) return data.last_digest_date;
  return new Date(Date.now() - 7 * 86400000).toISOString();
}

export function saveDigestDate() {
  const data = cache.load();
  data.last_digest_date = new Date().toISOString();
  cache.save(data);
}

export async function run(args) {
  const { values } = parseArgs({
    args,
    options: {
      preview: { type: 'boolean', default: false },
      email: { type: 'boolean', default: false },
    },
    strict: false,
  });

  const since = getDigestWindow();

  if (values.preview) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(process.env.DATABASE_URL);
    const entries = await sql`
      SELECT social_score, project, summary FROM journey_entries
      WHERE created_at >= ${since} ORDER BY social_score DESC
    `;
    console.log(`Preview: ${entries.length} entries since ${since.slice(0, 10)}`);
    for (const e of entries.slice(0, 10)) {
      console.log(`  ${String(e.social_score).padStart(2)} ${e.project}: ${e.summary.slice(0, 60)}`);
    }
    return;
  }

  // Dynamic import to avoid loading Neon at parse time
  const { generateDigest } = await import('../../scripts/generate-digest.js');
  const result = await generateDigest({ since, email: values.email });
  saveDigestDate();
  console.log(`Digest generated: ${result.entries} entries → ${result.weeklyPath}`);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test tests/cli-digest.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add lib/cli/digest.js scripts/generate-digest.js tests/cli-digest.test.js
git commit -m "feat(cli): add journey digest command with window anchoring"
```

---

## Task 13: README & Docs Update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Expand seo-engine section**

Replace the current 4-line section (lines 107-111 of README.md) with expanded documentation covering: config routing (`branded_projects` → `whateverai` tenant, `default_tenant` for everything else), silent failure mode (no `topic-seeds.md` → silently skips), what gets pushed (raw `summary`, seo-engine handles enhancement).

- [ ] **Step 2: Add CLI section to README**

Add a new `## CLI` section after `## Usage` with all 6 subcommands, flags, and example output. Include installation instructions (`npm link` or `npx journey`).

- [ ] **Step 3: Review README coherence**

Read the full README and verify the new sections integrate naturally with existing content. No contradictions.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: expand seo-engine integration and add CLI reference"
```

---

## Task 14: Final Integration Test & Version Bump

**Files:**
- Modify: `package.json` (version bump)
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (~115 tests)

- [ ] **Step 2: Manually test CLI end-to-end**

Run:
```bash
node bin/journey.js status
node bin/journey.js --help
node bin/journey.js search test
```
Verify output is correct and no crashes.

- [ ] **Step 3: Bump version to 1.2.0**

In `package.json`: `"version": "1.2.0"`

- [ ] **Step 4: Update CHANGELOG.md**

Add `## [1.2.0] - 2026-03-XX` section with:
- Added: `journey` CLI with 6 subcommands (status, top, search, sync, rehumanize, digest)
- Added: Error logging (`lib/errors.js`) — persistent log at `~/.claude/journey-errors.log`
- Added: Cross-source deduplication via content fingerprinting
- Added: Cache resilience with atomic writes and backup rotation
- Fixed: Orphaned JSONL recovery in stop hook
- Fixed: Accumulator `message`/`msg` field mismatch
- Changed: `generate-digest.js` exports core logic for CLI wrapping

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: bump version to 1.2.0 and update CHANGELOG"
```
