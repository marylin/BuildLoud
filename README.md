<p align="center">
  <h1 align="center">BuildLoud</h1>
  <p align="center">
    <strong>You build. BuildLoud documents it.</strong>
  </p>
  <p align="center">
    <a href="https://github.com/marylin/buildloud/actions/workflows/ci.yml"><img src="https://github.com/marylin/buildloud/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL-3.0"></a>
    <img src="https://img.shields.io/badge/version-1.0.1-green.svg" alt="Version 1.0.1">
    <img src="https://img.shields.io/badge/tests-117%20passing-brightgreen.svg" alt="117 tests passing">
    <img src="https://img.shields.io/badge/node-20%2B-green.svg" alt="Node.js 20+">
    <img src="https://img.shields.io/badge/dependencies-0-brightgreen.svg" alt="Zero Dependencies">
    <img src="https://img.shields.io/badge/Claude%20Code-plugin-8A2BE2.svg" alt="Claude Code Plugin">
  </p>
</p>

Every commit you make, every PR you land, BuildLoud captures it and writes a journal entry in your voice. No setup beyond install. No API keys. No database. Just code normally and your build-in-public content writes itself.

```
you commit code
  -> hooks capture commits and PRs to a session file
    -> BuildLoud scores the session and writes a journal entry
      -> high-scoring entries become ready-to-post content
```

## The Problem

You want to build in public but you don't want to stop coding to write about coding. By the time the session ends, you've forgotten the interesting parts. And writing "shipped auth today" doesn't capture the struggle, the insight, or the thing that would actually resonate with people.

## The Fix

BuildLoud hooks into your Claude Code sessions. It captures what you did, scores it for shareability (0-10), and writes journal entries that sound like you, not like a robot. When something scores high enough, you rewrite it for Twitter, LinkedIn, or your blog with one command. The raw material is always there, automatically.

## Install

```bash
# Add the marketplace source
/plugin marketplace add marylin/buildloud

# Install the plugin (hooks auto-register)
/plugin install buildloud@buildloud

# Set up your voice profile
/journey-init

# That's it. Code normally. BuildLoud captures everything.
```

## What You Get

| Feature | How |
|---------|-----|
| **Auto-capture** | Hooks log every commit and PR silently to a session file |
| **Scoring** | Deterministic 0-10 score. Milestones, insights, and manual entries score highest |
| **Voice profile** | Entries written in YOUR voice. Sarcastic? Technical? Bilingual? It matches |
| **Publish pipeline** | `/journal-publish` rewrites entries for Twitter, LinkedIn, or blog |
| **Weekly digest** | `/journal-digest` generates a narrative summary of your week |
| **Obsidian integration** | Optional junction links entries into your vault |
| **Zero dependencies** | No npm packages. No API keys. No database. Node.js built-ins only |
| **Crash-proof** | All hooks exit 0. If anything breaks, your entries are preserved as-is |

## Skills

| Command | What It Does |
|---------|-------------|
| `/journey-init` | Set up voice profile, notifications, platforms |
| `/journal <text>` | Log an entry (quick mode with scoring) |
| `/journal` | Log an entry (guided mode, asks what happened) |
| `/j <text>` | Shortcut for `/journal` |
| `/journal-review` | Browse and curate entries by score tier |
| `/journal-publish` | Rewrite entries for Twitter, LinkedIn, or blog |
| `/journal-digest` | Generate weekly narrative summary |

## CLI

```bash
journey log "shipped auth" --type feature    # Manual entry with scoring
journey status                               # Streaks, counts, pending sessions
journey search "auth"                        # Search journal entries
journey doctor                               # Health check: hooks, config, cache
journey recover                              # Process orphaned session files
```

## Scoring

No AI. Every entry gets a deterministic 0-10 score:

| Signal | Points |
|--------|--------|
| Milestone type (shipped, launched) | +4 |
| Insight or blocker | +3 |
| Manually logged via `/journal` | +3 |
| Feature | +2 |
| New project (first entry) | +2 |
| Milestone detected (streak, volume) | +2 |
| Bugfix, refactor, infra | +1 |
| Insight phrases in summary | +1 |
| Hot project (3+ sessions/week) | +1 |

**7+** = ready to share. **5-6** = solid, digest-worthy. **Below 5** = journal-only.

## Processing Modes

Configured in `~/.claude/journey/config.md`:

| Mode | Token Cost | What Happens |
|------|------------|--------------|
| **basic** (default) | 0 | Raw commit summaries, deterministic scoring |
| **enhanced** | ~200-500/session | Notifies about high-score entries for voice rewriting |
| **full** | ~1000-5000/session | Agent rewrites entries with tool access |

All modes save raw entries first. If AI rewriting fails, entries are preserved as-is.

## Voice Profile

`/journey-init` captures how you write:

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

Everything is local. Nothing leaves your machine.

- **Stored at**: `~/.claude/journey/` (markdown files + JSON cache)
- **Captured**: commit messages, PR titles, timestamps, project names
- **NOT captured**: diffs, file contents, credentials, environment variables
- **No network**: zero telemetry, zero cloud sync, zero external API calls

```
~/.claude/journey/
  entries/YYYY/MM/DD/project/raw.md       # Journal entries
  entries/YYYY/MM/DD/project/twitter.md   # Published versions
  weekly/YYYY-WNN.md                      # Weekly digests
  cache.json                              # Streaks, fingerprints, stats
  config.md                               # Your voice profile
```

## Requirements

- **Node.js 20+** (uses `import.meta.dirname`, `node:test`, `parseArgs`)
- **Claude Code** (hooks and skills run inside it)
- Zero runtime dependencies. No API keys. No accounts.

## Uninstall

```bash
# Remove the plugin
/plugin uninstall buildloud

# Remove your journal data (optional)
rm -rf ~/.claude/journey/ ~/.claude/journey-sessions/
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, testing, and code style.

## License

[AGPL-3.0](LICENSE) -- Copyright 2026 [Marylin Alarcon](https://github.com/marylin)
