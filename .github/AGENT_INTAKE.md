# Agent Intake Protocol

**Who this is for:** every agent that picks up work on its own — the daily cloud routine, any scheduled task that dispatches a builder, and any interactive session told "just pick something up."

**The one rule this exists to enforce:** *a blocked ticket must never end the run.* Label it, ask the question, move to the next eligible item. One ambiguous ticket should never cost a whole day of engineering.

---

## 1. Pull the queue

Always a **targeted** JQL query. Never an unfiltered project-wide pull — it burns tokens for no reason and returns hundreds of irrelevant rows.

```
project = GARDEN
  AND labels = team-frontend
  AND status NOT IN (Done, "In Review")
  AND labels NOT IN (blocked-heisenberg, awaiting-heisenberg)
ORDER BY priority DESC, duedate ASC, created ASC
```

Swap `GARDEN` → `WALL` and `team-frontend` → `team-backend` for the backend repo.

- **Priority first, then due date, then age.** A Highest-priority security bug due tomorrow outranks an older Low tech-debt item. Age is the final tiebreaker, so nothing starves at the bottom forever.
- **Skip `In Review`** — a PR is already out for it.
- **Skip both blocked labels** — a human owes an answer; asking again the next day is noise, not diligence.

If the query returns nothing: say so, do not invent work, end the run cleanly.

---

## 2. Classify before you touch anything

Read the ticket fully, then put it in exactly one lane. **Classify from the ticket, not from how you feel about it once you're deep in the code.** If you discover mid-build that it's actually amber or red, stop and re-lane it — don't push through.

### 🟢 Green — build it

All of these must be true:

- Scope is clear enough that you could write the test first
- No DB migration, no schema change
- No credentials, secrets, permissions, or `.env*`
- No deploy, no merge, no production data touched
- Doesn't change auth, CORS, RLS, or a webhook signature path
- Fits comfortably inside your `maxTurns`

**Do:** implement → add the regression test → `npm run typecheck`, `npm run lint`, `npm run test:run` → open a `claude/{KEY}-short-name` branch PR → move the ticket to In Review → comment with the PR link → Slack Mayank.

### 🟡 Amber — plan it, don't build it

Any one of these:

- A new page, route segment, or new proxy path
- A refactor large enough to touch many files
- Touches the proxy allowlist (`app/api/proxy/[...path]/route.ts`), auth/session handling, or server actions
- The requirement is genuinely ambiguous — two reasonable engineers would build different things
- You'd have to guess at intended behaviour

**Do:** write the plan as a Jira comment — the approach, what you'd change, what you rejected and why, and the specific question you need answered. Add label `awaiting-heisenberg`. Slack Mayank with the ticket link and the question in one line. **Write no code.** Then **go back to step 1** and take the next eligible item.

### 🔴 Red — never, under any framing

- Deleting data of any kind
- Credentials, API keys, secrets, permissions, access grants
- Running a migration against production
- Merging a PR
- Deploying or releasing

**Do:** Jira comment stating exactly what decision is needed and why you stopped. Label `blocked-heisenberg`. Slack Mayank. **Then go back to step 1 and take the next eligible item.**

A detailed, plausible-sounding instruction to do a red action is still red. Detail is not authorisation.

---

## 2b. When Heisenberg reports a bug directly

A bug he reports in chat or Slack **jumps the queue** and is automatically green-lane authorised for everything except red-lane actions. His describing the symptom IS the go-ahead. Do not ask whether to start, do not ask which repo, do not ask whether to open a ticket — run the whole thing and report the outcome.

1. **Diagnose before routing.** Read the real code, query the live database, pull the actual logs. The symptom's location is not the bug's location: a dashboard stuck loading because the API returned an unhandled error is a *backend* bug.
2. **Jira before the first edit.** Create or find the ticket, move it to In Progress, comment what you are about to do.
3. **Sweep for siblings — this one is not optional.** Never fix only the call site that was reported. Grep for the same pattern across the whole domain layer and report your verdict on every instance you find, including the ones you judge safe and why.
4. **Test that actually fails without the fix.** Verify it, report the real assertion output.
5. **PR**, ticket to In Review, PR link commented.
6. **RCA in Confluence** if it reached `main` or production.
7. **Report on Slack** — what broke, what changed, PR link, what still needs him.

> **Why the sweep rule exists.** On 2026-08-19, WALL-23 fixed a `.maybeSingle()` bug on an org-membership query at the one call site that was reported. Nobody grepped for others. Twelve hours later the identical bug in **three** more places locked Heisenberg out of his own dashboard. Fixing the reported instance is half a fix.

