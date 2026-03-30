# Contributing to BuildLoud

## Prerequisites

- Node.js 18+
- Claude Code (for testing skills and hooks)

That's it. No database, no API keys, no accounts to create.

## Setup

1. Fork and clone the repo
2. Run `/journey-init` in Claude Code to set up your voice profile
3. Merge [`hooks.example.json`](hooks.example.json) into `~/.claude/settings.json` (optional, for auto-capture)

## Testing

```bash
npm test
```

107 tests across 19 suites. All run locally with no external calls. Tests use temp directories and are fully isolated.

## Making Changes

1. Create a branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Commit using conventional commits: `type(scope): description`
   - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
5. Push and open a PR

## Code Style

- ESM modules (`import`/`export`, `"type": "module"`)
- Node.js built-in APIs only — no external packages
- Tests use `node:test` and `node:assert/strict`
- No TypeScript — plain JavaScript

## Writing Skills

Skills are markdown files in `buildloud-skills/`. Each has YAML frontmatter:

```yaml
---
name: skill-name
description: One-line description (shown in Claude Code's skill list).
---
```

Keep descriptions short and scannable. The skill body is instructions for Claude to follow.

## What Not to Commit

- `~/.claude/journey/` (user journal data)
- `lib/cache.json` (runtime state, if present locally)
- `package-lock.json` (no dependencies to lock)
