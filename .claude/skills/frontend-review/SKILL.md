---
name: frontend-review
description: Audit a dashboard change against AGENTS.md's hard constraints, safe-area boundaries, and known anti-patterns before it merges.
---

# Frontend Review — Authentix Dashboard

Read `AGENTS.md` first if you haven't already this session — this checklist mirrors its "Hard Constraints," "Never Modify Blindly," and "Anti-Patterns To Avoid" sections.

## Checklist

**Hard constraints**
- No direct Supabase DB client usage added to frontend code
- No service-role secrets exposed to browser code
- No auth tokens in `localStorage`/`sessionStorage`
- No backend calls that bypass `/api/proxy/*` or `/api/auth/*`
- No loosened proxy path validation/allowlist without explicit sign-off
- No internal backend/storage identifiers returned to the UI unless required

**Files that need extra scrutiny if touched**
- `proxy.ts`, `app/api/proxy/[...path]/route.ts` — route gating and allowlist logic
- `src/lib/api/server.ts` — auth cookie handling
- `src/lib/api/client.ts` — API contracts (endpoint/method/path shape)
- `app/dashboard/org/[slug]/layout.tsx` — org access validation

**Known anti-patterns to flag**
- Mixing live-sync and explicit-submit callbacks in data-entry flows
- Stale schema fields (`issue_date`, `expiry_date`, `status='issued'`)
- Blob-buffer roundtrips for downloads when a direct link would do
- Regressions in the generate-certificate optimistic-UX flow

**Test discipline**
- Any change to `generate-certificate/components/*`, `(auth)/*/actions.ts`, or `src/lib/api/*` needs `npm run test:run` before merge

## Output

List findings as ✅ / ⚠️ / 🔴 with file:line, referencing the specific AGENTS.md rule. End with a merge/no-merge verdict.