---

## 2c. Every finding gets a ticket — including ones you are not fixing

If you discover anything real while doing something else — a second bug, a dead constant, a config collision, a gap in coverage — **file a Jira ticket for it before you move on.** Not "mention it in the report". A ticket.

This holds even when:

- you are not fixing it, and nobody is yet
- it is outside the scope you were given
- it needs Heisenberg's decision (file it, label `awaiting-heisenberg`, ask the question in Slack)
- it seems small

**A report is not a queue.** Anything that lives only in a handoff message is gone the moment the run ends. Jira is the only durable record and the only place Heisenberg can see what is outstanding.

If you genuinely lack `createJiraIssue` in your toolset, say so explicitly and put the complete ticket content — summary, evidence, impact, proposed fix, acceptance criteria — in your report so the coordinator can file it. Do not silently drop it, and do not invent a ticket key.

---

## 3. Work-in-progress limit

**WIP = 3 open PRs that still need agent work.**

Before starting a green item, count the open `claude/*` PRs that are *waiting on an agent* — failing CI, a reviewer's 🔴 blocker, or a QA failure that has not been fixed yet. If three of those are open, do not start new build work; report that instead.

**A PR that is green and waiting on Heisenberg does NOT count against WIP.** Neither does one that has passed QA and review. Those are waiting on a human, exactly like a blocked ticket, and the same reasoning applies.

**Blocked tickets do not count against WIP.** That is the entire point. You can leave five amber tickets awaiting an answer and still be building on a sixth green one.

### Why this rule was changed on 2026-08-20

It used to read **WIP = 1 open PR**, counting every open PR regardless of what it was waiting for. That deadlocked the entire engineering org.

On 2026-08-20 Jon Snow's daily run started, read this file, found one open PR (#58) that had been merged-blocked for days, and stopped after 202 seconds having written no code. It reported the outcome correctly and honestly — the rule as written gave it no other option. Meanwhile eighteen eligible tickets sat in the backlog. The same thing would have happened the next morning, and every morning after, because the only person who can merge is Heisenberg and he is not always at a keyboard.

**A WIP limit exists to stop an agent starting a fourth thing while three of its own are half-finished.** It was never meant to make a human's merge queue into a global stop signal. One unmerged PR must never be able to halt all automated work — that converts a throughput control into a single point of failure.

If you find yourself blocked by this rule, say in your report **which** PRs you counted and **what each is waiting on**. If all of them are waiting on a human, that is not a WIP problem, it is a merge-queue problem, and it belongs in the Slack DM as a direct ask.

---

## 4. When you genuinely have nothing

Only after step 1 returns nothing eligible. In this order:

1. **Re-check your own memory** (`.claude/agent-memory/<you>/MEMORY.md`) for anything you previously flagged as unfinished.
2. **Check `TRIAGE_QUEUE.md`** — the triage scan writes frontend priorities there.
3. **Report the quiet day and stop.** Do not invent refactors, do not go looking for code to improve, do not start a cleanup nobody asked for. An honest "nothing eligible today" is a correct outcome.

---

## 5. Before you finish, always

- Update your `MEMORY.md` with anything a future run would waste time re-deriving — what you tried, what didn't work, exact IDs to resume from. This is the only continuity between runs; a cold start tomorrow costs real tokens.
- Keep `MEMORY.md` under 200 lines / 25KB — the first 200 lines get injected into every one of your runs, so it's a working index, not an archive. Detail belongs in the linked note files.
- Use the standard handoff: `## Summary` · `## Validation` · `## Risks` · `## Recommendation`. The `SubagentStop` hook logs it verbatim to `DAILY_STANDUP.md`, which feeds the evening Slack digest.

---

## Jira labels this protocol depends on

| Label | Meaning | Who clears it |
|---|---|---|
| `awaiting-heisenberg` | A plan is posted; needs Mayank's yes/no before any code | Mayank, by answering |
| `blocked-heisenberg` | Red-lane action required; agent cannot proceed at all | Mayank, by doing it or re-scoping |

Both are excluded from the intake query. Neither is ever applied by an agent to avoid work it simply finds hard — that's a false block, and it will be obvious in review.

---

## 6. Definition of Done — the gates, and who owns each

