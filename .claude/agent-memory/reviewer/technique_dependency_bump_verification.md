# Verifying a dependency-bump PR (learned reviewing PR #90 / GARDEN-30, 2026-08-21)

**Reusable technique — proving a dep bump is not a hidden grouped bump.**
`git diff --stat` on `package-lock.json` is not evidence; parse both lockfiles and diff the
`packages` map: extract base/head via `git show <ref>:package-lock.json`, then compare every
key's `version`/`resolved`. Reports added/removed/changed exactly. For #90: 0 added, 0 removed,
2 changed (`eslint-config-next`, `@next/eslint-plugin-next`). This is the check that would have
caught GARDEN-28/WALL-22 (a 38-package and a 205-package group landing at once).

**Repo gotcha — npm version skew strips `libc` from the lockfile.** This repo pins Node 24
(`.nvmrc`, `engines.node>=24`, CI `node-version: "24"`), which ships npm 11 and writes a `libc`
field on native optional deps. The agent build environment here runs Node 22 / npm 10.9.7,
which does NOT write that field. Any agent running `npm install` in this environment
regenerates the lockfile with all `libc` metadata deleted — 30 packages in #90
(`@next/swc-linux-*`, `@img/sharp-*`, `@rolldown/binding-*`, `lightningcss-*`), i.e. 89 of the
PR's 99 deleted lines were pure unrelated churn. CI (`npm ci` on Node 24) still passes, so this
is 🟡 not 🔴 — but expect it on EVERY dependency PR produced in this environment. Check for it,
and tell the builder to regenerate under Node 24 if a clean diff matters. Tracked as GARDEN-43.

**Tooling fallback, if Jira/GitHub MCP tools are unavailable in a given run.** `gh` CLI is not
installed. Unauthenticated `curl https://api.github.com/repos/farmer-land/Authentix-dashboard/...`
works fine through the proxy — use `/pulls/N` for body+mergeable and `/commits/<sha>/check-runs`
to independently verify a PR's claimed green CI rather than taking the PR description's word
for it.
