---
name: journal-publish
description: Rewrite journal entries in your voice for Twitter, LinkedIn, or blog.
---

# /journal-publish -- Publish-Ready Content

## Guard
Before executing, check if `~/.claude/journey/config.md` exists. If not, run `/journey-init` first.

## Steps

1. **Read voice profile** from `~/.claude/journey/config.md`. If a per-repo override exists at `.claude/journey.md`, apply it.

2. **Find entries to publish.** Either:
   - User specifies entry numbers (from `/journal-review`)
   - Default: scan `~/.claude/journey/entries/YYYY/MM/DD/*/raw.md` for the last 7 days, show entries scoring 5+, ask which to publish

3. **Rewrite each selected entry** in the user's voice for their target platform(s):
   - **Twitter:** Hook + one punch line. Under 280 characters. Build-in-public energy.
   - **LinkedIn:** 3-4 sentences. Insight-driven. Shows the thinking, not just the doing.
   - **Blog:** Full narrative with context. 2-3 paragraphs.

   Rules for rewriting:
   - Focus on OUTCOMES and WHY, not technical HOW
   - Replace jargon with plain language
   - Include the emotional arc if present (struggle -> breakthrough -> win)
   - Match the user's voice from config (tone, sentence length, personality)
   - Do NOT use phrases listed in "What I never say"
   - Do NOT invent details beyond what the entry contains

4. **Output copy-paste blocks:**
   ```
   --- twitter ---
   [text]
   --- end ---

   --- linkedin ---
   [text]
   --- end ---
   ```

5. **Accept conversational tweaks:**
   - "make it punchier"
   - "add the AI angle"
   - "less sarcastic"
   - "shorter"
   -> Rewrite and show updated version.

6. **Save published versions** -- if user confirms, write each platform to its own file:
   - Path: `~/.claude/journey/entries/YYYY/MM/DD/project/{platform}.md`
   - Each file has frontmatter: project, platform, date, source: raw.md
   - If file exists: ask overwrite or skip. `--force` skips the question.
   - Raw entry (`raw.md`) stays clean -- no blockquotes appended.

## Arguments

- No args: last 7 days, score 5+
- `--days N`: last N days
- `--force`: overwrite existing published files without asking
- Other text: tone/angle hint ("angle toward developers", "more casual")

## Rules

- Do NOT post anywhere. Output text only.
- Do NOT use any external API. You ARE the writer.
- One rewrite per entry unless user asks for variations.
- The output should be 80-90% ready to post -- user just reviews and hits send.
