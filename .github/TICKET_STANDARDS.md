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

---

## Test tickets — linking, template, and what QA must record

### Every test ticket links to what it covers

A test ticket that is not linked is invisible: nobody looking at a bug can tell whether it is covered, and nobody looking at the test work can tell why it exists.

**On create, link the test ticket to every ticket it covers** — Jira link type **`Relates`**, which shows on both sides. Backend/frontend work links to its SHIELD ticket; the SHIELD ticket links back to each one.

If a bug is found *by* testing, link it too, and say in the description which test exposed it. That chain — bug → test that caught it → coverage ticket — is the record of whether testing is actually working.

### Template for a test ticket

Every SHIELD ticket carries these headings. Empty is not acceptable; "none" with a reason is.

```
## What this covers
Which ticket(s), which flow, which code paths. Link them.

## Test cases
For each: what is set up, what is done, what must be true afterwards.
Assert on OBSERVABLE OUTPUT — the rendered image, the stored row, the
HTTP response — not on which internal function was called.

## Edge cases
The cases that are not the happy path. At minimum consider:
 - empty, one, many, and the maximum allowed
 - two things that are the same (WALL-46 lived here)
 - the value missing, null, or the wrong type
 - the same request twice — idempotency
 - failure mid-way: which side effects survive, which are rolled back
 - a dependency down: storage, database, queue
 - permissions: another org's data, an expired token
If a category genuinely does not apply, write why. Do not delete the line.

## What is deliberately NOT covered
And why. An honest gap beats a false claim of completeness.
```

### What QA must record when testing — not optional

A verdict with no evidence is unusable. Someone reading the ticket in three months has to be able to tell exactly what was checked.

QA records, as a comment on the ticket:

1. **What was tested** — the branch or commit SHA, the environment, the actual steps taken. "Tested the flow" is not a record; "checked out `abc1234`, uploaded a 2-field template, generated 3 certificates from a 50-row CSV" is.
2. **Real command output** — the actual counts and failures, pasted. Never "tests pass" for a command that was not run.
3. **What was NOT tested, and why.** Browser coverage skipped for lack of credentials, load untested, a path unreachable without production data — all fine, and all must be stated. **Silent gaps are how a regression ships with a green tick beside it.**
4. **Test quality verdict** — do the developer's tests test combinations or single inputs? Would they have caught the original bug? `.skip`/`.only`/weakened assertions are a hard FAIL regardless of how green the run is.
5. **The verdict**, one line: `QA PASS` or `QA FAIL — <n> issues`.

### Why this exists

**WALL-46** was invisible to 23 passing tests: every case tested one field in isolation, and the bug only appeared with two. The suite reported full coverage of the exact strategy that was broken.

Coverage counts do not tell you whether something is tested. **The edge-case section and the honest not-covered section are what tell you.**

---

## Time tracking — mandatory on every ticket

**Original Estimate is a required field. A ticket without one is not fielded.**

This was missed for the first ~60 tickets across WALL, GARDEN and SHIELD — story points were being set and the estimate left empty, so the board had no time signal at all. Heisenberg caught it on 2026-08-20. Backfilled since; do not let it lapse again.

### The conversion — 1 story point = 2 hours

Story points and hours are not redundant here. Points express *relative complexity and risk*; hours express *elapsed working time*, which is what actually fills a sprint. A fixed ratio keeps the two honest against each other:

| Story points | Original Estimate |
| --- | --- |
| 1 | `2h` |
| 2 | `4h` |
| 3 | `6h` |
| 5 | `10h` |
| 8 | `16h` |
| 13 | `26h` — too big, split it |

If a ticket's honest hour estimate does not match its points at this ratio, **one of the two is wrong.** Fix it rather than letting them disagree — that disagreement is usually the first sign a ticket is badly scoped.

### How to set it

```
"timetracking": { "originalEstimate": "6h", "remainingEstimate": "6h" }
```

Both fields, on create. Jira accepts `w`/`d`/`h`/`m`; use hours for anything under a week so the numbers stay comparable.

### Remaining Estimate is not decoration

- **On create** — same as the original estimate.
- **While in progress** — update it when the picture changes, not at the end. A ticket that sat at `8h` remaining for three days and then closed at zero taught nobody anything.
- **In Review** — drop it to the review/QA time still outstanding, not zero. The work is not finished until QA passes it.
- **Blocked** — leave it where it is and say so in a comment. Zeroing a blocked ticket hides the blockage.

### What this is actually for

Estimates here are not a commitment anyone is held to, and they are not a performance measure. They exist so that:

1. A sprint can be sized before it starts rather than discovered mid-week
2. The gap between estimate and actual is visible, which is the only way estimates ever improve
3. A ticket quietly consuming three times its estimate surfaces as a signal that the diagnosis was wrong — which has already happened more than once on this project

**Estimate the work, not the ticket.** A one-line fix behind a two-day root-cause hunt is a two-day ticket. WALL-46 was a nine-line change and a `6h` ticket, and that is correct.

### Logging work

Log against the ticket as work happens (`addWorklogToJiraIssue`), not reconstructed at the end. Reconstructed worklogs are fiction, and fiction in the time field is worse than an empty one.
