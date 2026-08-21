
## 2026-08-21 — PR #90 (GARDEN-30, eslint-config-next 16.2.6->16.3.0)

**Reusable technique — proving a dep bump is not a grouped bump.** `git diff --stat` on
package-lock.json is not evidence; parse both lockfiles and diff the `packages` map:
extract base/head via `git show <ref>:package-lock.json`, then compare every key's
`version`/`resolved`. Reports added/removed/changed exactly. For #90: 0 added, 0 removed,
2 changed (eslint-config-next, @next/eslint-plugin-next). This is the check that would
have caught GARDEN-28/WALL-22.

**Repo gotcha — npm version skew strips `libc` from the lockfile.** Repo pins Node 24
(`.nvmrc`, `engines.node>=24`, CI `node-version: "24"`) which ships npm 11 and writes a
`libc` field on native optional deps. This sandbox has Node 22 / npm 10.9.7, which does
NOT. Any agent running `npm install` here regenerates the lockfile with all `libc`
metadata deleted — 30 packages in #90 (`@next/swc-linux-*`, `@img/sharp-*`,
`@rolldown/binding-*`, `lightningcss-*`), i.e. 89 of the PR's 99 deleted lines, pure
unrelated churn. CI (`npm ci`, Node 24) still passes, so it is 🟡 not 🔴. Expect this on
EVERY dependency PR produced in this environment — check for it, and tell the builder to
regenerate under Node 24.

**Tooling note.** `gh` CLI is NOT installed and the github MCP tools were unavailable this
run. Unauthenticated `curl https://api.github.com/repos/farmer-land/Authentix-dashboard/...`
works fine through the proxy — use `/pulls/N` for body+mergeable and
`/commits/<sha>/check-runs` to independently verify a PR's claimed green CI rather than
taking the PR description's word for it.

## 2026-08-21 — PR #93 / GARDEN-11 (silent failure handling) review

Verdict: safe to merge, 0 blockers, 3 advisory follow-ups.

Facts worth keeping:
- `apiRequest` in `src/lib/api/core.ts:118-120` and `:261-310` THROWS `ApiError extends Error`
  on `!response.ok || !data.success`. So `try/catch` around `api.*` calls is genuinely
  load-bearing in this repo — a fix that adds a catch is not a no-op. Confirm this before
  ever accepting "the client returns an error object" reasoning.
- `extractApiError` (core.ts:68) surfaces backend `error.message` verbatim into `err.message`.
  Toasting `err.message` is the established repo pattern (email-templates page.tsx:541), but it
  means backend message sanitation is what stands between a raw backend string and the UI.
  Whether `/billing/account` DELETE returns user-safe text is a BACKEND question -> WALL
  cross-repo-check, never guess it here.
- Email template editor: the autosave status indicator lives inside the `leftPanelVisible`
  floating panel (page.tsx:623-661). `page.tsx:192-196` sets `leftPanelVisible=false` when
  `window.innerWidth < 768`. So ALL autosave indicators (saving/saved/error) are invisible on
  mobile; the collapsed restore pill (page.tsx:616) shows only icon + template name.
  Pre-existing limitation, inherited by any new indicator added there.
- `DeleteAccountDialog` (billing/page.tsx:1070+) is HAND-ROLLED, not Radix: bare `fixed inset-0`,
  manual Escape listener, no role="dialog"/aria-modal/focus trap/focus return. Pre-existing.
  Good candidate for a Radix AlertDialog migration ticket.
- Red-before-green can be spot-checked WITHOUT mutating the tree: `git grep <asserted string>
  origin/main` — if the asserted UI strings don't exist on base, the tests structurally must
  have been red. Used here for 'Not saved' / 'Autosave failed' / 'Failed to request account
  deletion' (all absent on main). Cheap and non-destructive; reuse this.
- Repo baseline as of today: full suite 322 passed / 14 files, typecheck clean, lint 0 errors
  + 11 warnings (all pre-existing, in generate-certificate/*). Limit is 250 warnings.
  CI was NOT red before this PR.