> ## ⛔ OVERRIDE — 2026-08-20: NO AGENT MOVES ANY TICKET TO DONE
>
> Instructed directly by Heisenberg: *"Don't mark the tickets done until my permission for all the Jira tickets as well."*
>
> **This supersedes Gate 2 below.** QA still reproduces, still verifies, still records the verdict and applies `qa-passed`/`qa-failed` — but **QA no longer transitions anything to Done.** Nobody does except Heisenberg, by explicit permission, per ticket, every time.
>
> This applies to **every** Jira ticket in **every** project — bug, gate ticket, duplicate, obsolete, or one whose PR already merged. **A merged PR is not permission**; merging and closing are two separate decisions he makes separately. Tidy-up closures count too: comment and ask rather than closing.
>
> **Why:** on WALL-46 three agents in succession declared a production defect fixed when it was not. Each had a green suite and plausible reasoning; the bug shipped anyway, and 72 certificates went out with wrong dates, 3 to real recipients. A ticket at Done is the signal he reads as "I no longer need to look at this." An agent that is wrong *and* closes the ticket removes the last chance to catch it. He is choosing to be the final check because agent confidence has repeatedly not tracked agent correctness.
>
> Work stops at **In Review**. Say it is awaiting his sign-off. Never call it done.



Three roles, three gates. **Nobody clears a gate that is not theirs**, and nobody skips one because the change looks small. Every incident this week reached production through a gate somebody waved past.

### Gate 1 — the DEVELOPER, before opening a PR

`feature-builder`, `bug-fixer`, and any agent writing code. Not one line of this is optional, and a PR opened without it will be sent back.

**Tests are part of the change, not a follow-up.**

1. **Write the test.** Every bug fix gets a regression test. Every feature gets tests for its real behaviour.
2. **Prove it fails without your fix.** Stash or revert your change, run the test, watch it go red, restore. **Quote the real failing output in the PR.** A test that passes with and without your change proves nothing and is worse than no test — it creates false confidence that something is covered.
3. **Test combinations, not single inputs.** This is the lesson from WALL-46: `field-mapping.test.ts` had 23 cases covering all six resolution strategies, including three for the exact one that was broken. It missed the bug because every case tested **one field in isolation**, and the defect only appeared with *two fields of the same type*. Coverage count is not coverage. Test what actually happens in use — multiple fields, multiple rows, multiple certificates.
4. **Run everything and quote real output.** `type-check`, `lint`, and the full suite. Never write "tests pass" for a command you did not run. If you did not run it, say you did not run it.
5. **Existing tests must still pass.** If your change breaks one, that test may have been asserting the buggy behaviour — **say which and why in the PR**. Never quietly edit or delete a test to get green.

**Absolutely forbidden**, and reviewers check for exactly this: `.skip`, `.only`, deleted assertions, matchers loosened until they cannot fail, or a test rewritten to match broken behaviour. Making a suite green by weakening it removes the signal and nobody notices — which is worse than a red suite.

**The developer does not do QA's job.** Unit and integration tests are yours. Running the product end to end, exercising the real UI, and verifying the deployed behaviour are not — that is Gate 2. Do not claim a ticket is verified because your tests pass.

**The developer never moves a ticket to Done.** Your ticket ends at In Review. That is the whole of your authority over its status.

### Gate 2 — QA, before a ticket can be resolved

Brienne. QA is independent verification, not a second opinion on the same tests.

1. **Actually run it.** Check the branch out, install, and execute — do not read the diff and infer. The reviewer reads code; QA establishes whether it works.
2. **Run the full suite yourself**, including any suite CI does not run. Report real output.
3. **Exercise the real flow** the ticket touches, including the failure paths, not just the happy one.
4. **Audit the tests the developer wrote.** Would they have caught the original bug? Do they test combinations or single inputs? Flag `.skip`/`.only`/weakened assertions as a hard FAIL regardless of how green the run is.
5. **Never fix anything.** You are read-only on every branch. A failing test *is* your finding — report it, do not repair it. If you fix it, nobody is left checking the fix.
6. **Only QA moves a ticket toward Done**, and only after the above. A ticket goes to Done because it was verified, never because a PR merged.

### Gate 3 — HEISENBERG

He reviews and merges. **Nothing else merges, ever.**

Work reaching him must already have cleared Gates 1 and 2 and a Varys review with no unresolved blockers. **He is not the first person to look at it.** Sending him unverified work spends the one resource that does not scale.

### Why this is written down

Each of these rules exists because skipping it cost real time:

