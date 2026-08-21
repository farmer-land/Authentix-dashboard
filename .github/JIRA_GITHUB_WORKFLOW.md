# Jira ↔ GitHub Engineering Contract

Jira is the source of truth for engineering work. GitHub is the execution surface.

## Required traceability

Every implementation ticket must have:

1. One primary Jira ticket (`WALL-*` for backend, `GARDEN-*` for frontend, `SHIELD-*` for cross-repo QA).
2. One primary GitHub Issue in the implementation repository.
3. The Jira key in the GitHub Issue title or body.
4. The Jira URL in the GitHub Issue body.
5. The Jira key in the branch name and PR title/body.
6. The PR linked to the GitHub Issue.

Do not use `GitHub Issue: N/A` for implementation work.

## Repository routing

- `WALL-*` → `farmer-land/Authentix-backend`
- `GARDEN-*` → `farmer-land/Authentix-dashboard`
- `SHIELD-*` → use the repository that implements the work; keep the Shield Jira ticket as the cross-repo QA authority.

## Agent flow

Jira To Do → Jira In Progress → GitHub Issue → `claude/<JIRA-KEY>-short-name` branch → PR → Varys review → QA verification → Heisenberg merge → Jira remains In Review until Heisenberg explicitly approves completion.

Agents must not merge or deploy.

## Before opening a PR

- Check whether the Jira key already has an open `claude/<KEY>-*` branch or PR.
- Check merged PRs for the same Jira key to avoid duplicate work.
- Confirm the primary GitHub Issue exists and links to Jira.
- Put the Jira key in uppercase.
- Keep the GitHub Issue and Jira ticket scoped to the same unit of work.

## Cross-repo work

If backend work needs frontend verification, create/file the cross-repo ask in `GARDEN` with `cross-repo-check` + `team-frontend`.

If frontend work needs backend verification, create/file the cross-repo ask in `WALL` with `cross-repo-check` + `team-backend`.

For Shield work, keep cross-repo test/contract scope in `SHIELD`; implementation tickets belong to the repo that changes.

## Do not bypass traceability

A PR without a Jira key or primary GitHub Issue is incomplete. Fix the linkage before review rather than relying on memory, comments, or a later cleanup pass.
