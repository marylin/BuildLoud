# BuildLoud

![CI](https://github.com/marylin/buildloud/actions/workflows/ci.yml/badge.svg)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](package.json)

**Auto-capture your coding sessions into a build-in-public journal.**

```
you commit code
  -> hooks silently log commits and PRs to a session file
    -> BuildLoud scores and writes a journal entry in your voice
```

## Quickstart

```bash
# 1. Clone (npm coming soon)
git clone https://github.com/marylin/buildloud.git

# 2. Add the Claude Code plugin
/plugin add github:marylin/buildloud/buildloud-skills

# 3. Set up your voice profile
/journey-init

# 4. Code normally — hooks capture everything automatically

# 5. Check your journal
journey status
```

Merge [`hooks.example.json`](hooks.example.json) into `~/.claude/settings.json` to enable automatic capture. Replace `$BUILDLOUD_PATH` with your clone path.

## Processing Modes

Configured in `~/.claude/journey/config.md`:

| Mode | AI Usage | Token Cost | What Happens |
|------|----------|------------|--------------|
| **basic** (default) | None | 0 | Raw commit summaries, deterministic scoring |
| **enhanced** | Prompt | ~200-500/session | Notifies about high-score entries for voice rewriting |
| **full** | Agent | ~1000-5000/session | Agent rewrites entries with tool access for richer context |

All modes save raw entries first. If AI rewriting fails, entries are preserved as-is.

```markdown
## Hook Mode
- mode: enhanced
```

## Skills

| Command | Description |
|---------|-------------|
| `/journey-init` | Set up voice profile, notifications, platforms |
| `/journal <text>` | Log an entry (quick mode) |
| `/journal` | Log an entry (guided -- asks what happened) |
| `/j <text>` | Shortcut for `/journal` |
| `/journal-review` | Browse and curate entries by score |
| `/journal-publish` | Rewrite entries for Twitter, LinkedIn, or blog |
| `/journal-digest` | Generate weekly narrative summary |

## CLI Commands

```bash
journey log "shipped auth" --type feature    # Manual entry with scoring
journey status                               # Streaks, counts, pending sessions
journey search "auth"                        # Search journal entries
journey doctor                               # Check hooks, config, cache health
journey recover                              # Process orphaned session files
journey process-session --file PATH          # Score session data (used by hooks)
```

Example output from `journey status`:

```
BuildLoud Status
  Current streak: 5 days
  Longest streak: 12 days
  Total entries:  47
  Pending:        2 sessions
  Last entry:     2026-03-29
```

## Hook Configuration

BuildLoud uses four hooks in `~/.claude/settings.json`:

| Hook | Trigger | What It Does |
|------|---------|--------------|
| **PostToolUse** | `Bash(git commit*)` | Appends commit data to the session JSONL file |
| **PostToolUse** | `Bash(gh pr *)\|Bash(git merge*)` | Flags PRs and merges as notable events |
| **Stop** | Session ends | Scores the session and writes journal entries |
| **SessionStart** | Session starts | Nudges about unreviewed high-score entries |

All hooks are `command` type, exit 0 on all paths (crash-proof), and run with 3-10s timeouts. See [`hooks.example.json`](hooks.example.json) for the full configuration.

## Scoring

Deterministic, no AI. Every entry gets a 0-10 score based on heuristics:

| Signal | Points |
|--------|--------|
| Milestone keyword (shipped, launched) | +4 |
| Insight or blocker | +3 |
| Manually logged via `/journal` | +3 |
| Feature | +2 |
| New project (first entry) | +2 |
| Milestone detected (streak, volume) | +2 |
| Bugfix, refactor, infra | +1 |
| Insight phrases | +1 |
| Hot project (3+ sessions/week) | +1 |

- **7+** = ready to share
- **5-6** = solid work, digest-worthy
- **Below 5** = journal-only

## Voice Profile

`/journey-init` captures how you write. Stored in `~/.claude/journey/config.md`:

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

Per-repo overrides via `.claude/journey.md`.

## Data and Privacy

- **All data is local**: `~/.claude/journey/` -- markdown files and JSON cache
- **What's captured**: commit messages, PR titles, timestamps, project names
- **What's NOT captured**: diffs, file contents, credentials, environment variables
- **Nothing is sent anywhere**: no telemetry, no cloud sync, no external API calls
- **Git-trackable**: add `~/.claude/journey/` to a repo if you want version history

```
~/.claude/journey/
  entries/YYYY/MM/YYYY-MM-DD.md   # Journal entries (one file per day)
  weekly/YYYY-WNN.md              # Weekly digests
  cache.json                      # Streaks, fingerprints, project stats
  config.md                       # Your voice profile
  errors.log                      # Error log with rotation
```

## Project Structure

```
buildloud/
  bin/journey.js                  # CLI entry point (6 commands)
  lib/
    score.js                      # Deterministic scoring + milestones
    cache.js                      # Streaks, fingerprints, local state
    markdown.js                   # Daily markdown file writer
    errors.js                     # Error logging with rotation
    cli/                          # CLI command implementations
  scripts/
    journey-accumulate.sh         # Hook: capture git commits
    journey-notable.sh            # Hook: capture PRs and merges
    journey-stop.sh               # Hook: session-end scoring
    journey-sessionstart.sh       # Hook: session-start nudge
  buildloud-skills/               # Claude Code plugin (6 skills)
  tests/                          # 107 tests, 19 suites
  hooks.example.json              # Hook configuration template
  config.example.md               # Voice profile template
  package.json                    # Zero dependencies
```

## Requirements

- **Node.js 18+** (uses native `node:test`, `parseArgs`)
- **Claude Code** (hooks and skills run inside it)
- Zero runtime dependencies. No API keys. No accounts.

## License

[AGPL-3.0](LICENSE) -- Copyright 2026 [Marylin Alarcon](https://github.com/marylin)
