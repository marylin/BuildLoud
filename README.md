# Journey Logger

![CI](https://github.com/marylin/journey-logger/actions/workflows/ci.yml/badge.svg)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

**You build. Journey Logger documents it.**

A Claude Code plugin that automatically captures your coding sessions into a build-in-public journal. Every commit, every PR, every breakthrough — scored, timestamped, and written in your voice. No API keys. No database. No configuration beyond "clone and go."

```
You code normally
  → hooks capture commits and PRs silently
    → Claude scores and writes a journal entry in your voice
      → you review, curate, publish when ready
```

## Why

You ship features at 2am. You crack a bug after three hours. You accidentally build something bigger than planned. These are the moments that make great build-in-public content — and you forget all of them by morning.

Journey Logger watches your Claude Code sessions and captures these moments automatically. When you're ready to share, your entries are already 80-90% post-ready in your voice.

## Install

```bash
git clone https://github.com/marylin/journey-logger.git
cd journey-logger
```

That's it. No `npm install`. Zero dependencies.

### Add the Claude Code plugin

```bash
/plugin add github:marylin/journey-logger/journey-logger-skills
```

Then run `/journey-init` to set up your voice profile.

### Add hooks for automatic capture

Merge the entries from [`hooks.example.json`](hooks.example.json) into `~/.claude/settings.json`. Replace `$JOURNEY_LOGGER_PATH` with your clone path.

## How It Works

**Three layers, zero external services:**

```
HOOKS (automatic — you never think about these)
  git commit     → captures commit to session file
  gh pr / merge  → flags notable events
  session ends   → Claude scores + writes entry in your voice

SKILLS (on-demand — you invoke when ready)
  /journal         → log a moment manually
  /journal-review  → browse and curate entries by score
  /journal-publish → rewrite entries for Twitter/LinkedIn/blog
  /journal-digest  → weekly narrative summary

CLI (local queries — instant, offline)
  journey status   → streaks, counts, pending sessions
  journey search   → grep your journal
  journey doctor   → verify your setup
  journey recover  → rescue orphaned sessions
```

**All data lives in `~/.claude/journey/` as markdown files.** No database. No cloud sync. Git-trackable if you want, invisible if you don't.

## Scoring

Every entry gets a score from 0-10. No AI — pure heuristics:

| Signal | Points |
|--------|--------|
| Milestone (shipped, launched) | +4 |
| Insight or blocker | +3 |
| Feature | +2 |
| Bugfix, refactor, infra | +1 |
| Manually logged via `/journal` | +3 |
| Milestone detected (streak, new project) | +2 |
| First entry for a project | +2 |
| Contains insight phrases | +1 |
| Hot project (3+ sessions/week) | +1 |

**Score 7+** = ready to share. **Score 5-6** = solid work, digest-worthy. **Below 5** = journal only.

## Voice Profile

On first run, `/journey-init` asks how you write. Your answers become `~/.claude/journey/config.md`:

```markdown
## Voice
Sarcastic, honest, first-person. Short sentences.

## Examples
- "Fifteen hours later I have a full orchestration platform."
- "The finance aesthetic we should have had from day one."

## What I never say
- "Excited to announce"
- "Thrilled to share"
```

Every auto-generated entry matches your voice. Per-repo overrides via `.claude/journey.md`.

## Skills

| Command | What it does |
|---------|-------------|
| `/journey-init` | Set up voice, notifications, platforms |
| `/journal <text>` | Log an entry (quick mode) |
| `/journal` | Log an entry (guided — asks what happened) |
| `/j <text>` | Shortcut for `/journal` |
| `/journal-review` | Browse entries by score, curate, clean up |
| `/journal-publish` | Rewrite entries for Twitter, LinkedIn, or blog |
| `/journal-digest` | Generate weekly narrative summary |

## CLI

```bash
journey log "shipped auth" --type feature    # Manual entry with scoring
journey status                               # Streaks, counts, pending sessions
journey search "auth"                        # Search journal entries
journey doctor                               # Check hooks, config, cache health
journey recover                              # Process orphaned session files
```

## File Structure

```
journey-logger/
├── bin/journey.js              # CLI (6 commands)
├── lib/
│   ├── score.js                # Deterministic scoring + milestones
│   ├── cache.js                # Streaks, fingerprints, local state
│   ├── markdown.js             # Daily markdown file writer
│   ├── errors.js               # Error logging with rotation
│   └── cli/                    # CLI command implementations
├── scripts/
│   ├── journey-accumulate.sh   # Hook: capture git commits
│   └── journey-notable.sh     # Hook: capture PRs and merges
├── journey-logger-skills/      # Claude Code plugin (6 skills)
├── tests/                      # 102 tests, 17 suites
├── hooks.example.json          # Hook configuration template
├── config.example.md           # Voice profile template
└── package.json                # Zero dependencies
```

**Journal data** (not in this repo):
```
~/.claude/journey/
├── config.md                   # Your voice profile
├── entries/YYYY/MM/DD.md       # Journal entries
├── weekly/YYYY-WNN.md          # Digests
├── cache.json                  # Local state
└── errors.log                  # Error log
```

## Troubleshooting

```bash
journey doctor                  # Full diagnostic check
journey recover                 # Process orphaned sessions
```

- Error logs: `~/.claude/journey/errors.log`
- Cache issues? Delete `~/.claude/journey/cache.json` (auto-recreated)
- Hooks not firing? Check `journey doctor` for hook configuration status

## Requirements

- **Node.js 18+** (uses native `fetch`, `node:test`, `parseArgs`)
- **Claude Code** (the hooks and skills run inside it)
- That's it. No npm packages. No API keys. No accounts to create.

## License

[AGPL-3.0](LICENSE) — Copyright 2026 WhateverAI (Marylin Ritchie)
