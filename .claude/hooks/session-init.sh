#!/bin/bash
# SessionStart hook — Missandei's session-synchronization role.
# Prints a short, factual session summary to stdout. Non-blocking, informational only.
cd "$CLAUDE_PROJECT_DIR" 2>/dev/null || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
CHANGED=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')

if [[ -n "$BRANCH" ]]; then
  echo "[Missandei] Authentix-dashboard session starting — branch: $BRANCH, uncommitted files: $CHANGED"
fi

exit 0
