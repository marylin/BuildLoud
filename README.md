# Journey Logger

![CI](https://github.com/marylin/journey-logger/actions/workflows/ci.yml/badge.svg)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-green.svg)](https://nodejs.org)

Zero-latency build-in-public journal for [Claude Code](https://claude.ai/claude-code). Auto-captures coding session summaries via hooks, supports manual capture via `/journal`, and optionally feeds high-scoring entries to content pipelines.

## Getting Started

1. Clone and install: `npm install`
2. Copy `.env.example` to `.env` and fill in values
3. Run `journey doctor` to verify your setup

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

### Claude Code Skills (Optional)

Install the skill pack for `/journal`, `/j`, and `/journal-publish` commands:

```bash
/plugin add github:marylin/journey-logger/journey-logger-skills
```

See [`journey-logger-skills/README.md`](journey-logger-skills/README.md) for details.

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

## Environment Variables

| Variable | Required | What it enables |
|----------|----------|-----------------|
| `DATABASE_URL` | No | DB sync, search --db, top, digest |
| `ANTHROPIC_API_KEY` | No | Humanization (public-ready rewrites) |
| `SEO_ENGINE_PATH` | No | Push high-scoring entries to seo-engine |
| `RESEND_API_KEY` | No | Email delivery for weekly digests |
| `DIGEST_EMAIL` | No | Recipient for digest emails |
| `DIGEST_FROM_EMAIL` | No | Sender address for digest emails |

All features degrade gracefully — the tool works with zero env vars configured.

## Usage

- **Auto-capture:** Use Claude Code normally. Sessions with commits produce journal entries automatically.
- **Manual capture:** `/journal shipped auth module — key insight: middleware order matters`
- **Quick alias:** `/j your note here`
- **Browse journal:** Open `2026/03/2026-03-20.md` in your editor
- **Weekly digest:** `node scripts/generate-digest.js` (or auto via n8n)
- **Sync PR entries:** `node scripts/sync-pr-entries.js`

## CLI

Journey Logger includes a CLI for querying entries and managing pipeline health. Install globally with `npm link` or run via `npx journey`.

```bash
# Pipeline health
journey status              # Local health: last capture, streak, queue, errors
journey status --db         # Include DB connectivity check

# Query entries
journey top                 # Top 10 entries this week
journey top --month         # Top 10 this month
journey top --all -n 20     # Top 20 all time
journey search <query>      # Search local markdown files
journey search <query> --db # Also search DB

# Sync
journey sync status         # Show local/DB/queue counts
journey sync pull           # Pull DB entries to local markdown
journey sync push           # Push pending queue entries to DB

# Content
journey rehumanize          # List entries needing humanization
journey rehumanize --run    # Execute humanization via Haiku
journey digest              # Generate weekly digest
journey digest --preview    # Preview without generating
journey digest --email      # Generate and send via email
```

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

**Setup:**
1. Set `SEO_ENGINE_PATH` in `.env` to point to your seo-engine directory
2. In `lib/config.json`, add project names to `branded_projects` — these route to the `whateverai` tenant. All other projects route to `default_tenant`.

**How it works:**
- Entries scoring 7+ (configurable via `seo_score_threshold` in config.json) are appended to the tenant's `topic-seeds.md`
- The raw `summary` is pushed (not the humanized version) — seo-engine handles content enhancement and publishing
- If `topic-seeds.md` doesn't exist in the tenant directory, the push silently skips — seo-engine manages its own tenant setup

**Without `SEO_ENGINE_PATH`**, the integration is silently disabled. No errors, no side effects.

## File Structure

```
journey-logger/
├── bin/
│   └── journey.js            # CLI entrypoint (npm link → `journey` command)
├── lib/
│   ├── cli/
│   │   ├── status.js         # `journey status` — pipeline health
│   │   ├── top.js            # `journey top` — top entries by score
│   │   ├── search.js         # `journey search` — full-text search
│   │   ├── sync.js           # `journey sync` — local/DB sync operations
│   │   ├── rehumanize.js     # `journey rehumanize` — re-run humanization
│   │   └── digest.js         # `journey digest` — weekly digest generation
│   ├── cache.js              # Local cache for scoring + milestones
│   ├── config.example.json   # Template config (copy to config.json)
│   ├── db.js                 # Neon serverless client + retry queue
│   ├── env.js                # Shared .env loader (no external deps)
│   ├── errors.js             # Shared error types and handling utilities
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
├── journey-logger-skills/       # Claude Code skill pack (installable)
│   ├── README.md               # Skill pack docs + install instructions
│   ├── journal.md              # /journal — manual journal entry
│   ├── j.md                    # /j — shortcut alias
│   └── journal-publish.md      # /journal-publish — publish-ready content
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

## Troubleshooting

- Run `journey doctor` for a full diagnostic check
- Error logs: `~/.claude/journey-errors.log`
- Queue stuck? Check `journey sync status` and `journey sync push`
- Cache issues? Delete `lib/cache.json` (auto-recreated)

## Dependencies

- **Node.js 18+** (native `fetch`, `node:test`)
- **[Neon](https://neon.tech)** PostgreSQL database
- **[Anthropic](https://console.anthropic.com)** API key (Haiku model)
- **`@neondatabase/serverless`** — the only npm dependency

## License

[AGPL-3.0](LICENSE) — Copyright 2026 WhateverAI (Marylin Ritchie)
