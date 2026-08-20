#!/bin/bash
# Stop-hook verification gate — attached only to feature-builder and bug-fixer.
# "Tests are mandatory" was previously an instruction (a request). This makes it enforcement:
# if src/ or app/ has uncommitted changes, typecheck/lint/tests must pass before the agent can end its turn.
# Doesn't fire on read-only turns (reviewer, docs-sync, docs-writer aren't gated by this).
cd "$CLAUDE_PROJECT_DIR" || exit 0

CHANGED=$(git status --porcelain -- src/ app/ 2>/dev/null)
if [[ -z "$CHANGED" ]]; then
  exit 0
fi

LOG=/tmp/authentix-dashboard-verify.log
: > "$LOG"
FAIL=""
npm run typecheck --silent >> "$LOG" 2>&1 || FAIL="typecheck"
[[ -z "$FAIL" ]] && { npm run lint --silent >> "$LOG" 2>&1 || FAIL="lint"; }
[[ -z "$FAIL" ]] && { npm run test:run --silent >> "$LOG" 2>&1 || FAIL="tests"; }

if [[ -n "$FAIL" ]]; then
  echo "Verification gate failed: '$FAIL' is not passing with uncommitted src/ or app/ changes. Fix it before finishing — see $LOG for the full output (tail: $(tail -5 "$LOG" | tr '\n' ' '))." >&2
  exit 2
fi

exit 0
