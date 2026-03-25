# Journey Logger v2

Zero-dependency build-in-public journal for Claude Code. No API keys, no database, no npm packages.

## Storage

All data lives under `~/.claude/journey/`:

- `entries/YYYY/MM/YYYY-MM-DD.md` — journal entries (one file per day)
- `weekly/YYYY-WNN.md` — weekly digests
- `cache.json` — streaks, fingerprints, project stats
- `errors.log` — error log with rotation

Session scratch files: `~/.claude/journey-sessions/{session-id}.jsonl`

## CLI

```
journey log "summary" --type TYPE    Log entry with scoring + milestone detection
journey status                       Streaks, counts, pending sessions
journey search <query>               Search journal entries by keyword
journey doctor                       Check hooks, config, cache health
journey recover                      Process orphaned session files
journey process-session --file PATH  Score session data (internal, for agent hook)
```

## Skills

- `/journey-init` — set up voice, notifications, platforms
- `/journal` — log a build-in-public entry (quick or guided)
- `/j` — shortcut for `/journal`
- `/journal-review` — browse and curate entries by score
- `/journal-publish` — rewrite entries for Twitter/LinkedIn/blog
- `/journal-digest` — weekly narrative summary

## Hooks

- **PostToolUse** `Bash(git commit*)` → `scripts/journey-accumulate.sh`
- **PostToolUse** `Bash(gh pr *)` → `scripts/journey-notable.sh`
- **Stop** → agent hook: reads session, scores entries, writes in user's voice
- **SessionStart** → prompt hook: nudge about unreviewed entries (if configured)

See `hooks.example.json` for configuration.

## Key Modules

- `lib/score.js` — deterministic scoring (0-10) and milestone detection
- `lib/cache.js` — persistent local state with file locking and backup
- `lib/markdown.js` — daily markdown writer
- `lib/errors.js` — structured error logging with 500-line rotation
- `lib/cli/process-session.js` — scoring pipeline for agent hook

## Development

```
npm test    # 102 tests, 17 suites (node:test, no external runner)
```
