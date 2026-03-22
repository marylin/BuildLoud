# Journey Logger Skills

Claude Code skill pack for [Journey Logger](https://github.com/marylin/journey-logger) -- a zero-latency build-in-public journal.

## Installation

```bash
/plugin add github:marylin/journey-logger/journey-logger-skills
```

## Prerequisites

1. **Clone the repo** (the skill pack needs the journey-logger codebase):
   ```bash
   git clone https://github.com/marylin/journey-logger.git
   cd journey-logger
   npm install
   ```

2. **Set up environment** (see main [README](../README.md)):
   ```bash
   cp .env.example .env
   # Edit .env -- set DATABASE_URL and ANTHROPIC_API_KEY
   ```

3. **Set the path** (if you cloned to a non-standard location):
   ```bash
   export JOURNEY_LOGGER_PATH="/path/to/journey-logger"
   ```
   If omitted, the skill auto-detects from the plugin's own directory.

4. **Install hooks** for automatic session capture (optional but recommended):
   Merge the entries from [`hooks.example.json`](../hooks.example.json) into your `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "Bash(git commit*)",
           "hooks": [{
             "type": "command",
             "command": "bash /path/to/journey-logger/scripts/journey-accumulate.sh",
             "timeout": 5000
           }]
         }
       ],
       "Stop": [
         {
           "matcher": "",
           "hooks": [{
             "type": "command",
             "command": "node /path/to/journey-logger/scripts/journey-capture.js",
             "timeout": 30000,
             "async": true
           }]
         }
       ]
     }
   }
   ```
   Replace `/path/to/journey-logger` with the actual path.

## Commands

| Command | Description |
|---------|-------------|
| `/journal <text>` | Log a journal entry (quick mode) |
| `/journal` | Log a journal entry (guided mode) |
| `/j <text>` | Shortcut for `/journal` |
| `/journal-publish` | Browse and publish high-scoring entries |

## How It Works

- **`/journal`** -- Capture what you just built, fixed, or learned. Entries are scored (0-10), written to daily markdown files, and optionally synced to Neon DB. High-scoring entries (7+) can auto-feed content pipelines.
- **`/j`** -- Alias for `/journal`. Same behavior.
- **`/journal-publish`** -- Browse recent high-scoring entries (5+), generate public-ready versions via Claude Haiku, and output copy-paste text for social media or blog.

## With Hooks (Automatic Capture)

When hooks are installed, Journey Logger also captures sessions automatically:
1. **PostToolUse hook** tracks git commits during your Claude Code session
2. **Stop hook** summarizes the session via Claude Haiku and writes a journal entry
3. No manual action required -- just code normally

## License

[AGPL-3.0](../LICENSE)
