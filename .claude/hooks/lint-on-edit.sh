#!/bin/bash
# Runs eslint --fix on a single file right after Claude edits it.
# Non-blocking: never denies the edit, just gives fast feedback via the transcript.
FILE=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)

if [[ "$FILE" == *.ts || "$FILE" == *.tsx ]] && [[ -f "$FILE" ]]; then
  npx eslint "$FILE" --fix 2>&1 | head -30
fi

exit 0
