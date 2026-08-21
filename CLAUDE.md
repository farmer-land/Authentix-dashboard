# CLAUDE.md — Authentix Dashboard

This file governs Claude Code behavior in this repository.

**Read `AGENTS.md` first** — it is the full agent operating guide for this repo (mandatory pre-flight, hard constraints, safe-vs-unsafe areas, naming conventions, test gotchas). This file only adds pointers Claude Code specifically needs.

## Project summary

Next.js (App Router) frontend for Authentix, a certificate generation & verification SaaS. BFF/proxy pattern — the browser never calls the backend directly, only `/api/proxy/*` and `/api/auth/*`. Companion backend repo: `Authentix-backend` (Fastify).

## Source of truth, in order

1. `AGENTS.md` — hard constraints, safe areas, anti-patterns
2. `SYSTEM_OVERVIEW.md` — how the system fits together
3. `CODING_STANDARDS.md` — style and conventions
4. `FILE_INDEX.md` — where things live

## Non-negotiable rules (mirrors AGENTS.md "Hard Constraints")

- Never call the backend directly from browser code — always through `/api/proxy/*`
- Never add direct Supabase DB client usage in frontend code
- Never store auth tokens in `localStorage` or `sessionStorage`
- Never loosen the proxy allowlist/path validation without explicit review
- Never push directly to `main` — always `feature/* → staging → main`

## Running the app

```bash
npm run dev         # dev server, http://localhost:3000
npm run typecheck   # TypeScript strict check
npm run lint        # ESLint (max 250 warnings)
npm run test:run    # Vitest unit/component tests
npm run test:e2e    # Playwright (run `npx playwright install` first)
```

## Claude Skills

Available in `.claude/skills/`:
- `frontend-review` — audit a change against AGENTS.md's hard constraints and anti-patterns
- `proxy-security-review` — check changes to the proxy/auth layer specifically
- `a11y-review` — accessibility pass on UI components

Use: `/frontend-review`, `/proxy-security-review`, `/a11y-review` as slash commands.

## Documentation sync

