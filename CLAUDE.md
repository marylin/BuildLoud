# journey-logger v2

Zero-dependency build-in-public journal for Claude Code. No API keys, no database, no npm dependencies.

## Storage

- Entries: `~/.claude/journey/entries/YYYY-MM-DD.md` (one file per day)
- Sessions: `~/.claude/journey-sessions/<session_id>.jsonl` (scratch, deleted after processing)
- Cache: `~/.claude/journey/cache.json` (stats, streaks, fingerprints)
- Errors: `~/.claude/journey/errors.log`

## CLI Commands (6 total)

```
journey log              # Write a manual journal entry
journey status           # Local health report
journey search <term>    # Search entries in markdown files
journey doctor           # Diagnostic health check
journey recover          # Process orphaned session files
journey process-session  # Score session data (internal, used by agent hook)
```

## Skills (Claude Code plugin — journey-logger-skills/)

- `/journey-init`     — First-time setup: install hooks, create dirs
- `/journal`          — Write or review today's entries
- `/journal-review`   — Weekly review and reflection
- `/journal-publish`  — Draft a build-in-public post from entries
- `/journal-digest`   — Generate a digest summary

## Hooks (add to ~/.claude/settings.json)

- **PostToolUse** → `scripts/journey-accumulate.sh` — captures git commits
- **PostToolUse** → `scripts/journey-notable.sh` — captures notable events (PR merges, deployments)
- **Stop** → `node bin/journey.js process-session` — scores session data and outputs JSON for the agent hook

See `hooks.example.json` for the exact configuration.

## Key Modules

- `lib/markdown.js` — writes daily `.md` files to `~/.claude/journey/entries/`
- `lib/cache.js` — persistent stats with file locking and backup recovery
- `lib/score.js` — entry scoring (1-10) and milestone detection
- `lib/errors.js` — structured error logging with rotation

## Development

```
npm test          # Run all tests (node --test)
npm run lint      # Check JS syntax
```

Tests are in `tests/` and mirror source modules. All tests use `node:test` (no external test runner).
