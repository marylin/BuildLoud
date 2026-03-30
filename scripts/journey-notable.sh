#!/usr/bin/env bash
trap 'exit 0' ERR
# journey-notable.sh — PostToolUse hook that logs notable events (PR creation, PR merges,
# branch merges) to a session-scoped JSONL file.
# Reads tool_input JSON from stdin, extracts the command,
# and appends a structured JSON line to ~/.claude/journey-sessions/{session-id}.jsonl.

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"

log_error() {
  mkdir -p "$HOME/.claude/debug" 2>/dev/null
  echo "$(date +%Y-%m-%dT%H:%M:%S%z) [journey-notable] $1" >> "$HOME/.claude/debug/hook-failures.log"
}

set -euo pipefail

# Check node is available
if ! command -v node &>/dev/null; then
  log_error "node not found — journey notable skipped"
  exit 0
fi

# Read stdin (Claude Code passes JSON with tool_input.command and session_id)
INPUT=$(cat)

# Extract session_id; fall back to YYYY-MM-DD-PID
SESSION_ID=$(node -e "
  try {
    const d = JSON.parse(process.argv[1]);
    const sid = d.session_id ?? '';
    console.log(sid.trim() || '');
  } catch { console.log(''); }
" "$INPUT")

if [ -z "$SESSION_ID" ]; then
  SESSION_ID="$(date +%Y-%m-%d)-$$"
fi

# Ensure sessions directory exists
SESSIONS_DIR="$HOME/.claude/journey-sessions"
mkdir -p "$SESSIONS_DIR" 2>/dev/null

SESSION_FILE="$SESSIONS_DIR/${SESSION_ID}.jsonl"

# Extract the command string from tool_input.command using node
COMMAND=$(node -e "
  try {
    const d = JSON.parse(process.argv[1]);
    console.log(d.tool_input?.command ?? '');
  } catch { console.log(''); }
" "$INPUT")

# Bail if empty
[ -z "$COMMAND" ] && exit 0

# Detect event type and extract relevant metadata
EVENT_TYPE=""
EVENT_TITLE=""

case "$COMMAND" in
  gh\ pr\ create*)
    EVENT_TYPE="pr_created"
    # Extract title from --title "..." or --title '...'
    EVENT_TITLE=$(node -e "
      const cmd = process.argv[1];
      let m = cmd.match(/--title\s+[\"']([^\"']*)[\"']/);
      if (m) { console.log(m[1]); process.exit(0); }
      console.log('(title not extracted)');
    " "$COMMAND")
    ;;
  gh\ pr\ merge*)
    EVENT_TYPE="pr_merged"
    # Extract PR ref (number or URL) — first non-flag argument after 'merge'
    EVENT_TITLE=$(node -e "
      const cmd = process.argv[1];
      // Strip 'gh pr merge' prefix and look for PR number or URL
      const rest = cmd.replace(/^gh\s+pr\s+merge\s*/, '');
      let m = rest.match(/^([^\s-][^\s]*)/);
      if (m) { console.log(m[1]); process.exit(0); }
      console.log('(pr ref not extracted)');
    " "$COMMAND")
    ;;
  git\ merge*)
    EVENT_TYPE="branch_merged"
    # Extract branch name — first non-flag argument after 'git merge'
    EVENT_TITLE=$(node -e "
      const cmd = process.argv[1];
      const rest = cmd.replace(/^git\s+merge\s*/, '');
      // Skip flags (starting with -) and grab first branch name
      const parts = rest.trim().split(/\s+/);
      const branch = parts.find(p => p && !p.startsWith('-'));
      console.log(branch || '(branch not extracted)');
    " "$COMMAND")
    ;;
  *)
    # Not a notable event — exit silently
    exit 0
    ;;
esac

# Get project name from current working directory
PROJECT=$(basename "$(pwd)")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Append JSON line using node for safe serialization
node -e "
  const line = {
    ts: process.argv[1],
    type: process.argv[2],
    title: process.argv[3],
    project: process.argv[4]
  };
  console.log(JSON.stringify(line));
" "$TIMESTAMP" "$EVENT_TYPE" "$EVENT_TITLE" "$PROJECT" >> "$SESSION_FILE"

exit 0
