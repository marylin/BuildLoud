#!/usr/bin/env bash
# journey-accumulate.sh — PostToolUse hook that logs git commits to a JSONL session file.
# Reads tool_input JSON from stdin, extracts the git commit command,
# and appends a structured JSON line to ~/.claude/journey-session.jsonl.

set -euo pipefail

# Read stdin (Claude Code passes JSON with tool_input.command)
INPUT=$(cat)

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
" "$TIMESTAMP" "$PROJECT" "$COMMIT_MSG" >> ~/.claude/journey-session.jsonl

exit 0
