#!/usr/bin/env bash
# journey-accumulate.sh — PostToolUse hook that logs git commits to a session-scoped JSONL file.
# Reads tool_input JSON from stdin, extracts the git commit command,
# and appends a structured JSON line to ~/.claude/journey-sessions/{session-id}.jsonl.

log_error() {
  mkdir -p "$HOME/.claude/debug" 2>/dev/null
  echo "$(date +%Y-%m-%dT%H:%M:%S%z) [journey-accumulate] $1" >> "$HOME/.claude/debug/hook-failures.log"
}

set -euo pipefail

# Check node is available
if ! command -v node &>/dev/null; then
  log_error "node not found — journey accumulation skipped"
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

# Only process real git commit commands (not amend, not echo, not dry-run)
case "$COMMAND" in
  git\ commit*) ;;  # matches
  *) exit 0 ;;
esac

# Skip amends and dry-runs
case "$COMMAND" in
  *--amend*) exit 0 ;;
  *--dry-run*) exit 0 ;;
  *-n*) exit 0 ;;
esac

# Skip if it's wrapped in echo or printf (not a real commit)
case "$COMMAND" in
  echo*) exit 0 ;;
  printf*) exit 0 ;;
esac

# Get project name from current working directory
PROJECT=$(basename "$(pwd)")

# Extract commit message (best effort from -m flag)
COMMIT_MSG=$(node -e "
  const cmd = process.argv[1];
  // Try to extract -m '...' or -m \"...\" or -m \$(cat <<'EOF'...EOF)
  // First try: simple -m \"message\" or -m 'message'
  let m = cmd.match(/-m\s+[\"']([^\"']*)[\"']/);
  if (m) { console.log(m[1]); process.exit(0); }
  // Try: -m followed by unquoted word(s) up to next flag
  m = cmd.match(/-m\s+([^\s\-][^-]*)/);
  if (m) { console.log(m[1].trim()); process.exit(0); }
  // Fallback: entire command
  console.log('(message not extracted)');
" "$COMMAND")

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Append JSON line using node for safe serialization
node -e "
  const line = {
    ts: process.argv[1],
    project: process.argv[2],
    message: process.argv[3],
    type: (process.argv[3].match(/^(\w+)[\(:]/) || [])[1] || 'unknown'
  };
  console.log(JSON.stringify(line));
" "$TIMESTAMP" "$PROJECT" "$COMMIT_MSG" >> "$SESSION_FILE"

exit 0
