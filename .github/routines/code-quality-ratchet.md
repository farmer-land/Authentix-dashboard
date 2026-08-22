# Code-quality ratchet

A standing routine that improves this codebase continuously and **slowly on purpose**.
Runs in both `Authentix-backend` and `Authentix-dashboard`, independently.

Commissioned by Heisenberg 2026-08-22: *"they will be having always the latest code…
start removing dead codes… up to five… and once everything is done, merged, tested,
then they will do next five."*

---

## The gate — read this before anything else

**One open ratchet PR per repository. Ever.**

Before doing any work, look for an open PR labelled `code-quality-ratchet`.

- **If one exists → STOP.** Do nothing. Log one line: `waiting on #N`. Do not open a
  second PR, do not "just do the docstrings while we wait", do not start a branch.
- **If none exists →** the previous batch merged. Take the next five.

Heisenberg merges. Therefore **he is the rate limiter**, and this routine physically
cannot outrun him. That is the entire safety design; everything else is detail.

If the open PR has sat untouched for more than 3 days, comment on it asking whether
it should be closed, and still do nothing else.

---

## The exclusion set — never work where someone else is working

Tonight's most expensive lesson: PR #90 and PR #91 both rewrote
`src/domains/delivery/resend/contacts.ts`. #91 merged first, restructured the whole
function, and **carried #90's live bug straight through its own fix**. The conflict
cost a rebase, a recovery from a dead agent's worktree, and a superseding PR.

So, every run, build the exclusion set first:

```bash
gh pr list --repo <repo> --state open --limit 50 --json number,files \
  --jq '[.[].files[].path] | unique | .[]'
```

**Any file in that list is off limits this run.** No exceptions, not even for a
one-line docstring. Also exclude anything with uncommitted changes in the working
tree — someone is mid-thought in it.

If the exclusion set leaves fewer than five eligible items, **take fewer**. Never
substitute an excluded file for an eligible one you were not going to touch.

---

## Always the latest code

```bash
git fetch origin main
git worktree add <scratch> -b claude/quality-<date>-<n> origin/main
```

Branch from `origin/main`, never from whatever is checked out. Then **verify the
baseline** — run the suite and record the file/test counts before changing anything.
If the count is lower than the last recorded baseline, you branched wrong: stop and
fix that first. On 2026-08-21 an agent branched from a stale branch and silently ran
216 tests instead of 256 without noticing.

---

## What to work on, in this order

Work through the phases in sequence. Do not start a later phase while an earlier one
still has eligible items — the ordering is deliberate, from cheapest to riskiest.

### Phase 1 — dead code

Up to **five items** per batch. Something is dead only if you can prove it:

- No references anywhere in `src/`, tests, scripts, config, or the *other* repo.
  Check both — the dashboard imports backend contracts and vice versa.
- Not exported from a public entry point.
- Not referenced by a migration, a workflow, or a `package.json` script.
- Not reachable through a string key, a dynamic import, or a route registration table.

**Proof goes in the PR body, per item** — the actual `grep`/`rg` command and its
empty output. "It looks unused" is not proof. If you cannot prove it, leave it and
say why.

Known dead things already established: the Railway `cron`/`cron-cleanup` services
(deleted 2026-08-21), and the npm scripts and docs that referenced them.

### Phase 2 — logic and data structures

Up to **five items** per batch, and **each one needs a test that fails without it.**

This is the riskiest phase, so it is the most constrained:

- Read the **official documentation for the package involved** before changing how
  it is used. Not a blog, not memory — the vendor's own current docs, and cite the
  URL in the PR. A 2024 page is not evidence about 2026.
- Prefer removing a duplicate implementation over rewriting a working one. There are
  three copies of the billing calculation (`billing/service.ts:637`, `:886`, `:1125`)
  and three copies of signed-URL batching in `certificates/service.ts` — collapsing a
  duplicate is worth more than polishing a single site.
- **`src/domains/certificates/service.ts` must SHRINK, never grow.** It is ~2,100
  lines. A change that adds a line there is rejected even if the change is good;
  extract instead.
- Never change a data structure and its callers in the same batch as unrelated work.

### Phase 3 — docstrings

Up to **five files** per batch.

**Search first, always** — Jira, GitHub Issues, open PRs and branches, all four, per
`.github/DELIVERY_CYCLE.md`. If a ticket or PR already covers documenting that area,
comment there instead of opening anything new. On 2026-08-20 one run left two
duplicates behind; that is what this rule exists to stop.

A docstring documents **what the caller needs to know**: what it does, what it
assumes, what it throws, and any non-obvious constraint. Never restate the signature.

Where behaviour is surprising, say so plainly — the comment at `app.ts:139` stated
its intent but not its danger, and the unsafe fallback beneath it survived review and
cost $100.76.

---

## Every batch, without exception

- `npm run type-check`, `npm run lint`, `npm run test:run` — real output in the PR.
- **A dead-code removal still needs the suite green.** If nothing fails when you
  delete something, that may mean it is dead — or that it was never tested. Say which.
- Commit per item, not one lump. A reviewer must be able to drop item 3 without
  losing items 1, 2, 4 and 5.
- Push at the first commit. Five agents died holding unpushed work on 2026-08-21.
- One PR, labelled `code-quality-ratchet`, listing all five items with evidence each.
- **Never merge.** Never deploy. Never close a ticket.

## Stop conditions

Stop and report rather than pressing on if: a phase has no eligible items outside the
exclusion set; the baseline test count does not match; a "dead" item turns out to be
referenced from the other repo; or a change needs a migration. Migrations are not
ratchet work.

## Cadence

Twice weekly is enough. This routine is deliberately slower than it could be — the
constraint is Heisenberg's review capacity, not the agents' throughput. A routine
that produces work faster than it can be reviewed produces a backlog, not quality.
