# PR #93 / GARDEN-11 (silent-failure handling) review, 2026-08-21

Verdict: safe to merge, 0 blockers, 3 advisory follow-ups (GARDEN-46, GARDEN-47, WALL-72).

Facts worth keeping:

- `apiRequest` in `src/lib/api/core.ts:118-120` and `:261-310` THROWS `ApiError extends Error`
  on `!response.ok || !data.success`. So `try/catch` around `api.*` calls is genuinely
  load-bearing in this repo — a fix that adds a catch is not a no-op. Confirm this before ever
  accepting "the client returns an error object instead" reasoning from a builder.
- `extractApiError` (`core.ts:68`) surfaces backend `error.message` verbatim into `err.message`.
  Toasting `err.message` is the established repo pattern (also `email-templates/[id]/page.tsx:541`),
  but it means backend message sanitation is what stands between a raw backend string and the UI.
  Whether a given endpoint returns user-safe text is a BACKEND question — file a WALL
  cross-repo-check, never guess it from the frontend.
- Email template editor: the autosave status indicator lives inside the `leftPanelVisible`
  floating panel (`page.tsx:623-661`). `page.tsx:192-196` sets `leftPanelVisible=false` when
  `window.innerWidth < 768`. So ALL autosave indicators (saving/saved/error) are invisible on
  mobile; the collapsed restore pill (`page.tsx:616`) shows only icon + template name.
  Pre-existing limitation, inherited by any new indicator added there. Tracked as GARDEN-46.
- `DeleteAccountDialog` (`billing/page.tsx:1070+`, as of this review) was HAND-ROLLED, not Radix:
  bare `fixed inset-0`, manual Escape listener, no `role="dialog"`/`aria-modal`/focus trap/focus
  return. Already superseded by GARDEN-6 (PR #92) migrating it to `AlertDialog` — check current
  state before assuming this gap still exists.
- Red-before-green can be spot-checked WITHOUT mutating the tree: `git grep <asserted string>
  origin/main` — if the asserted UI strings don't exist on base, the tests structurally must have
  been red pre-fix. Used here for 'Not saved' / 'Autosave failed' / 'Failed to request account
  deletion' (all absent on `main`). Cheap, non-destructive, reuse this over a full stash/revert
  cycle when you just need a quick sanity check.
- Repo baseline as of this review: full suite 322 passed / 14 files, typecheck clean, lint 0
  errors + 11 warnings (all pre-existing, in `generate-certificate/*`). Cap is 250 warnings.
  CI was NOT red before this PR.
