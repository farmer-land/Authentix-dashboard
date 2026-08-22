# Operating modes — focus and autonomous

Set by Heisenberg 2026-08-22, after background work consumed his session limit
mid-conversation and killed two security reviews that never ran.

There is a single shared token budget. **Anything running in the background is
spending the budget he is trying to use.** These two modes exist to stop that.

---

## Focus mode — while he is working (roughly 10:00–18:00)

**Default during working hours.**

- All scheduled tasks are **paused**. No Jira sweeps, no code-quality ratchet, no
  audits, no triage runs.
- **No workflow runs unless he explicitly asks for one.** A workflow is 6–18 agents
  and roughly 0.9–2.6M tokens; started while he is working, it competes directly
  with him.
- Diagnosis is done **in the main session**, not delegated. Reading files and tracing
  a defect costs almost nothing; a subagent costs ~55k before it opens a file.
- **One agent at a time, and only after he has confirmed the cause.** A dispatch on
  an unconfirmed diagnosis buys a wrong fix at full price.
- He performs reproduction, verification and acceptance himself by looking at the
  running product. Those are the three most expensive phases for an agent and the
  three he does better. Do not duplicate them.

## Autonomous mode — while he is away or asleep

Entered when he says he is leaving, going out, or going to sleep. **He says it; do
not infer it from silence.**

- Scheduled tasks resume: stalled-work patrol, code-quality ratchet, Jira triage,
  PR review, QA verification, docs audits.
- Workflows may run. Prefer the expensive, broad ones here — full-lifecycle
  remediation, audits, sweeps — precisely because nobody is waiting.
- Everything still obeys the standing gates: **never merge, never deploy, never move
  a ticket to Done.** Work accumulates as reviewed PRs for him to decide on.
- The code-quality ratchet's own gate still applies: one open PR per repo, then stop.
- A brief is ready for when he returns: what moved, what is waiting on him, what
  broke.

---

## Switching

**He says the mode; Missandei performs the switch.** He should not have to ask twice
and should never be asked "shall I turn the routines back on?" every morning.

- *"hi" / "I'm back" / "let's work"* → focus mode. Pause the background tasks.
- *"I'm going" / "going to sleep" / "away for a few hours"* → autonomous mode.
  Resume them, queue the overnight work, confirm what will run.

Announce the switch in one line, then get on with it.

## Schedules that encode this

- `nights-watch-patrol` — every 30 min, **18:00–09:00 only**. Silent unless something
  is stalled.
- `system-health-digest` — **08:48 daily**, deliberately before the working day, so the
  report is waiting rather than being produced while he works.

Anything added later must state which mode it belongs to. A routine that runs during
focus hours has to justify why it is worth the tokens it takes from him.

## The honest limits

- **These are local scheduled tasks. They need this laptop awake.** If it sleeps, the
  overnight window produces nothing. Cloud routines would fix that, but at 12:35 on
  2026-08-21 the cloud environment had no GitHub access — 403s, `gh` absent — so a
  cloud routine cannot currently open a PR. That needs re-testing before the overnight
  plan can be relied on.
- **The budget is shared, not reserved.** Autonomous work drains the same pool he
  wakes up to. Overnight runs should end well before he starts, not butt against it.
- On 2026-08-21 a workflow's last two agents died on `You've hit your session limit`.
  Two security reviews were lost. That is the failure this document exists to prevent,
  and it will recur if a large workflow is started late in a session.

---

## Hard limits on autonomous work

Set by Heisenberg 2026-08-22. These are not guidance. An agent that breaches one has
failed the run regardless of what else it produced.

**NO DEPLOYMENT.** Not to production, not to staging, not a redeploy, not a restart.
`main` auto-deploys on push, which is why nothing may be merged either.

**NO DATABASE CHANGES OF ANY KIND.** No migration applied, no DDL, no data written,
no schema edit, no RLS policy touched, no Supabase dashboard change. There is exactly
one Supabase project and it **is** production — there is no dev database to be wrong in.
A migration may be *written* and proposed in a PR; it may not be *run*.

**NO MERGE, NO TICKET CLOSED.** Work accumulates as reviewed pull requests.

**NO INFRASTRUCTURE CHANGES.** No Railway or Vercel setting, no service deleted, no
environment variable added or removed. Where a change is needed, write the exact steps
in the PR body for Heisenberg to perform.

The night produces **pull requests and Jira tickets. Nothing else.**

## The daily approval queue

Nothing runs overnight that he has not approved. Each evening, before he leaves,
present exactly:

- **Five things that are failing** — real defects, ranked by what costs money or
  breaks tenant isolation. Each with the evidence and the file:line, not a description.
- **Two things worth adding** — a missing test tier, a missing guard, a structural
  improvement. Two, not five: additions compete with repairs and repairs win.

He approves the list, or strikes items from it. **Only approved items run.** An agent
that finds something better overnight files it as a ticket for tomorrow's list rather
than acting on it.

This is the same rate limit as everywhere else in this system: he is the gate, and the
machine may not outrun him.
