# Delivery cycle — how work moves from idea to released

**Authoritative.** Where this file and an agent prompt disagree, this file wins.
Written 2026-08-21 from Heisenberg's own description of the cycle he wants, then
tightened where the clock was costing us hours.

---

## The one change that makes this fast: events, not clocks

The cycle he described is correct. What was slow was the *scheduling*.

Until today the pipeline was clock-driven: Jon Snow at 10:00, Brienne at 13:00,
Varys at 15:00, Davos at 20:00. A PR opened at 10:30 waited **2.5 hours** for QA
and another **2 hours** for review — 4.5 hours of dead time, and only one full
cycle possible per day. A QA failure at 13:00 could not be re-reviewed until the
next morning.

**The Night's Watch patrol is now the event loop.** It runs hourly in the cloud and
every 30 minutes locally, looks at the *state* of every ticket and PR, and dispatches
whoever is next. The daily routines stay, but they are **backstops**, not the
mechanism. Nothing waits for a clock any more.

Worst-case latency between a stage finishing and the next one starting drops from
hours to **≤30 minutes while Heisenberg is working**, ≤1 hour otherwise.

---

## Artefact hygiene — four rules, no exceptions

Added 2026-08-21 at Heisenberg's instruction, after a day in which duplicate tickets
were filed, a GitHub Issue went out as a bare title, and PR-to-Jira links were patched
up with manual comments instead of being made to work.

These apply in **WALL**, **GARDEN** and **SHIELD**, to every agent and every routine.

### 1. Search before you create. Always.

Before creating **any** Jira issue, GitHub Issue, branch or pull request, search for an
existing one. All four, every time:

```bash
# Jira — bounded, always maxResults
#   searchJiraIssuesUsingJql: text ~ "<the thing>" AND project in (WALL, GARDEN, SHIELD)
gh issue list  --repo farmer-land/<repo> --state all --limit 30 --search "<terms>" --json number,title,state
gh pr list     --repo farmer-land/<repo> --state all --limit 30 --json number,title,headRefName,state
gh api repos/farmer-land/<repo>/branches --jq '.[].name'
```

If something already covers it: **comment on that, do not open a second.** If it is
genuinely different, say in one line why, so the next agent does not re-litigate it.

A duplicate is not a tidy-up job. On 2026-08-20 a single run filed seven tickets and
left two duplicates behind, and `code-health` was ordered to check the board while
holding no Jira search tool at all — it could not have complied.

### 2. A GitHub Issue is never just a title.

Every Issue is fully populated on creation, or it is not created:

- **Type** — Bug / Task / Epic, set correctly
- **Labels** — the type label *and* exactly one `team-*` label, matching its Jira twin
- **Priority** — mirroring the Jira priority
- **The linked Jira key**, uppercase, in the body
- **Acceptance criteria** — what "done" means, checkable by someone else
- **Reproduction or context** — real output, `file:line`, the query you ran

A bare placeholder is worse than no Issue: it looks like tracked work and carries none.

### 3. A PR is fully linked, or the integration is broken and you say so.

Jira's key scan is **case-sensitive**. Put the exact uppercase key in **all four** places:

1. **Branch** — `claude/GARDEN-11-short-name`
2. **Commit messages** — at least the first one
3. **PR title** — leading, e.g. `GARDEN-11: …`
4. **PR body** — the `**Jira:**` line

Then **open the ticket and look at the Development panel.** Branches, Commits and Pull
Requests should all populate on their own.

**If they do not: stop and report an integration problem.** Do not paste a link in a
comment and move on — that hides a broken integration behind manual effort, and every
future ticket inherits the same breakage. Say plainly: *"Development panel did not
populate for GARDEN-11 despite the key being in branch, commits, title and body — the
GitHub↔Jira integration needs checking."* That is a finding, not a failure.

### 4. Reconcile before you call it done.

The work is not finished when the PR is open. Run a reconciliation pass:

- Every Jira issue that needs a GitHub Issue **has exactly one**
- Every GitHub Issue maps to **exactly one** Jira issue
- Every PR maps to **both**, and its Development panel shows it
- **No duplicates**, no orphans, nothing half-created

State the result in your handoff. If reconciliation fails, the task is not complete —
fix it or report precisely what is inconsistent and why you could not.

