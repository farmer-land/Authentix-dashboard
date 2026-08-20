## What & Why
<!-- One paragraph: what changed and the reason. -->



**Jira:** XEN-___ &nbsp;·&nbsp; **GitHub Issue:** Closes #___
<!-- Fill in whichever apply. Branch name should also contain the Jira key, e.g. feature/XEN-123-short-name -->

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
