#!/bin/bash
# PostCompact hook — Samwell Tarly's context-preservation role.
# Re-injects a short reminder of AGENTS.md's hard constraints after compaction,
# since detail can get lost in the summary. Informational only, exit code ignored.
cat <<'EOF'
[Samwell] Reminder after compaction — Authentix-dashboard non-negotiables:
- No direct Supabase client in frontend code, no service-role secrets in browser code
- No auth tokens in localStorage/sessionStorage — only HttpOnly cookies
- All backend calls go through /api/proxy/* or /api/auth/* — never call the backend directly
- No internal backend/storage identifiers returned to the UI unless required
- Branch from staging, never push straight to main
- See FRONTEND_BATTLE_PLAN.md for the current audit findings list
EOF

exit 0
