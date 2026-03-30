#!/usr/bin/env bash
# journey-sessionstart.sh — SessionStart hook: recovery + nudges.
# Command type. Always exits 0.
trap 'exit 0' ERR

JOURNEY_DIR="$HOME/.claude/journey"
SESSION_DIR="$HOME/.claude/journey-sessions"
PENDING_FILE="$JOURNEY_DIR/.pending-rewrite.json"
CONFIG_FILE="$JOURNEY_DIR/config.md"
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
JOURNEY_BIN="$PLUGIN_ROOT/bin/journey.js"

# Suggest init if no config
if [[ ! -f "$CONFIG_FILE" ]]; then
  printf 'BuildLoud: No journal config found. Run /journey-init to set up your voice profile.'
  exit 0
fi

# Recovery: pending rewrite from failed Stop hook
if [[ -f "$PENDING_FILE" ]]; then
  printf 'BuildLoud: Found unprocessed entries from last session. Run /journal-review to handle them.'
  rm -f "$PENDING_FILE" 2>/dev/null || true
fi

# Recovery: orphaned session files
shopt -s nullglob
SESSION_FILES=("$SESSION_DIR"/*.jsonl)
shopt -u nullglob

if [[ ${#SESSION_FILES[@]} -gt 0 && -f "$JOURNEY_BIN" ]]; then
  for session_file in "${SESSION_FILES[@]}"; do
    node "$JOURNEY_BIN" process-session --file "$session_file" 2>/dev/null || true
  done
fi

# Count notable entries this month
ENTRIES_DIR="$JOURNEY_DIR/entries"
if [[ -d "$ENTRIES_DIR" ]]; then
  NOTABLE=0
  YEAR="$(date -u +%Y)"
  MONTH="$(date -u +%m)"
  MONTH_DIR="$ENTRIES_DIR/$YEAR/$MONTH"
  if [[ -d "$MONTH_DIR" ]]; then
    for f in "$MONTH_DIR"/*.md; do
      [[ -f "$f" ]] || continue
      STARS="$(grep -c '⭐' "$f" 2>/dev/null || true)"
      NOTABLE=$((NOTABLE + STARS))
    done
  fi

  if [[ "$NOTABLE" -gt 0 ]]; then
    printf 'BuildLoud: %d notable entries this month. Run /journal-review when ready.' "$NOTABLE"
  fi
fi

exit 0
