# Journey Logger

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org)

Zero-latency build-in-public journal for [Claude Code](https://claude.ai/claude-code). Auto-captures coding session summaries via hooks, supports manual capture via `/journal`, and optionally feeds high-scoring entries to content pipelines.

## How It Works

1. **You code normally.** Claude Code hooks silently track commits during your session.
2. **Session ends.** The Stop hook summarizes what happened via Claude Haiku and writes a journal entry.
3. **Entries are scored.** A deterministic scoring system (0-10) flags wins, insights, milestones.
4. **You browse your journal.** Daily markdown files at `YYYY/MM/YYYY-MM-DD.md`.
5. **Weekly digest.** Top moments compiled and emailed to you every Monday.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    CAPTURE LAYER                         │
│  Stop Hook + Accumulator │ PR Hook (n8n) │ /journal     │
└──────────┬───────────────────┬───────────────┬──────────┘
           │                   │               │
           ▼                   ▼               ▼
┌─────────────────────────────────────────────────────────┐
│                    STORAGE LAYER                         │
│  Local Markdown Journal    │    Neon DB (journey_entries)    │
│  2026/03/2026-03-20.md     │    structured, queryable       │
└──────────┬───────────────────────────────┬──────────────┘
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│                 INTELLIGENCE LAYER                        │
│  Social-worthiness scoring │ Milestone detection          │
└──────────┬───────────────────────────────┬──────────────┘
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│                    OUTPUT LAYER                           │
│  Weekly Digest (n8n)  │  seo-engine topic-seeds feed     │
└─────────────────────────────────────────────────────────┘
```

## Installation

```bash
git clone https://github.com/marylin/journey-logger.git
cd journey-logger
npm install
```

## Setup

1. **Environment:**
   ```bash
   cp .env.example .env
   # Edit .env — set DATABASE_URL and ANTHROPIC_API_KEY (required)
   ```

2. **Config:**
   ```bash
   cp lib/config.example.json lib/config.json
   # Edit lib/config.json — add your project names to branded_projects
   ```

3. **Database:** Run `migrations/001-journey-entries.sql` in the [Neon SQL Editor](https://console.neon.tech)

4. **Claude Code Hooks:** Merge the entries from `hooks.example.json` into your `~/.claude/settings.json`. Replace `/path/to/journey-logger` with the actual path to your clone.

   See `hooks.example.json` for the exact configuration.

5. **n8n Workflows** (optional): See `n8n/README.md` for PR hook and weekly digest automation.

## Usage

- **Auto-capture:** Use Claude Code normally. Sessions with commits produce journal entries automatically.
- **Manual capture:** `/journal shipped auth module — key insight: middleware order matters`
- **Quick alias:** `/j your note here`
- **Browse journal:** Open `2026/03/2026-03-20.md` in your editor
- **Weekly digest:** `node scripts/generate-digest.js` (or auto via n8n)
- **Sync PR entries:** `node scripts/sync-pr-entries.js`

## Scoring

Deterministic scoring on entry creation. No AI calls.

| Signal | Points |
|--------|--------|
| Type: `milestone` | +4 |
| Type: `insight` or `blocker` | +3 |
| Type: `feature` | +2 |
| Type: `bugfix`, `refactor`, or `infra` | +1 |
| Manually logged via `/journal` | +3 |
| Notable flag (milestone detected) | +2 |
| New project or tool | +2 |
| Contains insight phrases | +1 |
| Hot project (3+ sessions/week) | +1 |

**Thresholds:**

| Score | Action |
|-------|--------|
| **7+** | Auto-push to seo-engine topic-seeds |
| **5-6** | Included in weekly digest |
| **0-4** | Journal only |

## seo-engine Integration (Optional)

If you run [seo-engine](https://github.com/marylin/seo-engine) for content automation, Journey Logger can auto-feed high-scoring entries as topic seeds.

Set `SEO_ENGINE_PATH` in `.env` to point to your seo-engine directory. Entries scoring 7+ are appended to the appropriate tenant's `topic-seeds.md`. Without this env var, the integration is silently disabled.

## File Structure

```
journey-logger/
├── lib/
│   ├── cache.js              # Local cache for scoring + milestones
│   ├── config.example.json   # Template config (copy to config.json)
│   ├── db.js                 # Neon serverless client + retry queue
│   ├── env.js                # Shared .env loader (no external deps)
│   ├── humanize.js           # Human-readable formatting utilities
│   ├── markdown.js           # Write entries to daily markdown files
│   ├── score.js              # Deterministic scoring + milestone detection
│   ├── seo-feed.js           # Push high-scoring entries to seo-engine
│   └── write-entry.js        # Orchestrator: score → markdown → db → seo-feed
├── scripts/
│   ├── journey-accumulate.sh # PostToolUse hook: grep commit → append JSONL
│   ├── journey-capture.js    # Stop hook: Haiku summary → write-entry pipeline
│   ├── generate-digest.js    # Weekly digest generator
│   └── sync-pr-entries.js    # Pull PR entries from Neon → local markdown
├── migrations/
│   └── 001-journey-entries.sql
├── n8n/
│   ├── README.md             # Instructions for n8n workflow setup
│   ├── journey-pr-hook.json
│   └── journey-weekly-digest.json
├── tests/
│   ├── cache.test.js
│   ├── db.test.js
│   ├── humanize.test.js
│   ├── integration.test.js
│   ├── markdown.test.js
│   ├── score.test.js
│   ├── seo-feed.test.js
│   └── write-entry.test.js
├── .env.example
├── .gitignore
├── .node-version
├── hooks.example.json        # Claude Code hook config (merge into settings.json)
├── package.json
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
└── README.md
```

## Dependencies

- **Node.js 18+** (native `fetch`, `node:test`)
- **[Neon](https://neon.tech)** PostgreSQL database
- **[Anthropic](https://console.anthropic.com)** API key (Haiku model)
- **`@neondatabase/serverless`** — the only npm dependency

## License

[AGPL-3.0](LICENSE) — Copyright 2026 WhateverAI (Marylin Ritchie)
