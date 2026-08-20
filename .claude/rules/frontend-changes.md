---
paths:
  - "app/**"
  - "src/**/*.ts"
  - "src/**/*.tsx"
---

# Dashboard change conventions

Loads only when working on dashboard source, so it costs nothing on sessions
that never touch it.

## Hard constraints — these are never negotiable

- **No direct Supabase client in frontend code.** Everything goes through the BFF proxy.
- **No service-role secret reachable from browser code.**
- **No auth token in `localStorage` or `sessionStorage`** — HttpOnly cookies only.
- **No backend call bypassing `/api/proxy/*` or `/api/auth/*`.**
- **Never widen the proxy allowlist silently.** Any change to `app/api/proxy/[...path]/route.ts` is AMBER: say so explicitly in the PR and recommend a proxy-security review before merge.
- **No internal identifier leaked to the UI.**

## Preview is not proof

`previewRender()` on the backend runs a different code path from real
generation. The same trap exists anywhere the dashboard shows a preview of
something the backend produces: verify against the artifact the user actually
receives, not the preview.

## Test gotchas that are real, from AGENTS.md

- Fake timers deadlock the ExportSection overlay tests.
- `ClipboardItem` needs stubbing.
- Use `fireEvent`, not `userEvent`, for overlay and async tests.
- jsdom does not implement canvas; a 2D context stub already exists in `vitest.setup.ts`.

## When the cause is backend

You have no Supabase or Railway access by design. File a cross-repo-check in
**WALL** with `cross-repo-check` + `team-backend`, stating the exact question,
the endpoint or file:line, and what you already checked. Never guess at
backend behaviour.
