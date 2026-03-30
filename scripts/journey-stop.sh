#!/usr/bin/env bash
# journey-stop.sh — Stop hook: process session files, optionally queue AI rewriting.
# Command type, async: true. Always exits 0.
trap 'exit 0' ERR

JOURNEY_DIR="$HOME/.claude/journey"
SESSION_DIR="$HOME/.claude/journey-sessions"
PENDING_FILE="$JOURNEY_DIR/.pending-rewrite.json"

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
JOURNEY_BIN="$PLUGIN_ROOT/bin/journey.js"

if [[ ! -f "$JOURNEY_BIN" ]]; then
  exit 0
fi

shopt -s nullglob
SESSION_FILES=("$SESSION_DIR"/*.jsonl)
shopt -u nullglob

if [[ ${#SESSION_FILES[@]} -eq 0 ]]; then
  exit 0
fi

# Read mode from config.md (basic/enhanced/full, default: basic)
MODE="basic"
CONFIG_FILE="$JOURNEY_DIR/config.md"
if [[ -f "$CONFIG_FILE" ]]; then
  MODE_LINE="$(grep -m1 '^- mode:' "$CONFIG_FILE" 2>/dev/null || true)"
  if [[ -n "$MODE_LINE" ]]; then
    PARSED="$(printf '%s' "$MODE_LINE" | sed 's/^- mode:[[:space:]]*//')"
    case "$PARSED" in
      basic|enhanced|full) MODE="$PARSED" ;;
    esac
  fi
fi

PROCESSED=0
for session_file in "${SESSION_FILES[@]}"; do
  if [[ "$MODE" == "basic" ]]; then
    node "$JOURNEY_BIN" process-session --file "$session_file" 2>/dev/null || true
  else
    node "$JOURNEY_BIN" process-session --file "$session_file" --output-pending "$PENDING_FILE" 2>/dev/null || true
  fi
  PROCESSED=$((PROCESSED + 1))
done

# Enhanced mode: notify user about pending rewrites
if [[ "$MODE" == "enhanced" && -f "$PENDING_FILE" ]]; then
  ENTRY_COUNT="$(node -e "
    let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
      try{const p=JSON.parse(d);console.log(p.entries?p.entries.length:0)}
      catch{console.log(0)}
    });
  " < "$PENDING_FILE" 2>/dev/null || printf '0')"

  if [[ "$ENTRY_COUNT" -gt 0 ]]; then
    printf 'BuildLoud: %s high-score journal entries ready for voice rewriting. Run /journal-review when ready.' "$ENTRY_COUNT"
  fi
  rm -f "$PENDING_FILE" 2>/dev/null || true
fi

# Full mode: output agent-style prompt with voice context
if [[ "$MODE" == "full" && -f "$PENDING_FILE" ]]; then
  VOICE=""
  if [[ -f "$CONFIG_FILE" ]]; then
    VOICE="$(sed -n '/^## Voice/,/^## /{ /^## Voice/d; /^## /d; p; }' "$CONFIG_FILE" 2>/dev/null || true)"
  fi

  if [[ -n "$VOICE" ]]; then
    printf 'BuildLoud: Rewrite the following journal entries in this voice:\n\n'
    printf 'Voice profile:\n%s\n\n' "$VOICE"
    printf 'Entries to rewrite:\n'
    cat "$PENDING_FILE" 2>/dev/null || true
    printf '\n\nRewrite each raw_summary. Keep to 2-3 sentences. Focus on outcomes, not technical details.'
  fi
  rm -f "$PENDING_FILE" 2>/dev/null || true
fi

exit 0
