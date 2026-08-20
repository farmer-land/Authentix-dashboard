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

## 3. Work-in-progress limit

**WIP = 1 open PR at a time.** Before starting a green item, check whether a previous run already left a `claude/*` PR open. If one is open and unmerged, do not start new build work — report that instead.

**Blocked tickets do not count against WIP.** That is the entire point. You can leave five amber tickets awaiting an answer and still be building on a sixth green one.

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
