---
name: dependency-audit
description: Check for vulnerable or outdated npm dependencies in the dashboard and summarize what's safe to bump vs. what needs care. Use periodically or before a release, not on every change.
context: fork
agent: github-ops
effort: medium
disallowed-tools: Edit Write NotebookEdit
---
<!-- Runs as a forked subagent (context: fork), which inherits this conversation
     and SHARES the parent's prompt cache - so its first request reads what we
     already paid for, instead of a fresh subagent's ~55,000-token cold start.
     Edit/Write are removed while it runs: a review that can edit is not a
     review. -->


# Dependency Audit — Authentix Dashboard

## Current state

!`npm audit --omit=dev 2>&1 | tail -30`

## Outdated packages

!`npm outdated 2>&1 || true`

## Instructions

1. Summarize the audit output: how many vulnerabilities, at what severity, and which package introduces each one.
2. For each outdated package, flag major-version bumps separately — this repo tracks fast-moving packages closely (`next: 16.2.6`, `react: 19.2.6`, `tailwindcss: 4.3.0`), so check release notes for breaking changes before bumping any of those specifically.
3. Recommend a safe batch: patch/minor bumps with no known breaking changes can be grouped into one PR. Majors get their own PR each, with the changelog link included.
4. Never run `npm audit fix --force` or bump a major version automatically — recommend it, don't execute it without explicit approval.
5. Note if a bump would touch `@supabase/supabase-js` or `@supabase/ssr` — keep these in sync with the same packages in `Authentix-backend`'s `package.json` where practical, since both repos talk to the same Supabase project.

Report as a short table: package, current → target version, severity/reason, recommended action (bump now / bump with care / leave pinned).
