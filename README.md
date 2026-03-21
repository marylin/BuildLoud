# Journey Logger (build-log)

Zero-latency build-in-public journal for Claude Code. Auto-captures session summaries and PR events via hooks, supports manual capture via `/journal`, and feeds high-scoring entries to seo-engine for content amplification.

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
│  build-log/2026/03/20.md   │    structured, queryable     │
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

## Setup

1. **Environment:** Copy `.env.example` to `.env` and fill in credentials:
   ```bash
   cp .env.example .env
   ```
2. **Database:** Run the migration in the Neon SQL Editor (or via psql):
   ```
   migrations/001-journey-entries.sql
   ```
3. **Hooks:** Auto-registered in `~/.claude/settings.json`:
   - `PostToolUse` on `git commit` — runs `journey-accumulate.sh` (appends commit data to JSONL)
   - `Stop` — runs `journey-capture.js` async (Haiku summary → score → write entry)
4. **n8n workflows** (optional): Import from `n8n/` directory — see `n8n/README.md`

## Usage

- **Auto-capture:** Just use Claude Code normally. Sessions with commits produce entries in `YYYY/MM/` after the session ends.
- **Manual:** `/journal your note here` or `/j your note here`
- **Browse:** Open daily files like `2026/03/2026-03-20.md`
- **Weekly digest:** `node scripts/generate-digest.js` or auto via n8n (Monday 8 AM)
- **Sync PR entries:** `node scripts/sync-pr-entries.js`

## File Structure

```
build-log/
├── lib/
│   ├── cache.js              # Local cache for scoring + milestones
│   ├── config.json           # Tenant routing table + settings
│   ├── env.js                # Shared .env loader (no external deps)
│   ├── markdown.js           # Write entries to daily markdown files
│   ├── score.js              # Deterministic scoring + milestone detection
│   ├── seo-feed.js           # Push high-scoring entries to seo-engine
│   ├── db.js                 # Neon serverless client + retry queue
│   └── write-entry.js        # Orchestrator: score → markdown → db → seo-feed
├── scripts/
│   ├── journey-accumulate.sh # PostToolUse hook: grep commit → append JSONL
│   ├── journey-capture.js    # Stop hook: Haiku summary → write-entry pipeline
│   ├── generate-digest.js    # Weekly digest generator
│   └── sync-pr-entries.js    # Pull PR entries from Neon → local markdown
├── migrations/
│   └── 001-journey-entries.sql
├── n8n/
│   └── README.md             # Instructions for n8n workflow setup
├── tests/
│   ├── cache.test.js
│   ├── integration.test.js
│   ├── markdown.test.js
│   ├── score.test.js
│   ├── seo-feed.test.js
│   ├── db.test.js
│   └── write-entry.test.js
├── weekly/                   # Weekly digest output (YYYY-WXX.md)
├── .env.example
├── .gitignore
├── package.json
└── README.md
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

## Dependencies

- **Node.js 18+** (native `fetch`, `node:test`, `node:fs`)
- **Neon PostgreSQL database** with `journey_entries` table
- **Anthropic API key** (Haiku for session summarization + weekly digests)
- **`@neondatabase/serverless`** — the only external dependency
