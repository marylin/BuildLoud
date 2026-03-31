# BuildLoud v2

Zero-dependency build-in-public journal for Claude Code. No API keys, no database, no npm packages.

## Storage

All data lives under `~/.claude/journey/`:

- `entries/YYYY/MM/DD/project/raw.md` — raw journal entries (one file per project per day)
- `entries/YYYY/MM/DD/project/{platform}.md` — published versions (twitter, linkedin, blog)
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
journey process-session --file PATH  Score session data (internal, for command hook)
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
- **Stop** → command hook: reads session, scores entries, writes in user's voice
- **SessionStart** → prompt hook: nudge about unreviewed entries (if configured)

See `hooks.example.json` for configuration.

## Key Modules

- `lib/score.js` — deterministic scoring (0-10) and milestone detection
- `lib/cache.js` — persistent local state with file locking and backup
- `lib/markdown.js` — per-project markdown writer (writeEntry + writePublished)
- `lib/errors.js` — structured error logging with 500-line rotation
- `lib/cli/process-session.js` — scoring pipeline for Stop command hook

## Development

```
npm test    # 107 tests, 19 suites (node:test, no external runner)
```