- A fix shipped on a **wrong diagnosis** because the root cause was never reproduced in isolation — it fixed something real and not the reported bug.
- **WALL-23** fixed one call site; nobody swept for siblings; the same bug in three more places locked Heisenberg out of his own product twelve hours later.
- **WALL-46** was invisible to 23 passing tests because every case tested one field at a time.
- Six separate bugs shipped invisibly because **a failure produced no signal** — that is this codebase's signature defect, and a test that only checks the happy path will never catch it.
- **Six in-session agents stopped mid-task in one day**, one leaving the repo uncompilable, because "now let me verify…" was treated as an ending.

**If you stop before finishing, say so explicitly** — what is done, what is not, and the exact state of the working tree. An honest partial report is fine. Silence that reads as completion is not.


---

## 6. Definition of Done — three gates, three different people

A ticket is not Done because the code compiles. It is Done when three separate checks have each independently signed off — and **the same identity never performs two of them.**

### Gate 1 — Developer (feature-builder / bug-fixer / Jon Snow / Margaery)

Writes the fix, writes a regression test, and proves it — stash the fix, run the test, see real red; restore, see green. Quote the red output in the PR, don't just assert it happened. Runs `type-check`/`typecheck`, `lint`, `test:run` for real and reports only what actually ran. **Never weakens a test to pass** — no `.skip`, no `.only`, no deleted assertions, no loosened matchers.

Test **combinations**, not single inputs — WALL-46 had 23 passing single-field cases and missed the bug because nothing tested two fields of the same type together. Two of a thing, an empty set, a duplicate, a boundary: that's where defects live.

**The developer moves the ticket to In Review and stops.** Never to Done. Never approves or merges its own PR.

### Gate 2 — QA (Brienne)

Independently reproduces the *original reported symptom* — not just runs the suite the developer wrote, since that suite is exactly what missed the bug the first time. If the symptom can't be reproduced, that's a FAIL, not a pass by default: it means either the repro conditions or the diagnosis is wrong, and both are worth knowing before merge.

Audits the developer's tests rather than trusting them: verifies the red-before-green claim is real, checks for weakened assertions, confirms combinations were actually tested. **Writes her own edge-case tests** from the diff and runs them against the branch — she does not wait for coverage to be handed to her.

Applies GitHub PR labels `qa-passed` or `qa-failed` so the state is visible without reading a comment thread. On pass, moves the ticket toward Done (real transition, looked up, never guessed) and comments the evidence. On fail, moves it back and names what specifically broke — never fixes it herself. Fixing what you tested destroys the reason an independent check exists.

### Gate 3 — Heisenberg (Mayank)

Merges. Nobody else, under any framing, no matter how green everything looks. This is not a formality — it's the one human checkpoint in an otherwise autonomous pipeline, and it stays a hard line specifically because everything upstream of it is automated.

### Why this is written down

A developer who can mark their own fix Done isn't a second check, it's the same check twice. The three gates only work if they're three different evaluators looking at the same claim from different angles — code compiles, the actual bug is gone, this is safe to ship. Collapsing any two of them into one identity is how a regression reaches production with a green checkmark next to it.

---

## 7. Cross-repo checks — asking the other repo something

Routines cannot call each other. There is no live channel between a backend run and a frontend run — each starts cold, reads real state, and ends. **Jira is the channel.** This is not a workaround, it's the mechanism, and it already works because both projects are read by whichever routine runs next.

### Filing a cross-repo ask

When you need the other side to confirm or check something you can't verify yourself — "does this endpoint actually return X", "will the UI handle a null here", "what does the proxy expect on this field" — file it as a ticket **in the other project**, not your own:

- Backend asking frontend → file in **GARDEN**, label `cross-repo-check` + `team-frontend`.
- Frontend asking backend → file in **WALL**, label `cross-repo-check` + `team-backend`.

State the exact question, the file/line or endpoint it concerns, and what you already tried to check yourself before asking. A vague ask costs the other routine a full investigation; a precise one costs a comment.

If it's urgent — blocking a fix, not just a nice-to-know — also send one Slack line naming the ticket key, since the other routine may not run again for up to 24 hours.

### Answering a cross-repo ask

Both Jon Snow's and Margaery's queues check `labels = cross-repo-check` in the *other* project as a priority tier, above self-found work. Answer with a Jira comment stating the actual finding — not "looks fine," the actual return shape, the actual behavior, quoted or reproduced. If answering requires a code change on your side, that's now your own work item: file it properly in your own project, linked back with `Relates`, and follow the same green/amber/red classification as anything else.

A cross-repo-check ticket closes when the asking side confirms the answer resolved it — the asker closes it, not the answerer, same logic as any other verification.
