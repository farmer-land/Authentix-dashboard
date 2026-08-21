---
name: standup
description: Run the engineering standup with Heisenberg. Pauses all background work, then walks him through what each specialist did, what is waiting on him, and what is blocked - one report at a time, so he can question any of them before moving on. Use when he says standup, scrum, sync, or asks what everyone has been doing.
---

# Standup

A synchronous meeting. **He is in the room, so nothing else runs.**

---

## Step 0 — clear the floor, before anything else

Background work spends the same budget as this conversation. On 2026-08-21 a
background workflow consumed his session limit mid-conversation and two security
reviews died un-run.

So: **switch to focus mode first**, per `.github/routines/operating-modes.md`.

- Pause the scheduled tasks that would fire during the meeting.
- Check for running agents or workflows (`ListAgents`, `/workflows`). If any are live,
  **say so before starting** — he decides whether to let them finish or stop them. Do
  not quietly run a standup alongside a workflow burning 900k in the background.
- Start no new agent for the gathering itself.

Say in one line what you paused. Then begin.

## Step 1 — gather, cheaply

The specialists are **not** re-spawned to report. They are gone; their work is not.
Read what they actually left behind — that is the report, and it is already written:

- **Jira** — bounded, always: `project = WALL AND updated >= -24h`, `maxResults: 20`.
  Same for `GARDEN` and `SHIELD` if the day touched them. Never an unbounded query.
- **GitHub** — `gh pr list --json number,title,isDraft,mergeable,reviewDecision,updatedAt`
  with `--limit`. Never bare `gh pr list`.
- **Agent memory** — `.claude/agent-memory/<agent>/` in both repos. This is where each
  specialist writes what it learned. It is their standing report.
- **CI and main** — is `main` green? Anything red that was green yesterday?

Re-spawning an agent to summarise work it has already documented costs ~150k to
re-derive something already written down. Do not do it.

## Step 2 — report, one at a time

**One specialist per turn. Stop after each. Wait.**

He asked for this explicitly: agents report *"one by one"*, and he may question any of
them before the next speaks. A wall of everything at once is not a standup, it is a
digest — and he already gets those.

For each specialist who did real work in the period:

- **Who**, in one line — and what they own, not just their persona name. A new engineer
  reading this must understand the roster without being told the personas.
- **What they found or shipped**, with the evidence — file:line, the real command
  output, the ticket key.
- **What they got wrong**, if anything. A report with no failures in it is a report
  that has been laundered.
- **What it needs from him**, or explicitly "nothing".

Then stop. Do not continue to the next until he responds.

Order by what is waiting on him, not chronologically or alphabetically.

## Step 3 — when he questions one

This is the part that makes it a meeting rather than a briefing.

- **If the agent is still alive** (`ListAgents` shows it), `SendMessage` it. It keeps
  its full context and can answer properly — it remembers its own investigation.
- **If it has ended**, answer from its artefacts first. Only spawn a fresh agent if
  the question genuinely needs new work, and say that is what you are doing before you
  spend the tokens.
- **If two specialists disagree**, say so plainly rather than picking one. On
  2026-08-21 two agents reached opposite conclusions about the egress and both were
  reported confidently. That is exactly when he needs to know there is a disagreement,
  not a smoothed-over answer.

Never invent what an agent "would say". Quote what it wrote, or go and ask it.

## Step 4 — close

Three things, briefly:

1. **What he decided** in the meeting — one line each, so it is on the record.
2. **The single next action** for him. One, not a list.
3. **What will run when the meeting ends** — and ask which mode he wants. If he is
   staying, routines stay paused. If he is leaving, autonomous mode resumes them.

File anything raised that is not already ticketed, before ending. A finding that only
exists in the conversation will be gone by tomorrow.

---

## What this deliberately is not

**It does not spawn a team.** Agent teams are experimental, interactive-only, and
enabling them globally turns every named subagent into a teammate — teammates report
"idle" without their results, which silently stalls any orchestration waiting on them.
A standup does not need agents arguing with each other; it needs their findings
presented clearly and their author available when questioned.

**Use a team when the value is argument**, not reporting — competing hypotheses where
a single investigator would anchor on the first plausible answer. That is a separate,
deliberate, per-session decision, never a side effect of running a standup.

**It does not merge, deploy, or close anything.** Those three stay his, every time.
