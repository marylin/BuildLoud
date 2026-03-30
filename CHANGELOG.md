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
- `journey process-session` CLI command — scoring pipeline for Stop command hook
- `scripts/journey-notable.sh` — PostToolUse hook for PR/merge event capture
- Session-scoped JSONL files (`~/.claude/journey-sessions/{session-id}.jsonl`)
- `config.example.md` — voice and preference template
- SessionStart notification hook (nudge/batch modes)
- Integration test covering full pipeline end-to-end

### Changed
- Stop hook: command type (called Haiku API) → command hook (scores locally, optional voice rewriting)
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

---

### Pre-release development history (v1.0.0 – v1.3.0)

Versions 1.0.0 through 1.3.0 were internal development milestones (2026-03-20 to 2026-03-22), never published to npm. They established the core architecture — capture hooks, scoring engine, markdown journal, CLI, and skill pack — with iterative improvements to caching, deduplication, error handling, and OSS scaffolding. The v2.0.0 release above is the first public version, built on that foundation.
