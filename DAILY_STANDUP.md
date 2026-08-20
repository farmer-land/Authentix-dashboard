# Daily Standup — Authentix Dashboard

Auto-appended by Samwell Tarly's `SubagentStop` hook (`.claude/hooks/log-standup.sh`) every time `feature-builder`, `bug-fixer`, `reviewer`, `docs-sync`, or `docs-writer` finishes with a real `## Summary`-formatted handoff. Each entry is that agent's own message, verbatim — nothing here is re-synthesized or summarized by the hook itself. Ad-hoc/verification dispatches (no `## Summary` marker) are filtered out, not logged.

Missandei's morning and evening Slack digests (`missandei-morning-raven`, `missandei-evening-raven` scheduled tasks) read this file, alongside the backend's own `DAILY_STANDUP.md`, to produce one rolled-up cross-repo summary.
