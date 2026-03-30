# BuildLoud Configuration

<!-- This file is created by /journey-init at ~/.claude/journey/config.md -->
<!-- Copy this template and fill in your own values to get started. -->

## Voice
<!-- Describe your writing style. How do you talk when sharing what you build? -->
Direct, honest, first-person. Short sentences.

## Examples
<!-- 2-3 examples of posts you've written or would write about your work -->
- "Built the entire auth system in one afternoon. Claude Code handled the boilerplate, I handled the decisions."
- "Three days stuck on a race condition. Turned out to be a one-line fix."

## What I never say
<!-- Phrases to avoid in generated content -->
- "Excited to announce"
- "Thrilled to share"
- "On this journey"

## Preferences
- notification: silent
- platforms: twitter, linkedin
- score_threshold: 5
- mode: basic

## Hook Mode

<!-- Controls what happens when the Stop hook processes your session. -->
<!-- Set via the `mode` field under Preferences above. -->

<!-- **basic** (default) — Score and write journal entries locally. No AI rewriting. -->
<!--   Best for: quiet capture, review entries later with /journal-review. -->

<!-- **enhanced** — Same as basic, plus prints a nudge at session end listing -->
<!--   how many high-score entries are ready for voice rewriting. -->
<!--   Best for: awareness without interruption. -->

<!-- **full** — Same as enhanced, plus outputs a rewrite prompt with your voice -->
<!--   profile so Claude can rewrite entries in your style during the session. -->
<!--   Best for: end-to-end automation, publish-ready drafts on every session. -->
