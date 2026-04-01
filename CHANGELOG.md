# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Per-project directory structure: `entries/YYYY/MM/DD/project/raw.md`
- `writePublished()` function for saving platform-specific published versions
- YAML frontmatter on all entry files (project, type, score, date)
- Local system time in entry headings (UTC in frontmatter date field)
- Migration script (`scripts/migrate-entries.js`) for flat-to-tree conversion
- `journey doctor` detects old vs new entry format
- Bilingual voice profile support (Spanish + English)

### Changed
- `writeEntry()` now writes to `YYYY/MM/DD/project/raw.md` instead of `YYYY/MM/YYYY-MM-DD.md`
- `journey search` walks the deeper `YYYY/MM/DD/project/` tree
- `/journal-publish` saves published versions as separate files instead of blockquotes
- `/journal-review` and `/journal-digest` updated for new entry paths
- Command namespace cleanup: custom commands use `mad-` prefix

## [1.0.1] - 2026-03-30

### Added
- Obsidian vault integration via junction in `/journey-init`
- Obsidian integration section in README

### Fixed
- Marketplace plugin structure aligned with working third-party plugins
- Marketplace source uses local path to prevent infinite recursion

## [1.0.0] - 2026-03-25

First public release. Zero-dependency build-in-public journal for Claude Code.

### Core
- Auto-capture hooks: commit accumulation, PR/merge notable events, session-end scoring, session-start nudge
- Deterministic scoring engine (0-10) with milestone detection
- Per-user voice profile with platform-specific rewriting
- Local-only storage: markdown entries, JSON cache, error log with rotation
- 6 CLI commands: `log`, `status`, `search`, `doctor`, `recover`, `process-session`
- 7 skills: `/journey-init`, `/journal`, `/j`, `/journal-review`, `/journal-publish`, `/journal-digest`
- 3 processing modes: basic (zero tokens), enhanced (prompt), full (agent)

### Architecture
- Zero runtime dependencies (Node.js built-in APIs only)
- Crash-proof hooks (exit 0 on all paths, 3-10s timeouts)
- Session-scoped JSONL files for commit accumulation
- File locking with stale lock detection for concurrent access
- Auto-registering hooks via plugin manifest

### Previous
Versions 0.x were internal development milestones (2026-03-20 to 2026-03-24), never published. They established the core architecture with iterative improvements to caching, deduplication, error handling, and OSS scaffolding.
