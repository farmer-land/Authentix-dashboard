# Agent Intake Protocol

**Who this is for:** every agent that picks up work on its own — the daily cloud routine, any scheduled task that dispatches a builder, and any interactive session told "just pick something up."

**The one rule this exists to enforce:** *a blocked ticket must never end the run.* Label it, ask the question, move to the next eligible item. One ambiguous ticket should never cost a whole day of engineering.

---

## 1. Pull the queue

Always a **targeted** JQL query. Never an unfiltered project-wide pull.

**Take work in this order. Finish what is already started before starting anything new.**

### Tier 1 — already in flight (ALWAYS check this first)

```
project = GARDEN
  AND labels = team-frontend
  AND status = "In Progress"
  AND labels NOT IN (blocked-heisenberg, awaiting-heisenberg)
ORDER BY priority DESC, updated ASC
```

A ticket sitting In Progress means a previous run started it and stopped — hit a turn cap, hit an error, or was interrupted. **That work is already paid for.** Abandoning it to start something fresh means paying twice for the same understanding, and on 2026-08-20 that pattern burned roughly 3.9 million tokens across seven runs that died mid-task.

Read the ticket's comments and any `claude/` branch for it before doing anything: the previous run may have committed real work. Continue from there rather than starting over.

Instructed by Heisenberg 2026-08-20: *"They will be picking the Jira ticket which is currently in. First, they will be checking the status, like, which is in resolve and progress or something. First, they will be trying to solve that, and then they will be taking a new ticket."*

### Tier 2 — QA bounce-backs

```
project = GARDEN AND labels = team-frontend AND status != Done
  AND labels IN (qa-failed) ORDER BY priority DESC
```

QA has already diagnosed the failure and quoted it. Cheapest possible fix.

### Tier 3 — cross-repo asks from the other repo's builder

```
project = GARDEN AND labels = team-frontend AND status != Done
  AND labels = cross-repo-check ORDER BY priority DESC, created ASC
```

### Tier 4 — new work

```
project = GARDEN
  AND labels = team-frontend
  AND status NOT IN (Done, "In Review", "In Progress")
  AND labels NOT IN (blocked-heisenberg, awaiting-heisenberg)
ORDER BY priority DESC, duedate ASC, created ASC
```

Swap `GARDEN` → `WALL` and `team-frontend` → `team-backend` when filing a cross-repo ask.

- **Priority first, then due date, then age.** Age is the final tiebreaker so nothing starves.
- **Skip `In Review`** — a PR is already out for it.
- **Skip both blocked labels** — a human owes an answer.

### Before you start ANY ticket: check it is not already fixed

There is no locking. Two runs can pull the same ticket, and a ticket can describe a defect that has since shipped. Both happened on 2026-08-20 — WALL-50 duplicated WALL-46 after WALL-46 was already merged and deployed.

So, for every ticket you are about to start:

1. `gh pr list --repo farmer-land/<repo> --state merged --limit 30 --search "<KEY>"` — if a merged PR already names this key, the work shipped. Comment saying so and move on; **do not close the ticket** (see §6).
2. Check for an open `claude/<KEY>-*` branch or PR. If one exists, another run is on it or left it half-done — continue that, never open a second.
3. Read the ticket's own comments. A duplicate is usually already flagged there.

If the query returns nothing eligible: say so, do not invent work, end the run cleanly.

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

## 6. Definition of Done — what must be PROVEN, not asserted

> ### ⛔ OVERRIDE — 2026-08-20: NO AGENT MOVES ANY TICKET TO DONE
>
> Heisenberg: *"Don't mark the tickets done until my permission for all the Jira tickets as well."* Applies to every ticket in every project — bug, gate ticket, duplicate, or one whose PR already merged. **A merged PR is not permission.** Work stops at **In Review**. Say it is awaiting his sign-off; never call it done.

### Why this section was rewritten on 2026-08-21

