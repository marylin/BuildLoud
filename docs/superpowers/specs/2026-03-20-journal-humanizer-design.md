# Journal Humanizer -- Design Spec

## Summary

Add a post-processing layer to the Journey Logger that generates a "public-ready" version of journal entries alongside the raw technical summary. Entries scoring 5+ get auto-humanized at write time. Tone is score-driven: 7+ gets casual/punchy social voice, 5-6 gets professional blog voice. A `/journal:publish` command allows on-demand refinement with custom hints. All operations are idempotent.

## Architecture

### New module: `lib/humanize.js`

Single exported function:

```
humanize(entry, { force = false, hint = '' } = {}) -> { public_summary, suggested_platform, public_summary_version } | null
```

**Inputs:**
- `entry` -- full entry object (needs `summary`, `type`, `project`, `social_score`, `tags`, `metadata`)
- `options.force` -- skip idempotency hash check (used by `/journal:publish --force`)
- `options.hint` -- extra context appended to the Haiku prompt ("angle toward lawyers", "make punchier")

**Logic:**
1. If `social_score < 5`, return `null` (not worth publishing)
2. Compute content hash: `createHash('sha256').update(entry.summary).digest('hex').slice(0, 12)`
3. If `!force` and `entry.metadata?.public_summary_version === hash`, return `null` (already humanized from same source)
4. Select tone based on score:
   - `7+`: `casual_punchy` -- first-person, short sentences, social-post ready
   - `5-6`: `professional` -- first-person, thoughtful, blog-ready
5. Call Haiku via native `fetch` (see Haiku API Client below)
6. Parse response JSON: `{ public_summary }`
7. Determine `suggested_platform` in JS (NOT in the prompt):
   - `public_summary.length < 280` -> `twitter`
   - `public_summary.length < 600` -> `linkedin`
   - else -> `blog`
8. Return `{ public_summary, suggested_platform, public_summary_version: hash }`

### Haiku API Client

Uses native `fetch` against the Anthropic Messages API. No new dependencies. Same pattern as `scripts/journey-capture.js`.

```js
const res = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }]
  })
});
```

### Prompt Design

```
You are a build-in-public content writer for a solo tech founder.

Rewrite this technical journal entry for a non-technical audience.
The reader is a potential customer, follower, or fellow builder -- NOT a developer.

TONE: {casual_punchy | professional}
- casual_punchy: First person, short sentences, build-in-public energy. Like a tweet or LinkedIn post. No jargon.
- professional: First person, thoughtful, blog-ready. Shows expertise without being intimidating.

RULES:
- Focus on OUTCOMES and WHY they matter, not HOW they were built
- Replace technical terms with plain language (e.g., "15 integrations" not "15 REST API adapters")
- Include the emotional arc if present (struggle, breakthrough, milestone)
- No em dashes
- Keep it concise: max 3 sentences for casual_punchy, max 5 for professional

{hint ? "ADDITIONAL DIRECTION: " + hint : ""}

Technical entry:
{entry.summary}

Project: {entry.project}
Type: {entry.type}

Respond with ONLY valid JSON:
{"public_summary": "the rewritten text"}
```

Note: `suggested_platform` is computed in JS post-processing based on output length, NOT requested from the model. This avoids unreliable AI character counting.

### Integration into write pipeline

In `lib/write-entry.js`, the current pipeline is:
1. Detect milestones
2. Compute score
3. Update cache
4. Write to markdown
5. Write to DB (async)
6. Push to seo-engine
7. Git commit

Humanization inserts **between step 3 (cache) and step 4 (markdown)** so that `entry.metadata` contains `public_summary` before `md.writeEntry()` is called. This ensures the markdown file includes the humanized content.

```js
// 3.5 Humanize (before markdown write, so public_summary is in the file)
if (entry.social_score >= 5) {
  try {
    const result = await humanize(entry);
    if (result) {
      entry.metadata = {
        ...entry.metadata,
        public_summary: result.public_summary,
        suggested_platform: result.suggested_platform,
        public_summary_version: result.public_summary_version
      };
    }
  } catch { /* humanization failure is non-critical */ }
}
```

If Haiku fails, entry writes normally without public version. No error surfaced.

### PR hook entries (sync-pr-entries.js)

When `scripts/sync-pr-entries.js` pulls PR entries from the DB:

1. Fetch entry from DB (existing)
2. Call `humanize(entry)` if `social_score >= 5`
3. If result: merge into `entry.metadata`
4. Call `md.writeEntry(entry, ...)` to write markdown (existing)
5. UPDATE the DB row to persist both `md_synced` flag AND humanized metadata:

```js
await sql`
  UPDATE journey_entries
  SET metadata = metadata || ${JSON.stringify({
    md_synced: true,
    public_summary: result?.public_summary,
    suggested_platform: result?.suggested_platform,
    public_summary_version: result?.public_summary_version
  })}::jsonb
  WHERE id = ${entry.id}
`;
```

### `/journal:publish` command

Skill at `~/.claude/commands/journal-publish.md`.

**Flow:**
1. Read entries from last N days (default 7) via local markdown files or DB query
2. Filter to entries with `social_score >= 5`
3. For each entry, check idempotency: skip if `public_summary_version` matches current `summary` hash, unless `--force`
4. Show entries with existing `public_summary` and `suggested_platform`
5. User can:
   - Pick entries to refine with a hint ("angle toward lawyers", "make punchier", "combine these two")
   - Re-run `humanize(entry, { force: true, hint: userHint })` with their direction
6. Output final text ready to copy-paste
7. Update entry metadata with new `public_summary` and `public_summary_version`

**Idempotency:**
- `public_summary_version` = `sha256(summary).slice(0, 12)`
- If version matches, skip (already humanized from same source content)
- If raw summary changed, hash changes, re-humanize
- `force: true` bypasses hash check

### Storage

No schema changes. Everything goes into the existing `metadata` JSONB field:

```json
{
  "public_summary": "Shipped WhateverOPS with 15 integrations...",
  "suggested_platform": "linkedin",
  "public_summary_version": "a1b2c3d4e5f6"
}
```

**Queue behavior:** Entries that go through the offline retry queue (`pending-sync.jsonl`) retain their full `metadata` blob including humanized content. `processPendingQueue` replays them as-is. No re-humanization on queue replay.

### Testing

| Test | What it verifies |
|------|-----------------|
| `humanize()` returns null for score < 5 | Skip threshold |
| `humanize()` selects casual tone for score 7+ | Tone routing |
| `humanize()` selects professional tone for score 5-6 | Tone routing |
| `humanize()` returns null when version hash matches | Idempotency |
| `humanize()` regenerates when `force: true` despite hash match | Force bypass |
| `humanize()` appends hint to prompt when provided | Hint injection |
| `humanize()` regenerates when summary content changes | Hash invalidation |
| `humanize()` returns gracefully on API failure | Error resilience |
| `humanize()` computes suggested_platform from output length | Platform classification |
| write-entry integration: score 7 entry has public_summary in metadata before markdown write | Pipeline integration |
| write-entry integration: score 3 entry has no public_summary | Below-threshold skip |
| `/journal:publish` skips already-humanized entries | Publish idempotency |
| `/journal:publish --force` regenerates all entries | Force flag |

All tests mock Haiku via `globalThis.fetch`. No real API calls.

## Dependencies

- `node:crypto` (for sha256 hash -- built-in, no new packages)
- Native `fetch` for Haiku API calls (built-in Node 18+)
- Existing `ANTHROPIC_API_KEY` env var
- No new npm dependencies
