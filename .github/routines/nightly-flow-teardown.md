# Nightly flow teardown

One complete user flow, taken apart end to end, every night Heisenberg is away.

Commissioned 2026-08-22: *"we take a complete API flow… how the backend is connecting
it, and we will see the entire thing. What dead code is there, what logic we can
optimize, what packages, what new things we can add, how we can make it more
structured."*

**Vertical, not horizontal.** Not five dead-code items scattered across the tree —
**one flow, everything about it, both repos.** The findings are then related to each
other, the PR is reviewable as a unit, and the work actually finishes.

---

## The flows, in rotation

One per night. Ten flows, so each is revisited about every two weeks.

| # | Flow | Spans |
|---|---|---|
| 1 | Signup and organisation bootstrap | dashboard - proxy - auth service - DB |
| 2 | Invite acceptance | both repos, **WALL-80 lives here** |
| 3 | Template upload and AST design | canvas - storage - `field_ast` |
| 4 | Contact import from CSV | upload - worker - chunked upsert |
| 5 | Bulk certificate generation | queue - worker - render - storage |
| 6 | Certificate delivery by email | provider registry - Resend/SES/SMTP |
| 7 | Public verification page | unauthenticated, **WALL-84 lives here** |
| 8 | Billing, invoice and payment | usage - invoice - Razorpay |
| 9 | Webhook delivery to customers | pgmq - retry - signature |
| 10 | API keys and MCP integration | auth middleware - scopes |

Record which flow ran last so the rotation does not stall on the easy ones.

## Step 1 - trace it, before judging it

Follow the real path and write it down as file:line, every hop:

`dashboard component - proxy route - backend route - service - repository - DB` and,
where it applies, `- queue - worker - storage - external provider`.

**A flow you cannot trace is a finding in itself.** If the path is ambiguous, stop and
report that - an undocumented flow nobody can follow is a bigger problem than any dead
code inside it.

## Step 2 - six lenses, in parallel

One agent per lens, all reading the same traced path. They are read-only. They produce
findings, not commits.

1. **Dead code** - unreachable branches, unused exports, orphaned files, config for
   things that no longer exist. Proof of no references required per item, in both repos.
2. **Logic and data structures** - duplicated implementations, the wrong shape for the
   job, N+1 queries, an unbounded collection keyed on user input. Prefer collapsing a
   duplicate over rewriting something that works.
3. **Package usage** - read the **official current documentation** for every package
   this flow touches, and compare against how we actually use it. Cite the URL. A blog
   or a memory is not evidence; a 2024 page is not evidence about 2026.
4. **Test coverage** - what has no test, what has a test that cannot fail. **Mutation
   probe it**: break the logic and see if anything goes red. Real coverage across this
   codebase is 12%, not the 32% reported.
5. **Security** - tenant isolation on every query, authority never read from
   user-writable data, `timingSafeEqual` on secrets, no unauthenticated surface, no
   unbounded attacker-controlled state.
6. **Structure and capability** - what is missing that should exist, where the
   boundaries have decayed, what a new engineer would misread.

## Step 3 - consolidate, then rank

One report per flow. Ranked by **what costs money or breaks tenant isolation**, never
by what is easy. Duplicates across lenses merged - three agents finding the same thing
is one finding, not three.

## Step 4 - fix, under the standing gate

**One open PR per repo at a time.** If a teardown PR is still open, the next night's
run produces the *report* and stops. Heisenberg is the rate limiter and this routine
must not outrun him.

Fix the top items only. Everything else is filed as Jira tickets, fully fielded, so
nothing is lost - a finding that exists only in a report is gone by the next run.

The exclusion set still applies: **never touch a file any open PR touches.**

## Step 5 - cross-repo, deliberately

Most of these flows span both repos. The backend half and the frontend half go in as
**two PRs that reference each other**, opened the same night.

Config or a contract changed on one side and never mirrored is the single most common
failure this organisation has. It caused most of 2026-08-20 and left the dashboard's
entire agent rebuild unpushed for two days.

---

## Two gaps this routine cannot fill on its own

Both were named by Heisenberg on 2026-08-22 and both are real.

**There is no agent that writes missing tests.** `test-quality-auditor` audits and
files findings; it does not author. `feature-builder` and `bug-fixer` write tests only
for code they are already changing. So a well-covered audit produces a list nobody
acts on. **A QA agent that writes the missing unit, integration and end-to-end tests
is a genuine gap in the roster.**

**There is no dedicated security agent.** `reviewer` runs security as one of four
passes on a diff, and the GitHub action now scans each PR. Neither of those sweeps the
codebase looking for what is already wrong. **WALL-80 and WALL-81 both sat in
production undetected**, and were found by an audit, not by a standing capability.

Until those two exist, this routine's lens 4 and lens 5 produce findings that queue up
rather than getting fixed. Say so plainly in each report rather than letting the list
grow silently.
