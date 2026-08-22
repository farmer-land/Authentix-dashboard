# reviewer — memory index
- [Heisenberg owns every Done transition](feedback_heisenberg_owns_every_done_transition.md) — NEVER move any Jira ticket to Done. In Review is where you stop.
- [Verify before claiming fixed](feedback_verify_before_claiming_fixed.md) — a green suite is not evidence; reproduce the real symptom on the real artifact.
- [Dependency-bump PR verification technique](technique_dependency_bump_verification.md) — lockfile package-map diffing, the Node/npm `libc`-churn gotcha, and a curl-based fallback when Jira/GitHub MCP tools are unavailable.
- [PR #93 / GARDEN-11 review notes](notes_pr93_garden11_silent_failure.md) — `apiRequest` throw semantics, the non-destructive red-before-green spot-check technique, and other facts from that review.

## Repo facts learned 2026-08-21 (PR #92 / GARDEN-6 review)
- Agent worktrees under `.claude/worktrees/<id>/` carry their own `node_modules`; the repo root
  `/home/user/Authentix-dashboard` does NOT. Run npm/vitest from the worktree path or it fails
  with "Cannot find module 'vitest/config'". Root repo sits detached at origin/main.
- Radix `@radix-ui/react-dialog` and `react-alert-dialog` 1.1.15 set `role="dialog"`/`role="alertdialog"`
  but do NOT set `aria-modal` (verified by grepping `node_modules/@radix-ui/react-*/dist/index.mjs`).
  So adding `aria-modal="true"` in `src/components/ui/dialog.tsx` / `alert-dialog.tsx` is a real fix,
  not redundant.
- There are ~33 `<DialogContent>` call sites across 21 files (not 5) — any change to
  `src/components/ui/dialog.tsx` has that blast radius. `grep -rn "<DialogContent" app src`.
- No call site anywhere passes `modal={false}` to a Dialog/AlertDialog root (only Popover uses `modal`).
- Precedent for exporting a named component from an App Router `page.tsx` already exists:
  `app/dashboard/org/[slug]/broadcasts/page.tsx:1678` exports `BroadcastsContent`. CI (`.github/workflows/ci.yml`)
  runs lint + typecheck + test:run only — it does NOT run `next build`, so page-export type errors would
  only surface on Vercel.
- Reviewer technique that worked well for verifying red-before-green claims without editing anything
  permanently: `git checkout origin/main -- <src files>` in the worktree, re-run the new tests, then
  `git checkout HEAD -- <same files>`.
- Known unlabelled input: the "type delete to confirm" field in
  `app/dashboard/org/[slug]/billing/page.tsx` (~line 1213) has placeholder only, no label/aria-label.