Research (WALL-62, [Confluence 2818061](https://beforebinary.atlassian.net/wiki/spaces/SCRUM/pages/2818061)) established the base rate: **between a fifth and a third of agent patches that pass their test gate are wrong** — 29.6% behaviourally divergent from ground truth ([arXiv:2503.15223](https://arxiv.org/abs/2503.15223), ICSE 2026), 31.08% suspicious under weak tests ([arXiv:2410.06992](https://arxiv.org/html/2410.06992v2)).

At that rate, WALL-46's three consecutive wrong-but-green fixes are **not** an aberration and **not** a model failure. They are ordinary. The gate simply had no power to detect this error class.

The literature is also clear on what does *not* help: **self-verification has negative evidence** — *"no prior work demonstrates successful self-correction with feedback from prompted LLMs"* ([arXiv:2406.01297](https://arxiv.org/html/2406.01297v3), TACL) — and all three attempts did exactly that. **Debate and majority-voting agent teams cannot exceed their strongest participant** ([arXiv:2508.17536](https://arxiv.org/html/2508.17536v1)); our three agents shared one blind spot, so ensembling would have reproduced it.

What *is* supported: **runtime grounding is the strongest measured lever** — removing runtime-grounded diagnosis drops resolution 56.0% → 48.0% ([SWE-Doctor](https://arxiv.org/html/2607.00990)) — and **diagnosis separated from fixing** ([Agentless](https://arxiv.org/html/2407.01489v1)).

So the gate now asks for evidence produced by *running things*, not for confidence.

### The gated artefact is the REPRODUCTION, not the fix

A fix is accepted on the strength of three pieces of recorded evidence. Missing evidence is a FAIL — not a note, not a caveat.

**Evidence 1 — recorded fail-to-pass, against the pre-fix commit.**
Not "I verified red-before-green." The actual output: check out the parent commit, run the new test, paste the real failure text into the PR. A test that has never been observed failing on unfixed code proves nothing.

**Evidence 2 — which branch production actually takes.**
State it, with a live query or log line, before claiming a fix works. PR #86 guarded `resolveFieldMapping` correctly and it changed nothing, because 28 of 28 live templates take the other branch. Nobody checked. Backend builders and `root-cause` have read-only Supabase and Railway access precisely so this is answerable — `SELECT` only.

**Evidence 3 — verification against the artefact the user receives.**
For certificates that means a **downloaded** file, not a preview: `previewRender()` runs different code from real generation. Generally: verify the thing the reporter actually saw.

### A declared coverage gap is a FAIL

If your "what was NOT tested" note excludes a dimension named in the ticket title or in the reporter's own words, **the gate fails.** Not a caveat — a fail.

This is the exact failure mode of SHIELD-8: QA honestly recorded *"did not test the start_date/end_date-specific branch — used generic type: 'date'"*, on a ticket titled *"start date and end date both render the end date"*, and passed the gate anyway. Honesty in the exclusions section is worthless if it does not stop the gate.

### Gate 1 — Developer

Writes the fix and produces Evidence 1, 2 and 3 above. Runs `type-check`/`typecheck`, `lint`, `test:run` for real and reports only what actually ran. **Never weakens a test** — no `.skip`, no `.only`, no deleted assertions, no loosened matchers.

Test **combinations**, not single inputs. WALL-46 had 23 passing single-field cases and missed the bug because nothing tested two fields of the same kind together.

**Moves the ticket to In Review and stops.** Never to Done. Never reviews or merges its own PR.

### Gate 2 — QA (Brienne)

Independently reproduces the *original reported symptom* — not just the developer's suite, which is exactly what missed the bug. If the symptom cannot be reproduced, that is a FAIL, not a pass by default: either the repro conditions or the diagnosis is wrong, and both matter before merge.

Audits the developer's evidence rather than trusting it: re-runs the fail-to-pass check herself, confirms the branch claim against live data, and inspects the delivered artefact. Applies `qa-passed` / `qa-failed` GitHub labels.

**Does not move anything to Done** — see the override above. Records the verdict and says it is awaiting Heisenberg.

### Gate 3 — Heisenberg

Merges, and closes the ticket. Nobody else, under any framing.

### Why three different evaluators

A developer who can mark its own fix Done is not a second check, it is the same check twice — and the research says that specific arrangement has *negative* evidence behind it. The gates only work as three different evaluators looking at the same claim from different angles: the code compiles, the actual bug is gone, this is safe to ship.

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
