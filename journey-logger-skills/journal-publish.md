# /journal-publish -- Publish-Ready Journal Content

Generate or refine public-ready versions of journal entries for social media, blog, or newsletter.

## Path Resolution

Determine the journey-logger installation path in this order:
1. If `$JOURNEY_LOGGER_PATH` env var is set, use that
2. Otherwise, use the parent directory of this skill file (the skill pack lives inside the journey-logger repo)

Store the resolved path as `JL_PATH` for use in commands below.

## Steps

1. Read the last 7 days of journal entries from `$JL_PATH/` markdown files (in the `YYYY/MM/` directory structure). Parse entries with `social_score >= 5`.

2. For each qualifying entry, check `metadata.public_summary`:
   - If present and `metadata.public_summary_version` matches the current summary hash: show as "ready"
   - If missing or hash mismatch: mark as "needs humanization"

3. Display a summary table:
   ```
   # Journal entries ready for publishing (last 7 days)

   [ready] Project (score X, linkedin) -- "public summary preview..."
   [needs humanization] Project (score X) -- "raw summary preview..."
   ```

4. Ask the user what they want to do:
   - "publish all" -- humanize any missing entries, show all public summaries
   - Pick specific entries by number to refine with a hint
   - "--force" regenerates all entries regardless of hash

5. For entries needing humanization or refinement, run:
   ```bash
   node --input-type=module -e "
   import { humanize } from '$JL_PATH/lib/humanize.js';
   const entry = { summary: '...', type: '...', project: '...', social_score: N, metadata: {} };
   const result = await humanize(entry, { force: FORCE_BOOL, hint: 'HINT_TEXT' });
   console.log(JSON.stringify(result));
   "
   ```

6. Output the final public-ready text for each selected entry:
   ```
   ---
   Platform: linkedin | Project: ProjectName | Score: 8

   [the public summary text, ready to copy-paste]
   ---
   ```

7. Do NOT post anywhere. Just output text for the user to copy.

## Arguments

- No args: show last 7 days
- `--days N`: show last N days
- `--force`: regenerate all public summaries regardless of cache
- Any other text: used as a hint for humanization ("angle toward developers", "make it punchier")