---

## The state machine

Every ticket is in exactly one state. Each state has exactly one owner and one
exit condition. If a ticket is in a state longer than its limit, the Night's Watch
escalates it.

| # | State | Owner | Exit condition | Stall limit |
|---|---|---|---|---|
| 1 | **To Do** | the queue | builder claims it | — |
| 2 | **In Progress** | builder (Jon Snow / Margaery) | tests written and green, PR open | 3h silent |
| 3 | **In Review** | Varys | `SAFE TO MERGE` or `BLOCKED` | 1h unreviewed |
| 4 | **In Review + reviewed** | Brienne | `QA PASS` or `QA FAIL` | 1h unverified |
| 5 | **Both gates green** | **Heisenberg** | he merges | 4h → Slack nudge |
| 6 | **Merged** | Davos | release recorded, ticket listed for closing | same day |
| 7 | **Done** | **Heisenberg alone** | he closes it | — |

**A ticket never skips a state.** A PR with one gate is not "nearly ready" — it is
in state 3 or 4, and the brief must say which gate is missing rather than rounding up.

---

## Stage by stage

### 1 → 2 · Claiming work

Before writing a line, the builder:

1. **Finishes what is already in flight.** In-Progress work outranks new work, always.
   A QA bounce-back outranks everything. The full queue order is `AGENT_INTAKE.md` §1.
2. Checks nobody else is on it — no commits or comments from another agent in the
   last hour. Two agents on one PR collided on 2026-08-21; do not repeat it.
3. Moves the ticket to **In Progress** with `getTransitionsForJiraIssue` (never a
   guessed transition name) and comments what it is about to do.
4. Classifies the work green / amber / red per `AGENT_INTAKE.md`. **Red never starts** —
   it gets `blocked-heisenberg` and the builder takes the next item.

**WIP limit: one item at a time, to completion.** Finish, then pick up the next.

### 2 → 3 · Developer done

The builder does not hand off until *all* of this is true:

- The fix is at the root cause, not the symptom
- A test exists that **fails without the fix** — recorded, quoted, not asserted
- `type-check`, `lint` and the test suite pass, with real output in the PR body
- The PR is open, with the uppercase Jira key in **branch, title and body** (Jira's
  key scan is case-sensitive; `wall-21` silently never links)
- The evidence gate in `AGENT_INTAKE.md` §6 is satisfied, or the gap is **declared**

A declared gap passes. A hidden one is a failure. Say what you did not verify.

Then: ticket → **In Review**, comment the PR link. That is the end of the builder's lane.

### 3 · Code review — Varys

Dispatched by the Night's Watch **as soon as CI goes green**, not at 15:00.

Read-only. Reviews correctness, security, tests and scope against the diff and the
repo's non-negotiable rules. Audits the **mocks** as well as the assertions — a mock
that pins the value under test is a test that cannot fail.

If the diff is substantially about error handling, fallbacks or swallowed failures,
Varys asks for a `silent-failure-hunter` pass rather than trying to cover it alone.
On 2026-08-21 that second pass caught two 🔴 findings a single review missed.

Ends with exactly one line: `SAFE TO MERGE` or `BLOCKED — N issues`.

**Blocked → straight back to the builder.** Not to a queue, not to tomorrow.

### 4 · QA — Brienne, on the real environment

**This is the stage that changes most.** Brienne has been testing a local checkout.
She should not be.

**Every PR gets a real deployed environment automatically, and always has:**

- **Backend** — Railway spins up a per-PR environment. The `railway-app` bot posts
  the link on the PR.
- **Dashboard** — Vercel posts a preview deployment on every PR.

Brienne tests **against that deployment**, because it is the closest thing to what a
user receives. A local `npm test` proves the code compiles and the units behave; it
does not prove the thing works.

Her order of work:

1. **Reproduce the original symptom on `main` first.** If she cannot reproduce it,
   that is a **FAIL**, not a pass by default — it means nobody has established the bug
   was real, and WALL-46 was "fixed" three times on exactly that mistake.
2. Show the symptom is gone on the preview deployment, same inputs.
3. Check the paths the fix did **not** touch.
4. Verify against the **delivered artefact** — the downloaded certificate, the actual
   API response — never a preview render. `previewRender` runs different code from
   real generation, which is why WALL-46 kept passing while shipping broken.
