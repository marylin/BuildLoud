# Privacy Policy

**BuildLoud** is a local-only tool. This policy explains what data it handles and how.

## What BuildLoud Captures

- **Git commit messages** — the text you write in `git commit -m "..."`
- **PR titles** — from `gh pr create --title "..."`
- **Timestamps** — when commits and PRs happen
- **Project names** — the basename of your working directory

## What BuildLoud Does NOT Capture

- Source code, diffs, or file contents
- Environment variables or secrets
- API keys, tokens, or credentials
- Personal information beyond what you write in commit messages

## Where Data is Stored

All data stays on your machine:

```
~/.claude/journey/
  entries/     — journal entries (markdown files)
  cache.json   — streaks, scores, project stats
  config.md    — your voice profile
  errors.log   — error log
```

**Nothing is sent to any server.** BuildLoud makes zero network requests. There is no telemetry, analytics, cloud sync, or external API calls.

## Processing Modes

- **Basic mode** (default): All processing is deterministic. No AI model is invoked. Zero tokens used.
- **Enhanced/Full modes** (opt-in): Claude Code's built-in model rewrites entries in your voice. This uses your existing Claude Code session — no additional API calls to external services.

## Voice Profile

If you run `/journey-init`, BuildLoud stores your writing style preferences in `~/.claude/journey/config.md`. This file lives only on your machine, is never transmitted anywhere, and can be deleted at any time.

## Third-Party Services

BuildLoud uses **no third-party services**. Zero dependencies, zero external calls.

## Data Deletion

Delete all BuildLoud data:

```bash
rm -rf ~/.claude/journey/ ~/.claude/journey-sessions/
```

## Contact

Questions about privacy: [Marylin Alarcon](https://github.com/marylin)

## Changes

This policy may be updated with new releases. Check the [repository](https://github.com/marylin/buildloud) for the latest version.
