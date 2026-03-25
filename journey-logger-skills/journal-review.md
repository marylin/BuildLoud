---
name: journal-review
description: Browse and curate captured journal entries — review what was captured, clean up low-value entries, pick entries to publish. Use when "review entries", "show journal", "what did I capture", or "clean up entries".
---

# /journal-review — Browse & Curate Entries

## Guard
Before executing, check if `~/.claude/journey/config.md` exists. If not, run `/journey-init` first.

## Steps

1. **Read recent entries.** Default: last 7 days. Read all markdown files from `~/.claude/journey/entries/YYYY/MM/YYYY-MM-DD.md` matching the date range. Parse each entry: time, project, type, score (⭐ = 5+), summary.

2. **Group by score tier and display:**

```
READY TO SHARE (score 7+)
  1. ⭐ 9 | camvia | Mar 24 — "Rebuilt the entire design system..."
  2. ⭐ 8 | whateverai | Mar 23 — "Shipped JWT auth in one session..."

SOLID WORK (score 5-6)
  3. ⭐ 6 | myapp | Mar 23 — "Fixed auth timeout edge case..."
  4. ⭐ 5 | tools | Mar 22 — "Added CLI argument parsing..."

JOURNAL ONLY (score < 5)
  5. 3 | myapp | Mar 22 — "Refactored test helpers"
  6. 1 | tools | Mar 21 — "Updated deps"
  7. 1 | tools | Mar 21 — "Fixed typo"
```

3. **Show backlog warning** if there are many entries:
   "You have N unreviewed entries. Want to bulk-clean entries below score 3?"

4. **Wait for user action:**
   - `"publish 1, 2"` → invoke `/journal-publish` with those entries
   - `"delete 5, 6, 7"` → remove those entries from the markdown file
   - `"merge 3 and 4"` → combine into one entry, keep the higher score
   - `"boost 3"` → rewrite entry with more energy using voice profile
   - `"next week"` / `"last month"` → change date range
   - `"clean"` → remove all entries below score 3

## Arguments

- No args: last 7 days
- `--days N`: last N days
- `--month`: last 30 days
- `--all`: everything

## Rules

- Do NOT modify entries without user action.
- Show counts per tier in the header.
- When deleting, actually remove the entry lines from the markdown file.
- When merging, combine summaries and keep the higher score.
