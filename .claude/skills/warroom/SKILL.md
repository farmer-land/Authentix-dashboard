---
name: warroom
description: Convene an adversarial investigation - several agents each own a competing hypothesis and try to disprove each other, with Heisenberg able to interrogate any of them live. Use for a production incident with an unclear cause, a finding two specialists disagree about, or a high-stakes decision with several defensible answers. Not for reporting, not for fixing a known bug.
---

# War room

An argument, held on purpose.

**Convene this for one reason only: a single investigator would find a plausible answer
and stop looking.** That is anchoring, and argument is the only reliable cure.

---

## The case that justifies it

The Railway egress, 2026-08-21. Three separate investigations, run one after another,
each by a capable agent:

| Investigation | Confident conclusion | Actually |
|---|---|---|
| First | Egress is $3.40, "noise" | Read one row of a multi-row result. **17x low.** |
| Second | OpenTelemetry, eliminated by measurement — "the leak is not in the application" | Measured the exporter, not the auto-instrumentation. **Wrong.** |
| Third | The dead `cron` services are the strongest lead | Zero across 10,081 samples. **Dead end.** |

The real cause was an unbounded Prometheus route label producing $100.76 of egress
over 72 days. Each investigator found something true, stopped, and reported with
confidence. **Sequential investigation anchors; the second run inherits the first's
frame.** Three agents arguing would have surfaced the contradiction on day one.

## When NOT to convene it

- **A known bug with a known fix.** That is one agent, or a workflow.
- **Reporting.** That is `/standup`.
- **Anything a measurement would settle in ten minutes.** Go and measure it.
- **When you already believe the answer.** A war room convened to ratify a conclusion
  is theatre, and expensive theatre.

This is the most expensive mechanism available — each teammate is a full independent
session that stays alive and talks. Reach for it last, per the escalation ladder in
`.github/WORKFLOW_STANDARDS.md`.

---

## Setting up

### 1. Enable teams FOR THIS SESSION ONLY

Agent teams are experimental and off by default. **Do not enable them in user settings.**

Enabling globally turns every *named* subagent into a teammate — and teammates report
"idle" **without their result**. Every orchestration that waits on a subagent result
silently stalls. That would break the dispatch pipeline this org runs on.

Set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` for this session, and **turn it back off
when the war room ends.** Teardown is part of the procedure, not an afterthought.

Tell Heisenberg it is on, and tell him again when it is off.

### 2. Clear the floor

Same as `/standup`. Nothing else runs. Background work spends the budget this
investigation needs, and a war room is the most expensive thing we do.

### 3. State the question as a falsifiable claim

Not *"why is the bill high"*. Rather: *"1,173 GB of egress left this service in 26 days.
What produced it?"* — a number that any theory must account for.

**Write the number that must be explained on the board first.** Every hypothesis is then
measured against it, and a theory that cannot reach the number is dead regardless of how
plausible it sounds.

---

## Rules of engagement

**Three to five teammates.** More produces noise, not coverage.

Each owns **one hypothesis** and is told, explicitly:

1. **Your job is to kill the others' theories, not to defend your own.** Prosecute, do
   not advocate.
2. **Eliminate by measurement, never by argument.** A theory dies when you show the rate
   it can reach and it falls short of the number on the board — not when you find it
   implausible. "OpenTelemetry can produce 72 MB/day against 44,800 MB/day required,
   therefore eliminated" is an elimination. "That seems unlikely" is not.
3. **Concede immediately when your own theory is killed**, and say what killed it. A
   teammate defending a dead hypothesis is worse than no teammate.
4. **Say when you cannot measure something.** An unmeasurable claim is unresolved, not
   supported.
5. **Message the others directly.** Send your elimination to the teammate whose theory
   it kills, by name, and let them answer.

Heisenberg can open any teammate's transcript and interrogate it directly — arrow keys
in the agent panel, Enter to view and message. **Tell him that at the start.** He is the
sharpest cross-examiner in the room and should use it.

## Convergence

The war room ends one of three ways. Name which:

- **One theory survives every attack and accounts for the number.** Write the
  elimination table showing what killed the others — that table is the RCA.
- **All theories die.** That is a real and useful outcome. Widen the frame and say
  plainly what was ruled out, so the next round does not repeat it.
- **Two survive and cannot be separated by available evidence.** Say so. Name the
  measurement that would separate them, and go and take it.

**Never let it end with a synthesis that smooths over a disagreement.** If two teammates
still disagree, that disagreement is the finding, and Heisenberg needs it intact.

## Closing

1. Publish the **elimination table** — every hypothesis, the measured rate it could
   reach, and what killed it. This is worth more than the answer, because it stops the
   next investigation re-treading dead ground.
2. File what is not already ticketed.
3. **Shut the teammates down and disable agent teams.** Confirm to him it is off.
4. State what is still unproven. A war room that ends with everything certain is one
   that stopped arguing too early.
