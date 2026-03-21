# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
- Package renamed from `build-log` to `journey-logger`
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
