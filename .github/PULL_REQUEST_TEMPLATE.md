## What & Why
<!-- One paragraph: what changed and the reason. -->



**Jira:** GARDEN-___ &nbsp;·&nbsp; **GitHub Issue:** Closes #___
<!-- REQUIRED: every implementation PR must have one Jira key and one primary GitHub Issue.
     The EXACT UPPERCASE Jira key must appear in the branch name, PR title/body, and this line.
     Example branch: claude/GARDEN-123-short-name
     Example: Jira: GARDEN-123 · GitHub Issue: Closes #456
     GitHub Issue and Jira ticket must describe the same unit of work. Do not use N/A. -->

## Traceability
- [ ] A Jira ticket exists and is the source of truth for this work
- [ ] A primary GitHub Issue exists in this repository for this Jira ticket
- [ ] The Jira key appears in the branch name
- [ ] The Jira key appears in this PR title or body
- [ ] The GitHub Issue links back to the Jira ticket
- [ ] No duplicate GitHub Issue already exists for this Jira key

## Type of change
- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behaviour change)
- [ ] Accessibility improvement
- [ ] Infrastructure / CI
- [ ] Dependencies

## How to test
<!-- Step-by-step so a reviewer can verify without knowing the internals. -->
1. 
2. 

## Checklist
- [ ] `npm run typecheck` passes locally
- [ ] `npm run lint` passes locally
- [ ] `npm run test:run` passes locally
- [ ] No secrets or credentials in code
- [ ] No auth tokens in `localStorage`/`sessionStorage` — only `HttpOnly` cookies
- [ ] No direct Supabase client added to frontend code
- [ ] All new backend calls go through `/api/proxy/*` or `/api/auth/*`
- [ ] Proxy allowlist not widened without explicit review flag below
- [ ] Interactive elements are keyboard-accessible and labeled
- [ ] Branched from `staging`, not pushed straight to `main`

## Proxy / auth touched?
<!-- If proxy.ts, app/api/proxy/*, or src/lib/api/server.ts changed, say so explicitly and flag for a security-focused review pass. Otherwise delete this section. -->