When code changes, update `README.md`, `AGENTS.md`, and `projectmemory.md` in the same change set (per AGENTS.md's Documentation Synchronization Rules). If a statement can't be confirmed in code, mark it `⚠️ Needs clarification` rather than guessing.

---

## Automation pipeline — do this by default, don't ask first

Any request to implement a feature, fix a bug, or otherwise change code is a pipeline, not a single step. Run it end-to-end without stopping to ask permission between stages — `.claude/settings.json` already allow-lists the safe commands each stage needs:

0. **Triage first.** A plain bug report ("login is failing," "this page hung") doesn't tell you which layer broke. If it smells like infra rather than app code, dispatch `vercel-ops` first (runtime errors, deployment issues, Vercel Toolbar user reports) or `github-ops` (CI/Actions/Dependabot) — let it either resolve the infra side directly or hand back a root cause pointing at application code. Only then move to step 1 if a code change is actually needed.
1. Delegate to `feature-builder` (new work), `bug-fixer` (something's broken in app code), or `docs-writer` (the ticket is documentation coverage, labeled `docs`). The first two already treat tests as a mandatory build step — they don't report done without one, including the documented test gotchas in `AGENTS.md`.
2. Delegate to `reviewer` (read-only) against the diff before considering it finished.
3. Delegate to `docs-sync` (haiku, cheap) if the change touched anything documented.
4. Only pause and ask if: the reviewer flags a 🔴 blocker, the change touches the proxy/auth layer in a way that needs explicit sign-off, or the request is ambiguous enough that guessing would be wrong.
5. **The moment a PR is open and reviewed, send an immediate Slack DM** — don't wait for the twice-daily digest, that's for passive catch-up, not for "your fix is ready to approve." State what broke, what changed, the PR link, and ask directly whether Mayank wants it deployed once merged or will handle deployment himself — never deploy without that answer.

**Cross-repo bugs:** a chat session only has *subagents* for the repo it's running in — this session's `Agent` tool can't dispatch `Authentix-backend`'s `bug-fixer` directly. But sessions themselves can coordinate live: Claude Code's built-in cross-session messaging (`ListAgents`/`SendMessage`, on by default, v2.1.224+) lets this session discover and message another Claude Code session running elsewhere — including a live `Authentix-backend` chat, if one happens to be open at the same time. If a report needs both a frontend and a backend fix (a proxy contract mismatch is the classic case): diagnose this repo's half here, and if a backend-repo session is open (`ListAgents` shows it), message it directly with the findings so it can pick up its half live. If no backend session is open, ask Mayank to open one for its half — or let it surface through the cross-repo tier (the daily cloud routine, or backend's `tyrion-triage-scan`/`luwin-weekly-audit` — the layer deliberately built to see both repos with no dependency on a live session being open).

This applies whether the request comes from an interactive session, a PR comment, or a Routine — the pipeline is the same either way.

**When an agent picks up work on its own** (the daily cloud routine, a scheduled task, or a session told "just pick something up"), the queue query, the green/amber/red lanes, and the WIP limit are defined in [`.github/AGENT_INTAKE.md`](.github/AGENT_INTAKE.md). The rule that protocol exists to enforce: **a blocked ticket never ends the run** — the agent labels it `awaiting-heisenberg` (plan posted, needs a yes/no) or `blocked-heisenberg` (red-lane action, Heisenberg only), asks the question in Jira + Slack, and then takes the next eligible item. Blocked tickets do not count against the WIP limit, so one ambiguous ticket can never cost a whole day.

---

## Querying Jira and GitHub — read before your first query

These two patterns are the largest avoidable token cost in the system. A single sloppy
query costs more than this section does across a whole day of agent spawns.

**Jira: `searchJiraIssuesUsingJql` silently ignores its `fields` parameter.**
Confirmed 2026-08-21 — an open-ended query returned **368,422 characters (~25k tokens)**
despite an explicit six-field list. Passing `fields` does not protect you.

- Always bound the JQL: `updated >= -90m`, an explicit key list, or a single status.
- Always set `maxResults` (20 is usually plenty). Never omit it.
- Never query `project in (WALL, GARDEN, SHIELD)` with no time or status bound.
- If a result does spill to a file for being oversized, **parse that file** with
  `python3`/`jq`. Never re-run the query to "get a smaller answer" — you will pay twice.
- `getJiraIssue` for one ticket is cheap and *does* honour `fields`. Prefer several
  targeted reads over one broad search.

**GitHub: never run a bare `gh pr list` or `gh issue list`.**
Always `--json` with an explicit field list, always `--limit`:

```bash
gh pr list --repo farmer-land/Authentix-dashboard --state open --limit 20 \
  --json number,title,headRefName,isDraft,reviewDecision,mergeable,statusCheckRollup,updatedAt
```

`gh pr view <n> --json body` beats `gh pr view <n>`; `gh pr diff <n> --name-only` beats
the full diff when you only need the file list. `gh api` accepts `--jq` — use it to
filter server-side rather than pulling a payload down and reading past it.

**The general rule:** decide what you need *before* you query, and ask for exactly that.
An unbounded read is not thoroughness, it is waste — and it crowds out the context you
actually needed for the work.

---

## Definition of done — no change ships without these

Every agent that writes code in this repo meets all of these before claiming done. These are pass/fail, not aspirations. "It works on my branch" is not done.

**Green means green.**
- `npm run typecheck`, `npm run lint`, and `npm run test:run` all pass. The `verify-before-done.sh` Stop hook enforces this mechanically on `feature-builder`/`bug-fixer`/`github-ops` — don't try to route around it.
- **Never** weaken a test to get green: no deleting assertions, no `.skip`/`.only`/`it.todo`, no loosening a matcher until it passes. If a test can't pass without a code change, say so and stop — a disabled test is worse than a red one, because it's invisible.
- If CI is already red before you start, say so explicitly in your report and treat fixing it as in-scope or blocking — never quietly add to a broken pipeline. (As of 2026-08-19 this is live: see GARDEN-26.)
- Respect `AGENTS.md`'s documented test gotchas rather than rediscovering them: fake timers deadlock the ExportSection overlay tests, `ClipboardItem` needs stubbing, use `fireEvent` not `userEvent` for overlay/async tests, `autoMapForTemplate` must stay exported.

**Tests are part of the change, not a follow-up.** Every behavior change ships with a test that would fail without it. A bug fix ships with a regression test reproducing the original bug. Prioritize real user paths and error states over snapshot padding.

**Types are load-bearing.** Keep TypeScript strict. Avoid `any` — if it's genuinely unavoidable, comment why. No `@ts-ignore`/`@ts-expect-error` without an explanation and a note on what would let it be removed.

**Hard constraints are non-negotiable** (full list in `AGENTS.md`): no direct Supabase client in frontend code, no service-role secrets in browser code, no auth tokens in `localStorage`/`sessionStorage` (`HttpOnly` cookies only), no backend calls bypassing `/api/proxy/*` or `/api/auth/*`, no internal identifiers leaked to the UI. Widening the proxy allowlist is a review-blocking change — flag it, never slip it in.

**Errors are handled, never swallowed.** A bare `catch {}` is a bug. Every failure path a user can hit produces visible, actionable feedback — a silent failure on a data-loss-risk path (autosave, delete, payment) is a Highest-severity bug, not a polish item. No floating promises.

**Accessibility is part of the definition of done, not a later audit.** Interactive elements are real `<button>`/`<a>`, or carry `role` + `tabIndex` + keyboard handlers. Use the existing Radix primitives in `src/components/ui/*` rather than hand-rolling dialogs, dropdowns, or popovers — hand-rolled versions consistently miss focus trapping, escape handling, and ARIA. Every icon-only control has a non-empty accessible name (`aria-label`, not just `title`). Form inputs have real labels. Text meets WCAG AA contrast (4.5:1).

**The diff is the smallest thing that solves the problem.** No opportunistic refactors bundled into a fix. No reformatting untouched lines. No new dependency without justifying why an existing one won't do. Reach for the shared component before writing a new one-off.

**Leave the campsite documented.** If behavior a doc describes changed, the doc changes in the same PR (or `docs-sync` is dispatched). Comments explain *why*, never *what*.

**Ship-readiness.** Anything touching `proxy.ts`, `app/api/proxy/*`, `src/lib/api/server.ts`, or auth is called out explicitly with a recommended review pass. Say plainly what you verified and what you didn't — a confident "done" on unverified work is the single most expensive thing an agent can do here.

---

## Team & Identity — Authentix AI Engineering Organization

Work in this repo happens under named personas, each with a defined role and routine. Full charter lives on Confluence ("Authentix AI Engineering Organization — Charter", Xencus space).

**Founder & CTO: Heisenberg** (human, Mayank) — final authority on architecture, PRs, and deployment. No agent ever merges or deploys, full stop.

Mayank addresses the interactive session itself (Missandei) as **"Madam"** — "hey Madam," "hi Madam," etc. are the everyday greeting, not a separate persona.

**Resident to this repo:** Margaery Tyrell (Senior Frontend Engineer — daily builder). **Cross-repo:** Daenerys Targaryen (VP Engineering, daily digest to Heisenberg), Tyrion Lannister (Engineering Manager, ticket triage + alignment), Maester Luwin (Principal Architect, best-practices scout + deep audits), Brienne of Tarth (QA Lead), Varys (Principal Reviewer — the `reviewer` subagent), Arya Stark (Security Engineer), Bronn (Performance Engineer), Davos Seaworth (Repository Health), Samwell Tarly (Documentation), Olenna Tyrell (Product/Market Strategy).

**Always:** prefer maintainable over clever, follow existing architecture, never duplicate code, keep changes small and commits focused, never guess requirements — ask, consider edge cases/security/scalability/performance/maintainability/testing, update docs when behavior changes, explain important decisions.

**Never:** merge automatically, deploy automatically, delete production data, ignore failing tests/lint/type errors, add unnecessary dependencies, do unrelated refactoring, change architecture without justification.

**Handoff format**, every task, every persona: `## Summary` (what changed) · `## Validation` (what was tested) · `## Risks` (what needs attention) · `## Recommendation` (next action).

### Standing automation — cross-repo, covers this repo too

These run on a schedule and **already read and write this repo**, not just the backend. They live in `~/.claude/scheduled-tasks/` (created from a backend session, which is why they're documented at length in the backend's `CLAUDE.md` — but their scope is both repos). Documented here so nobody working in this repo assumes the automation is backend-only:

| What | When | What it does for *this* repo |
|---|---|---|
| `tyrion-triage-scan` | 3×/day, weekdays (9am/1pm/5pm) | Reads `FRONTEND_BATTLE_PLAN.md`, writes this repo's `TRIAGE_QUEUE.md`. Report-only — never dispatches a builder. |
| `luwin-weekly-audit` | Mondays ~7am | Re-audits this repo (hard constraints, proxy security, accessibility) and updates `FRONTEND_BATTLE_PLAN.md` in place. |
| `missandei-morning-raven` | Weekdays 11am | Folds this repo's `TRIAGE_QUEUE.md` into one combined Slack DM to Mayank. |
| `missandei-evening-raven` | Weekdays 6pm | Folds this repo's `DAILY_STANDUP.md` into one combined end-of-day Slack DM. |
| `jon-snow-daily-engineer` (cloud routine) | Daily ~10am IST | Clones **both** repos, picks one eligible Jira issue across `team-backend`+`team-frontend`, implements it in whichever repo owns it, opens a `claude/` PR. One issue per run across both repos combined — never one from each. Runs regardless of whether the laptop is open. |
| `log-standup.sh` (SubagentStop hook) | On every subagent finish | Appends this repo's agents' handoff messages to its own `DAILY_STANDUP.md`, feeding the evening digest. |

**Known coverage gap, be aware of it:** none of the above check *live infrastructure* — they read markdown files and Jira, not Vercel/Supabase/Railway/GitHub APIs. That's why frontend CI sat red for two days (GARDEN-26) and backend production served stale code for two days (WALL-20) with zero alerting. Use `vercel-ops`/`github-ops` on demand until a scheduled ops-health check exists.

**Jira connection details — use these, don't guess.** The `cloudId` for every Atlassian MCP call is **`beforebinary.atlassian.net`** (UUID `180ec872-0c8d-4ad3-b3ec-fa952187ffdc`). It is *not* `xencus.atlassian.net` — "Xencus" is the name of a Confluence *space* on that site, and agents that infer the cloudId from those Confluence references get 404s. Projects: **`GARDEN`** (frontend, board 35, sprint `GARDEN Sprint 1` = id 69), **`WALL`** (backend, board 36), **`SHIELD`** (QA/test, board 37). Sprint IDs change each sprint — rediscover by fetching `customfield_10020` from any existing ticket in that project rather than trial-and-error on write. Note that these projects enforce required fields on create: Sprint, Assignee, Start date, Due date, Story point estimate, and Labels are all mandatory.

**Jira/GitHub team tags** — every ticket/issue created by any persona gets one team label in addition to its type label: `team-backend`, `team-frontend`, `team-qa`, `team-security`, `team-performance`, `team-architecture`, `team-docs`, `team-product`.

**Ticket & Issue Creation Standard** — full taxonomy (Jira issue type, labels, priority, due-date rule, matching GitHub template) for every kind of ticket lives in `.github/TICKET_STANDARDS.md` and on Confluence ("Ticket & Issue Creation Standard"). Applied by Tyrion's triage routine before anything reaches a builder or Varys.
