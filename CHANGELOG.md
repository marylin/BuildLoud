# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
