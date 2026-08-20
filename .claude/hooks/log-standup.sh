#!/bin/bash
# SubagentStop hook — Samwell Tarly's standup-logging role.
# Appends the finishing subagent's own handoff message (last_assistant_message) to
# DAILY_STANDUP.md under a dated heading. Deliberately mechanical: it does not re-synthesize
# "Yesterday/Today/Planning" via shell logic (that needs real reasoning), it relies on the fact
# that every agent in this repo already reports in the CLAUDE.md ## Summary/Validation/Risks/
# Recommendation handoff format, so the raw message is already standup-shaped.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

INPUT=$(cat)
AGENT=$(echo "$INPUT" | jq -r '.agent_type // "unknown-agent"')
MESSAGE=$(echo "$INPUT" | jq -r '.last_assistant_message // empty')

if [[ -z "$MESSAGE" ]]; then
  exit 0
fi

# Only log substantive handoffs — every real agent report follows the CLAUDE.md
# ## Summary/Validation/Risks/Recommendation format. Ad-hoc verification/test dispatches
# (e.g. "do you have skill X preloaded?") don't, and shouldn't pollute the standup log.
if [[ "$MESSAGE" != *"## Summary"* ]]; then
  exit 0
fi

TS=$(date '+%Y-%m-%d %H:%M %Z')

{
  echo ""
  echo "## $AGENT — $TS"
  echo ""
  echo "$MESSAGE"
} >> DAILY_STANDUP.md

exit 0
