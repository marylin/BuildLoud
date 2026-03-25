---
name: journal-publish
description: Use when preparing journal entries for social media, blog, or newsletter — browsing high-scoring entries and generating public-ready versions.
---

# /journal-publish — Publish-Ready Journal Content

Browse recent high-scoring entries and generate public-ready versions for social media.

## Path Resolution

`$JL_PATH`: `$JOURNEY_LOGGER_PATH` env var, or the parent directory of this skill file.

## Steps

1. **List candidates** — run `node $JL_PATH/bin/journey.js rehumanize` to show entries needing humanization.

2. **Show ready entries** — read the last 7 days of markdown from `$JL_PATH/YYYY/MM/` and find entries with `> Public:` blockquotes (already humanized). Display:
   ```
   [ready]  Project (score X) — "public summary preview..."
   [pending] Project (score X) — "raw summary..."
   ```

3. **Ask user** what to do:
   - "publish all" — humanize pending entries, show all
   - Pick by number to refine with a hint
   - `--force` regenerates all

4. **Humanize pending entries** — run `node $JL_PATH/bin/journey.js rehumanize --run`

5. **Output copy-paste text** for each entry:
   ```
   ---
   Platform: linkedin | Project: Name | Score: 8

   [the public summary text]
   ---
   ```

6. Do NOT post anywhere. Output text only.

## Arguments

- No args: last 7 days
- `--days N`: last N days
- `--force`: regenerate all regardless of cache
- Other text: hint for humanization ("angle toward developers")