5. Audit the tests: any `skip`, `only`, deleted assertion, weakened matcher, or mock
   that hardcodes the value under test.
6. Verify red-before-green by **reverting the fix and watching it fail**, not by
   believing the claim.

Verdict: `QA PASS` or `QA FAIL — N issues`, plus the `qa-passed` / `qa-failed` GitHub label.

**FAIL → ticket moves back out of review, straight to the builder**, with the real
output quoted. Brienne owns moving a ticket backwards. She never moves one to Done.

### 5 · Heisenberg merges

A PR reaches him only with **both** `SAFE TO MERGE` and `QA PASS`.

He merges. Nobody else, ever — the permission model now refuses `gh pr merge`
outright rather than asking.

If it sits over 4 hours with both gates green, the Night's Watch sends **one** Slack
line. Not one per PR per run — one message covering all of them.

### 6 → 7 · Release and close

Merging to `main` already triggers the production deploy. Davos records what went
out, tags it, links the release back to every ticket, and **verifies production is
actually healthy afterwards**.

He then lists every merged ticket under **"Merged, awaiting your sign-off to close"**.

**Closing a ticket is Heisenberg's alone.** A merged PR is not permission to close —
merging and closing are two separate decisions. Three agents in a row declared
WALL-46 fixed when it was not; a ticket at Done is the signal he reads as "I no
longer need to look at this", and an agent that is wrong *and* closes the ticket
removes the last chance to catch it.

---

## Heisenberg's own day

| When | What reaches him | What he does |
|---|---|---|
| **09:28** | Morning brief — what shipped yesterday, what needs him, what is queued | Reads. Answers blocked questions in Slack. |
| **10:00–18:00** | Live session. He reports bugs as he hits them. | Merges PRs. Closes tickets. Answers red-lane questions. |
| **every 30–60 min** | Night's Watch — silent unless something stalled | Nothing, normally. |
| **every 4h** | Slack approvals relay applies his answers to Jira | Nothing. |
| **18:22** | Evening brief — what shipped, what is ready to close, what is queued for tomorrow | Closes the batch. |

**His answers reach Jira through Slack.** He replies in the DM; the approvals relay
picks it up within 4 hours, records his decision verbatim on the ticket, removes the
blocking label, and the work restarts on its own. He never has to open Jira to unblock
something.

**The close-out he asked for** is the evening brief's "ready to close" list. One batch,
once a day, so finished work actually closes instead of accumulating — and so the
board reflects reality when the next morning's builders read it.

---

## What escalates, and how

Three lanes, from `AGENT_INTAKE.md`:

- **Green** — the agent does it and reports. No approval.
- **Amber** — plan posted to Jira, labelled `awaiting-heisenberg`, one Slack line.
  **The agent then takes the next item.** A blocked ticket never ends a run.
- **Red** — Heisenberg's action only. Labelled `blocked-heisenberg`, never started.

Always red: migrations needing production sign-off · anything changing a live
auth/billing/webhook contract · deleting or regenerating production data ·
merging · deploying · closing a ticket.

**Blocked tickets do not count against the WIP limit.** One ambiguous ticket can never
cost a day.

---

## The stall detector

The Night's Watch checks four things every run and fixes what it can:

1. **PR green + unreviewed** → dispatch Varys now
2. **Ticket In Progress, silent 3h** → is there a branch? If yes, move it to In Review.
   If no branch exists, the work never started — say so and re-dispatch.
3. **Blocked over 6h with no comment** → one consolidated Slack message, never one per ticket
4. **Branch pushed with no PR** → the builder died at the final step. Open the PR
   with an honest body saying the evidence gate was **not** satisfied, and label the
   ticket `needs-verification`.

That fourth check exists because 26% of subagent tokens on 2026-08-20 went into runs
that died *after* doing the work and *before* persisting it.

---

## What is deliberately NOT automated

- **Merging, deploying, closing.** Heisenberg's, always.
- **Deciding a bug is real.** QA reproduces it first; nobody takes a report on faith.
- **Root-cause analysis, code review, product decisions.** Judgement calls where being
  confidently wrong is expensive. Over-automating judgement is precisely how silent
  failures ship.
