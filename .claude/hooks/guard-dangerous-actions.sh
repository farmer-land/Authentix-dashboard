#!/bin/bash
# PreToolUse guard — deterministic enforcement of CLAUDE.md/AGENTS.md's "never" rules.
# CLAUDE.md instructions are advisory; this hook is not. Blocks (doesn't just warn) on:
#   1. Writing to a real .env file (secrets belong in Vercel's env dashboard, not the repo)
#   2. git push --force / -f (can destroy shared history)
#   3. git push directly to main (main auto-deploys via Vercel — must go through staging + a PR)
#   4. Direct edits to .git/* internals (bypasses git's own safety checks)
#   5. Direct edits to package-lock.json (must be regenerated via `npm install`, never hand-edited —
#      a hand-edited lockfile can silently desync from package.json or smuggle in a tampered resolution)
INPUT=$(cat)
TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

deny() {
  jq -n --arg reason "$1" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $reason}}'
  exit 0
}

if [[ "$TOOL" == "Edit" || "$TOOL" == "Write" ]]; then
  BASENAME=$(basename "$FILE")
  if [[ "$BASENAME" == .env* && "$BASENAME" != ".env.example" ]]; then
    deny "Blocked: direct write to $BASENAME. Secrets go through Vercel's env dashboard, never committed to the repo. Do this by hand outside Claude Code if it's genuinely needed."
  fi
  if [[ "$FILE" == */.git/* || "$FILE" == .git/* ]]; then
    deny "Blocked: direct edit to $FILE. Git internals under .git/ must be changed via git commands, never hand-edited."
  fi
  if [[ "$BASENAME" == "package-lock.json" ]]; then
    deny "Blocked: direct edit to package-lock.json. Regenerate it with 'npm install' — a hand-edited lockfile can desync from package.json or mask a tampered dependency resolution."
  fi
fi

if [[ "$TOOL" == "Bash" ]]; then
  if echo "$CMD" | grep -Eq 'git push[^&|;]*(--force|-f\b)'; then
    deny "Blocked: force-push detected in '$CMD'. Never force-push — it can destroy history other people, CI, or Vercel's deploy trigger depend on."
  fi
  if echo "$CMD" | grep -Eq 'git push[^&|;]*\bmain\b'; then
    deny "Blocked: direct push to main detected in '$CMD'. Convention is feature/* → staging → main via PR only — main auto-deploys via Vercel."
  fi
fi

exit 0
