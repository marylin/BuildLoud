---
name: journal-digest
description: Generate a weekly narrative summary of your building activity.
---

# /journal-digest — Weekly Digest

## Guard
Before executing, check if `~/.claude/journey/config.md` exists. If not, run `/journey-init` first.

## Steps

1. **Determine date range:**
   - Default: last 7 days
   - `--week YYYY-WNN`: specific ISO week
   - `--days N`: last N days

2. **Read entries.** Read all markdown files in range from `~/.claude/journey/entries/YYYY/MM/YYYY-MM-DD.md`. Parse each entry: time, project, type, score, summary.

3. **Read voice profile** from `~/.claude/journey/config.md`.

4. **Write the digest** in the user's voice. Include:
   - **Week summary** — 2-3 sentences on themes, energy, what the week felt like
   - **Top moments** — the 3-5 highest-scoring entries with one sentence each on why they matter
   - **Projects touched** — list with session counts
   - **Streak report** — any persistence milestones (3+ consecutive days)
   - **Content ready** — count of entries scoring 7+ that could be published

5. **Save to** `~/.claude/journey/weekly/YYYY-WNN.md`

6. **Show the digest** in the terminal for review.

## Arguments

- No args: last 7 days
- `--week YYYY-WNN`: specific week
- `--days N`: custom range

## Rules

- Do NOT send email. Output and save only.
- Do NOT query any database. Read from markdown files only.
- Keep the digest to one page max.
- Use the user's voice from config for the narrative sections.
