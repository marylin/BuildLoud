# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [2.0.0] - 2026-03-25

### Breaking Changes
- Removed Neon PostgreSQL database — markdown is the only storage layer
- Removed Anthropic API client — Claude Code agent hooks handle AI work natively
- Removed Resend email integration
- Removed seo-engine integration from core (push to external projects manually)
- Removed CLI commands: `top`, `sync`, `rehumanize`, `digest`
- Removed `@neondatabase/serverless` — zero npm dependencies
- Journal entries now stored at `~/.claude/journey/entries/` instead of project root
- `.env` file no longer needed — no API keys required

### Added
- `/journey-init` skill — first-run onboarding (voice profile, notifications, platforms)
- `/journal-review` skill — browse and curate entries by score tier
- `/journal-digest` skill — weekly narrative summary from markdown
- `journey recover` CLI command — process orphaned session files
- `journey process-session` CLI command — scoring pipeline for Stop agent hook
- `scripts/journey-notable.sh` — PostToolUse hook for PR/merge event capture
- Session-scoped JSONL files (`~/.claude/journey-sessions/{session-id}.jsonl`)
- `config.example.md` — voice and preference template
- SessionStart notification hook (nudge/batch modes)
- Integration test covering full pipeline end-to-end

### Changed
- Stop hook: command type (called Haiku API) → agent type (Claude does it natively)
- `journey-accumulate.sh`: shared file → session-scoped files with session ID
- `/journal-publish` skill: delegates to CLI → Claude rewrites directly in user's voice
- `lib/markdown.js` default path: project root → `~/.claude/journey/entries/`
- `lib/cache.js` default path: `lib/cache.json` → `~/.claude/journey/cache.json`
- `lib/errors.js` default path: `~/.claude/journey-errors.log` → `~/.claude/journey/errors.log`
- `journey status`: DB-aware → local-only (cache + session files + error log)
- `journey search`: removed `--db` flag, local grep only
- `journey doctor`: removed DB/API key checks, checks hooks + config + sessions
- Skill descriptions shortened for readability in skill lists

### Removed
- `lib/api.js` — Anthropic API client with circuit breaker (~120 lines)
- `lib/humanize.js` — Haiku-powered rewriting (~80 lines)
- `lib/db.js` — Neon client + retry queue + dead-letter (~250 lines)
- `lib/seo-feed.js` — cross-repo file mutation (~60 lines)
- `lib/env.js` — .env file loader (~40 lines)
- `lib/validate.js` — environment validation (~50 lines)
- `lib/write-entry.js` — orchestration pipeline (~90 lines)
- `lib/cli/top.js`, `lib/cli/sync.js`, `lib/cli/rehumanize.js`, `lib/cli/digest.js`
- `scripts/journey-capture.js`, `scripts/generate-digest.js`, `scripts/sync-pr-entries.js`, `scripts/migrate.js`
- `migrations/` directory
- `pending-sync.jsonl` retry queue system

## [1.3.0] - 2026-03-22

### Added
- `buildloud-skills/` -- Claude Code skill pack for plugin distribution (`/plugin add github:marylin/buildloud/buildloud-skills`)
- `/journal` skill -- manual journal entry capture (quick mode and guided mode)
- `/j` skill -- shortcut alias for `/journal`
- `/journal-publish` skill -- browse and publish high-scoring entries

## [1.2.0] - 2026-03-21

### Added
- `journey` CLI with 6 subcommands: `status`, `top`, `search`, `sync`, `rehumanize`, `digest`
- Error logging module (`lib/errors.js`) — persistent log at `~/.claude/journey-errors.log`
- Cross-source deduplication via SHA-256 content fingerprinting
- Cache resilience: atomic writes, backup rotation, corruption recovery
- `getStats()` export for pipeline health reporting
- `getQueueStats()` export for retry queue visibility
- Retry queue drop logging when entries expire after 7 days
- Digest window anchoring via `last_digest_date` in cache
- seo-feed idempotency check (no duplicate appends)

### Changed
- `generate-digest.js` exports core logic for CLI wrapping; standalone mode preserved
- `journey-capture.js` refactored: extracted `processFile()`, added orphan recovery

### Fixed
- Accumulator writes `message` but capture reads `msg` — now reads `message || msg`
- Orphaned `journey-session-processing.jsonl` files now recovered on next session

## [1.1.0] - 2026-03-20

### Added
- AGPLv3 license
- CONTRIBUTING.md, SECURITY.md, CODE_OF_CONDUCT.md
- GitHub issue and PR templates
- `hooks.example.json` — Claude Code hook configuration reference
- `lib/config.example.json` — user-configurable project routing
- `.node-version` file for nvm/fnm auto-switching
- Cross-platform `.env.example` with documented optional vars

### Changed
- Package renamed from `build-log` to `buildloud`
- Config key `whateverai_projects` → `branded_projects`
- `SEO_ENGINE_PATH` no longer has fallback (disabled when unset)
- `DIGEST_FROM_EMAIL` env var replaces hardcoded email address
- Removed auto-commit from write-entry and digest scripts (files are gitignored)
- Expanded `.gitignore` — journal entries, configs, and lockfile are now untracked

## [1.0.0] - 2026-03-20

### Added
- **Capture layer:** PostToolUse accumulator hook, Stop hook with Claude Haiku summary, `/journal` and `/j` Claude Code skills
- **Storage layer:** Markdown journal (`YYYY/MM/YYYY-MM-DD.md`) + Neon DB (`journey_entries` table) with retry queue
- **Intelligence layer:** Deterministic social-worthiness scoring (0-10), milestone detection (new project, shipped, persistence, breakthrough, volume)
- **Output layer:** Weekly digest generator (Haiku narrative + Resend email), seo-engine topic-seeds feed (optional)
- 46 unit + integration tests, zero external API calls in tests
- n8n workflow docs for PR hook and weekly digest automation
- Supabase-to-Neon migration (single `@neondatabase/serverless` dependency)
