---
name: proxy-security-review
description: Deep security check specifically for changes to the BFF proxy and auth layer (proxy.ts, app/api/proxy, app/api/auth). Use whenever a diff touches these paths.
---

# Proxy & Auth Security Review — Authentix Dashboard

This is the highest-risk surface in the dashboard repo — it's the only thing standing between the browser and the real backend.

## Checklist

- Path allowlist in `app/api/proxy/[...path]/route.ts` is still exhaustive and specific — no wildcard/catch-all additions
- Method restrictions per route are preserved (no silent widening from GET-only to all verbs, etc.)
- Timeout handling is still present on the proxied request
- Errors returned to the browser are sanitized — no raw backend error bodies, stack traces, or internal URLs leaked
- `proxy.ts` route-gating logic (public vs protected route checks) is unchanged in intent — any change is called out explicitly, not buried in an unrelated diff
- Auth cookies remain `HttpOnly`; no path introduces a token into a response body or client-readable cookie
- CSRF handling is preserved for cookie-auth mutating requests
- Any new backend endpoint being proxied is genuinely needed by the browser — don't widen the allowlist for convenience

## Output

Treat any allowlist widening or error-sanitization regression as a blocker (🔴), not a suggestion. State explicitly whether the allowlist surface area grew, shrank, or stayed the same.
