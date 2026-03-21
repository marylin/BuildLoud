# Contributing to Journey Logger

## Prerequisites

- Node.js 18+
- A [Neon](https://neon.tech) PostgreSQL database
- An [Anthropic](https://console.anthropic.com) API key (for session summaries)

## Setup

1. Fork and clone the repo
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy config files:
   ```bash
   cp .env.example .env
   cp lib/config.example.json lib/config.json
   ```
4. Fill in `.env` with your credentials
5. Edit `lib/config.json` with your project names
6. Run the database migration:
   ```
   # Paste contents of migrations/001-journey-entries.sql into Neon SQL Editor
   ```

## Testing

```bash
npm test
```

All 46+ tests run locally with no external API calls. Tests use temp directories and are fully isolated.

## Making Changes

1. Create a branch: `git checkout -b feat/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Commit using conventional commits: `type(scope): description`
   - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
5. Push and open a PR

## Code Style

- ESM modules (`import`/`export`, `"type": "module"`)
- Node.js built-in APIs preferred over external packages
- Only external dependency: `@neondatabase/serverless`
- Tests use `node:test` and `node:assert/strict`
- No TypeScript — plain JavaScript

## What Not to Commit

- `.env` files (secrets)
- `lib/config.json` (personal project list)
- `lib/cache.json` (runtime state)
- Journal entries (`2026/`, `weekly/`)
- `package-lock.json` (generated per-user)
