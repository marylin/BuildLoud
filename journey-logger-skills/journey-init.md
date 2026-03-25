---
name: journey-init
description: First-run setup for Journey Logger — configures voice profile, notification preferences, and target platforms. Run automatically when config is missing, or manually to update settings.
---

# /journey-init — Journey Logger Setup

## Guard
Check if `~/.claude/journey/config.md` exists.
- If it exists and the user ran this directly: show current settings, ask what they want to change.
- If it doesn't exist: run the full setup below.

## Setup Flow

Ask ONE question at a time. Wait for each answer before asking the next.

### Step 1: Scope
"Where should Journey Logger capture entries?"
  (a) Global — all repos (writes to ~/.claude/journey/config.md)
  (b) This repo only (writes to .claude/journey.md)
  (c) Both — global defaults + repo-specific overrides

### Step 2: Voice
"How do you write when sharing what you build? Give me 2-3 examples of posts you've shared or would share. Or just describe your style."

From their response, extract:
- Tone (casual, professional, sarcastic, technical, etc.)
- Sentence length preference
- Personality traits
- Any phrases they'd avoid

### Step 3: Notifications
"When should I surface notable moments from your coding sessions?"
  (a) Silent — capture everything quietly, I'll review when ready
  (b) Nudge — mention notable moments when I start a new session
  (c) Batch — collect and mention once per day

### Step 4: Platforms
"What platforms do you share on?"
  → Twitter / LinkedIn / Blog / All

## Write Config

Create `~/.claude/journey/config.md` (or `.claude/journey.md` for repo-only):

```
# Journey Logger Configuration

## Voice
[extracted tone description]

## Examples
[user's example posts]

## What I never say
[extracted anti-patterns]

## Preferences
- notification: [silent|nudge|batch]
- platforms: [comma-separated list]
- score_threshold: 5
```

Create the directory structure if it doesn't exist:
```bash
mkdir -p ~/.claude/journey/entries ~/.claude/journey/weekly ~/.claude/journey-sessions
```

Note: sessions dir is `~/.claude/journey-sessions/` (sibling to `journey/`, not inside it) to keep in-flight data separate from journal content.

Print: "Setup complete. Journey Logger will capture your coding sessions automatically."

## Rules
- Do NOT ask for confirmation on writing the config. Just write it.
- Keep the whole flow to under 2 minutes.
- If the user gives minimal answers, use sensible defaults.
