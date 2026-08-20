# Ticket & Issue Creation Standard

Every bug, feature, tech-debt item, doc gap, security finding, and performance issue — filed by a routine or by Heisenberg — follows this same taxonomy on **both** Jira (project `XEN`) and GitHub. Same words, same labels, same structure everywhere.

Full version with rationale: Confluence — ["Ticket & Issue Creation Standard"](https://beforebinary.atlassian.net/wiki/spaces/SCRUM/pages/622605).

> **Why labels, not Jira Components.** `XEN` is a team-managed (next-gen) Jira project — those don't support the Components field. Labels carry type + area/team instead, matching GitHub labels exactly.

## Taxonomy

| Kind | Jira type | Jira labels | Priority | Due date rule | GitHub template | GitHub labels |
|---|---|---|---|---|---|---|
| Bug | Bug | `bug` + `team-frontend` | Highest=prod down, High=degraded, Medium=staging | Highest +1d · High +3d · Medium +7d · Low none | `bug_report.yml` | `bug` + `team-frontend` |
| Feature | Story / Feature | `enhancement` + `team-frontend` | Medium | None unless roadmapped | `feature_request.yml` | `enhancement` + `team-frontend` |
| Tech debt | Task | `tech-debt` + `team-architecture` | Low/Medium, High if causing bugs | None · +30d if High | `tech_debt.yml` | `tech-debt` + `team-architecture` |
| Documentation | Task | `documentation` + `team-docs` | Low | +14 days | `documentation.yml` | `documentation` + `team-docs` |
| Security | Bug | `security` + `team-security` | Highest/High | +1d / +3d | `security.yml` | `security` + `team-security` |
| Performance | Task (Bug if regression) | `performance` + `team-performance` | Medium/High | +7d if High | `performance.yml` | `performance` + `team-performance` |
| Architecture / best-practice | Task | `tech-debt` + `team-architecture` | Low/Medium | None unless High | `tech_debt.yml` | `tech-debt` + `team-architecture` |

## Title convention

Both Jira summaries and GitHub issue titles start with the same area prefix used in each template's **Area** dropdown:

```
[Frontend] Export overlay doesn't clear its interval on unmount
[Security] Auth token found in a browser storage write
```

Use `[Both]` when a change spans both repos.

## Filing a GitHub Issue here

1. Pick the matching template above from **Issues → New issue**.
2. Title: `[Area] short description`.
3. Fill every field — dropdowns already match the taxonomy.
4. Leave the type/`team-*` labels the template applies.
5. Fill **Jira ticket key** if one exists; otherwise leave blank.

## Linking a PR

Branch and PR title should carry the Jira key: `claude/GARDEN-123-short-name`. The key must be UPPERCASE and must appear in the branch name — Jira matching is case-sensitive and silently fails otherwise. Fill the **Jira:** line at the top of `PULL_REQUEST_TEMPLATE.md`.

## Who enforces this

Tyrion's `tyrion-product-triage` routine applies this standard to every new ticket/issue before it's handed to a builder or to Varys for review.
