# Journey Logger Skills

Claude Code skill pack for [Journey Logger](https://github.com/marylin/journey-logger) — a zero-latency build-in-public journal.

## Installation

```bash
/plugin add github:marylin/journey-logger/journey-logger-skills
```

## First Run

Run `/journey-init` to set up your voice profile and preferences. This creates `~/.claude/journey/config.md`.

## Prerequisites

1. **Clone the repo** (the skill pack needs the journey-logger codebase):
   ```bash
   git clone https://github.com/marylin/journey-logger.git
   ```

2. **Set the path** (if you cloned to a non-standard location):
   ```bash
   export JOURNEY_LOGGER_PATH="/path/to/journey-logger"
   ```

3. **Install hooks** for automatic session capture (recommended):
   Merge entries from [`hooks.example.json`](../hooks.example.json) into `~/.claude/settings.json`.
   Replace `$JOURNEY_LOGGER_PATH` with the actual path.

No npm install needed. No API keys. No database. Zero configuration beyond the path.

## Commands

| Command | Description |
|---------|-------------|
| `/journey-init` | First-run setup — voice, notifications, platforms |
| `/journal <text>` | Log a journal entry (quick mode) |
| `/journal` | Log a journal entry (guided mode) |
| `/j <text>` | Shortcut for `/journal` |
| `/journal-review` | Browse and curate captured entries |
| `/journal-publish` | Rewrite entries for social media/blog |
| `/journal-digest` | Generate weekly narrative summary |

## How It Works

- **Hooks** capture git commits and PR events automatically during your Claude Code sessions
- **Stop hook** (agent) processes the session — scores entries, writes them in your voice
- **Skills** let you review, publish, and digest entries on-demand
- **All data** lives in `~/.claude/journey/` as markdown files

## License

[AGPL-3.0](../LICENSE)
