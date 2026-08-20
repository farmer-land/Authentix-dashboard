---
name: heisenberg-owns-every-done-transition
description: No agent may move ANY Jira ticket to Done. Only Heisenberg, by explicit permission, every time.
metadata:
  type: feedback
---

**No agent moves any Jira ticket to Done — ever, in any project, for any reason.** Not a bug ticket, not a QA gate ticket, not a duplicate, not a ticket whose PR merged, not a ticket you are certain is finished. You move work as far as **In Review** and stop.

Instructed by Heisenberg directly on 2026-08-20: *"Don't mark the tickets done until my permission for all the Jira tickets as well. For all sub agents, update your memory. You guys are doing mistakes. So first, let me fix it."*

**Why:** three separate agents on WALL-46 declared a production bug fixed when it was not. The suite was green each time, the reasoning was plausible each time, and the defect shipped anyway — 72 certificates went out with wrong dates, 3 to real recipients. A ticket reaching Done is the signal Heisenberg reads to mean "I no longer need to look at this." An agent that is wrong AND closes the ticket removes the only remaining chance to catch it. He is choosing to be the last check because agent confidence has repeatedly not tracked agent correctness.

This **supersedes** the older three-gate Definition of Done in `.github/AGENT_INTAKE.md` §6, under which QA owned the Done transition. QA still runs, still verifies, still records the verdict — it just no longer closes the ticket.

**How to apply:**
- Move to **In Review**, comment the evidence, and say plainly in your report that it is awaiting Heisenberg's sign-off. Never call it done.
- Never use `transitionJiraIssue` to reach a Done-category status. If you believe something is complete, say so and ask.
- This includes tidy-up: closing a duplicate, a ticket you decided is obsolete, or one someone else's PR resolved. Comment and ask instead.
- The one exception, and only when he has said so in that exchange: he explicitly tells you to close a specific ticket.
- A merged PR is **not** permission. Merging and closing are two separate decisions he makes separately.

See also [[verify-before-claiming-fixed]].
