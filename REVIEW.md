# Review instructions

Prepared for Claude Code Review (claude.ai/admin-settings/claude-code). Takes effect once Mayank enables Code Review for this repo — no other setup needed for this file itself.

## What Important means here

Reserve 🔴 Important for findings that would leak tokens, widen the attack surface, or break production for real users:

- Any backend call from browser code that bypasses `/api/proxy/*` or `/api/auth/*`
- A direct Supabase DB client added to frontend code, or a service-role secret reachable from browser code
- Auth tokens written to `localStorage`/`sessionStorage` instead of `HttpOnly` cookies
- The proxy allowlist or path validation in `app/api/proxy/[...path]/route.ts` widened, or method restrictions loosened, without an obvious justification in the PR description
- Raw backend error bodies, stack traces, or internal URLs returned to the browser
- CSRF handling removed or weakened for a cookie-auth mutation
- A push straight to `main` instead of `feature/* → staging → main` (flag in the summary, not as an inline comment)

Style, component structure, and non-security refactors are Nit at most.

## Cap the nits

Report at most five Nits per review. If you found more, say "plus N similar items" in the summary instead of posting them all inline.

## Do not report

- Anything CI already enforces: ESLint, TypeScript errors, Prettier
- Generated files and `*.lock` files
- Test-only mocks/stubs that intentionally diverge from production behavior

## Always check

- New pages under `app/dashboard/org/[slug]/` have server-side auth/org-access validation, matching the pattern in `layout.tsx`
- New backend calls go through `src/lib/api/client.ts` or `src/lib/api/server.ts`, not a raw `fetch` to a backend URL
- Interactive custom UI (dropdowns, dialogs, popovers) uses Radix primitives rather than hand-rolled equivalents
- Anything in `generate-certificate/components/*`, `(auth)/*/actions.ts`, or `src/lib/api/*` has a corresponding test given the documented test gotchas in `AGENTS.md`

## Verification bar

Behavior claims need a `file:line` citation in the actual source, not an inference from a prop or variable name.

## Summary shape

Open the review body with a one-line tally, e.g. `1 factual, 3 style`. Lead with "No blocking issues" when that's the case.
