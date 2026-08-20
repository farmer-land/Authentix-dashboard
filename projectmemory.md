# Project Memory - Authentix Dashboard (Frontend)

**Last Updated:** 2026-03-22
**Purpose:** Persistent memory for architecture, decisions, constraints, and recent changes.

---

## Stable System Decisions

- Frontend is a Next.js App Router dashboard deployed on Vercel.
- Architecture is BFF/proxy-oriented: browser requests flow through Next handlers before backend.
- Frontend must not perform direct database access from browser.
- Auth tokens are stored only in HttpOnly cookies.
- Protected routes are organization-scoped under `/dashboard/org/[slug]`.
- Slug is routing context only; authorization remains backend JWT-context based.

---

## Architecture Snapshot

### Core layers

- UI/pages: `app/*`
- API route handlers: `app/api/*`
- Route protection proxy: `proxy.ts`
- Client API abstraction: `src/lib/api/client.ts`
- Server API abstraction: `src/lib/api/server.ts`
- Runtime backend env resolver: `src/lib/config/env.ts`

### Routing

- Public auth routes: `/login`, `/signup`, `/verify-email`
- Resolver route: `/dashboard` (redirects into slug route)
- Protected org shell: `/dashboard/org/[slug]/*`
- Public certificate verification: `/verify/[token]`

---

## Key Workflows

### 1) Auth and session lifecycle

- Auth forms call server actions or auth route handlers.
- Backend returns tokens; frontend sets HttpOnly auth cookies.
- `proxy.ts` redirects unauthenticated users away from protected paths.
- Server-side layout checks (`app/dashboard/org/[slug]/layout.tsx`) validate session/profile/org access.

### 2) Data access pattern

- Browser code calls `/api/proxy/*` or `/api/auth/*`.
- `app/api/proxy/[...path]/route.ts` applies allowlist and path safety checks.
- Server-side components call backend via `src/lib/api/server.ts`.

### 3) Certificate generation lifecycle

- Select template -> load editor data -> place fields
- Import/map data or enter manually
- Submit generation request (`/certificates/generate`)
- Preview/download generated assets

---

## External Integrations

- Backend API: `https://authentix-backend.vercel.app/api/v1`
- Supabase (indirect from frontend): asset/image host and backend data layer
- Razorpay: surfaced via backend billing/invoice payloads and hosted payment links

Not implemented in frontend runtime:
- transactional email orchestration
- WhatsApp integration flow

---

## Environment and Runtime Assumptions

- Node version: `24.x` (`.nvmrc` contains `24.0.0`)
- package scripts:
  - `dev`: `next dev --turbopack`
  - `build`: `next build`
  - `start`: `next start`
  - `lint`: ESLint
  - `typecheck`: `tsc --noEmit`
- `src/lib/config/env.ts` currently drives backend URL selection with:
  - `BACKEND_ENV`
  - `BACKEND_URL_LOCAL`
  - `BACKEND_URL_TEST`
  - `BACKEND_URL_PROD`

⚠️ Needs clarification: legacy docs and comments still reference `BACKEND_API_URL`, but active runtime resolver reads the env variables listed above.

---

## Known Limitations and Risks

- Async certificate generation for large batches is documented as incomplete (worker gap).
- Logging verbosity remains high in some production-critical flows (proxy, resolver, org layout).
- Contract drift risk exists if frontend types are not kept synchronized with backend enums and schemas.
- Security posture currently includes CSP directives with `unsafe-inline` and `unsafe-eval` for compatibility.

---

## Gotchas

- Use `slug` route semantics consistently; avoid reintroducing legacy `[orgId]` references.
- Do not bypass proxy allowlist rules when introducing new endpoints.
- Keep certificate schema fields aligned (`issued_at`, `expires_at`, `active/revoked/expired`).
- Keep manual data-entry callbacks split (`onDataChange` vs `onDataSubmit`) to avoid auto-navigation regressions.
- `--primary` CSS variable is `oklch()` — never use `hsl(var(--primary))`. Use `#3ECF8E` directly for inline styles or canvas/SVG.
- React StrictMode double-mounts effects. Any `useEffect` that sets a ref must reset it in the effect body, not just clean up in the return. Pattern: `useEffect(() => { ref.current = true; return () => { ref.current = false; }; }, [])`.
- Multi-flag async state (`isA + isB + isC + useEffect`) is fragile. Prefer a single state enum for mutually exclusive UI phases.
- Dragger/fill sync: if two DOM siblings share a CSS transition, they will drift. Make the dragger a child of the fill element so a single `width` transition moves both.
- Certificate canvas fields are focusable (`tabIndex=0`, `role="group"`). A tabbable element is focused by the browser right after `mousedown`, so any `onFocus`-driven selection must be suppressed for pointer-initiated focus (`pointerFocusRef` in `DraggableField.tsx`) — otherwise the modifier-less focus selection clobbers shift+click multi-select.
- `DraggableField`'s `onSelect` receives `MouseEvent | KeyboardEvent | FocusEvent`. `FocusEvent` has no `shiftKey`, so always feature-check (`'shiftKey' in e`) before reading modifiers.

---

## Recent Changes (Append-Only)

- **2026-03-19** | Initial full system audit | Baseline architecture, routes, APIs, limitations, and constraints documented.
- **2026-03-19** | Dynamic backend URL system | Added resolver-backed backend URL strategy and local fallback behavior.
- **2026-03-19** | Slug-based org routing | Migrated protected routes from UUID parameter to slug-based organization routing.
- **2026-03-19** | API contract standardization | Updated frontend API typings and endpoint usage to match backend contracts.
- **2026-03-20** | Removed Turnstile CAPTCHA | Simplified login flow and removed turnstile dependency and wiring.
- **2026-03-20** | Certificate schema alignment | Updated certificate interfaces and UI usage for live backend fields.
- **2026-03-21** | Generate-certificate UX and bug fixes | Improved template selection flow, preview/download UX, data-entry behavior, and field resizing/selection behavior.
- **2026-03-21** | Documentation modernization refresh | Reorganized core docs (`README.md`, `AGENTS.md`, `projectmemory.md`) and added `SYSTEM_OVERVIEW.md` and `FILE_INDEX.md` for onboarding and navigation.
- **2026-03-22** | Test infrastructure | Added comprehensive test suite: Vitest 3.2 + @testing-library/react 16.3 + Playwright 1.52. 125 unit/component tests all passing (6 test files). E2E tests for auth and certificate generation flows. Key config: `vite-tsconfig-paths` plugin required for `@/*` alias resolution. Key patterns: stub `setInterval` in ExportSection tests, use `fireEvent` (not `userEvent`) for overlay/clipboard click tests, render before spying on `document.body.appendChild`. Scripts: `npm test` (watch), `npm run test:run` (CI), `npm run test:coverage`, `npm run test:e2e`.
- **2026-03-22** | ExportSection generation overlay overhaul | Replaced fragile `isGenerating+isShowingSuccess+generationComplete` trio with single `overlayState` enum (`hidden|generating|success`). Fixed StrictMode `isMountedRef` bug (effect body now resets ref to `true` on remount). Replaced `useEffect`-based success trigger with direct `setTimeout` in `handleGenerate`. Fixed brand color invisibility (`--primary` is oklch, not HSL — must use `#3ECF8E` directly). Fixed dragger/fill sync by making dragger a child element of fill div. Raised progress cap from ~83% to ~98%. Added CSS-only generation animation (orbiting dots, document lines) and success animation (`ShieldCheck` + floating `BadgeCheck`) with keyframes hoisted to always-rendered `<style>` tag.
- **2026-03-26** | Email template builder — layout overhaul (session 1) | Full redesign of `app/dashboard/org/[slug]/email-templates/[id]/page.tsx`. Removed top toolbar. Added cert-builder-style floating left panel (`absolute z-40 left-4 top-3 w-64 rounded-xl shadow-2xl`). Canvas + preview now take full viewport height. Added floating bottom dock bar (full-width) with 7 cert-field buttons (icon + label in same row) and Test/Save buttons pinned right. Variable replacement: `selectedVar` state tracks clicked `{{var}}` chip; dock field click replaces or appends. Replace indicator banner shown above dock when replacement mode is active.
- **2026-03-27** | Email template builder — layout overhaul (session 2) | Major UX refactor across `EmailBlockBuilder.tsx` and `page.tsx`. (1) **Palette**: removed `markdown` block, added `cert_image`, `qr_code`, `details_box` to `EMAIL_BLOCKS_PALETTE`. (2) **Canvas offset**: canvas gets `paddingLeft: 280px` when floating left panel open — content no longer hidden behind panel. (3) **Floating dock**: replaced full-width bottom bar with `fixed bottom-5 left-1/2 -translate-x-1/2 z-50` floating pill card; fields section only renders when a block is selected (`selectedId`); collapse/expand with `ChevronLeft`/`ChevronRight`. (4) **No background strip**: dock is fixed-position — canvas and preview fill 100% height, `pb-24` prevents last content being hidden. (5) **Drag handle**: moved from hidden top-right overlay to persistent left-side grip (`absolute left-0`, always visible at 20% opacity, 70% on hover) outside card; card offset `ml-6`. Block label tab updated to `left-6`. (6) **"Existing content" screen removed**: `hasExistingHtml` prop and "Redesign with Builder" screen deleted; `loadTemplate` always initialises with `STARTER_BLOCKS`. (7) **Sender/subject section**: increased padding, subject input now `text-sm text-zinc-300` (was tiny/invisible). (8) **"Select a block first" error removed**: `handleInsertVarToSelected` silently returns if no block selected (impossible in practice since dock fields only show when block selected).
- **2026-08-20** | GARDEN-5 keyboard-operable click targets | Fixed three WCAG 2.1.1 / 4.1.2 (Level A) failures where primary click targets were non-focusable `<div onClick>`s. (1) **Email template card** (`email-templates/page.tsx`): card is no longer clickable-div; a transparent stretched `<button type="button">` (`absolute inset-0 z-10`, `aria-label="Edit template: <name>"`) covers it, and the per-card action row moved to `relative z-20` so its nested buttons still win pointer events. Stretched-button pattern chosen because a card containing nested buttons cannot itself be a `<button>` (invalid nesting → SSR/hydration break). (2) **Broadcast template picker cards + "Design from scratch" tile** (`broadcasts/page.tsx`): converted to `<button type="button">`; picker cards carry `aria-pressed` for selection state. (3) **Contact-selection rows** (`broadcasts/page.tsx`): row is now `<button type="button" role="checkbox" aria-checked={isSelected}>` (native Enter/Space activation — no hand-rolled key handler), hand-rolled checkbox visual marked `aria-hidden`. Visual parity notes: Tailwind v4 preflight already zeroes button border/padding/radius/background and inherits font+color, so only `text-left` (button UA default is `text-align: center`) and `w-full` were added, plus `focus-visible:ring-*` matching `src/components/ui/button.tsx`. Tests: `__tests__/components/EmailTemplateCardKeyboard.test.tsx`, `__tests__/components/BroadcastKeyboardTargets.test.tsx` (19 tests; 18 fail without the fix).
- **2026-08-20** | GARDEN-4 — keyboard-operable certificate design canvas (WCAG 2.1.1 Level A) | `DraggableField.tsx` field boxes are now focus stops (`tabIndex=0`, `role="group"`, descriptive `aria-label`, design-system `focus-visible:ring-*` from `src/components/ui/button.tsx`). Tab/Shift+Tab walks fields in canvas z-order (DOM order) and focusing selects via the existing `onSelect` path; `onSelect` widened to `MouseEvent | KeyboardEvent | FocusEvent`. Keyboard verbs use an explicit announced mode (arrows alone can't mean move + resize + rotate): **Arrow** = nudge 1px, **Shift+Arrow** = 10px, **S** = resize mode (arrows resize from the top-left anchor, 1/10 units), **R** = rotate mode (arrows rotate 1° / Shift 15°), **M** or **Esc** = back to move mode. All mutations reuse the mouse callbacks (`onDrag`/`onResize`/`onRotate`) so clamping, snap-to-grid and alignment guides work the same way, with two caveats: the keyboard path never calls `onDragStart` before a nudge/resize the way mouse-drag does, so undo-grouping relies solely on `handleUpdateField`'s existing 500ms quiet-window push rather than an explicit drag-start snapshot; and with `snapToGrid` on (off by default), a 1-unit arrow nudge/resize rounds back to the same grid position (a visible no-op) — only Shift+Arrow (10-unit step) reliably moves/resizes with snap enabled. Any Cmd/Ctrl/Alt combo is passed through untouched so InfiniteCanvas's global shortcuts still work while a field is focused; `field.locked` blocks nudge/resize/rotate and mode switching, mirroring the mouse. Also: resize/rotate handles gained `data-resize-handle`/`data-rotate-handle` as test/interaction selectors (`InfiniteCanvas.tsx` and `CertificateCanvas.tsx` already carried `[data-resize-handle]` on the template resize handles, and field handles were already covered via `target.closest('[data-field]')` matching the field wrapper — the new attributes are additive, not a fix for a missing pan-guard match), alignment guides now clear on `keyup` as well as `mouseup`, and the `?` shortcuts modal documents the new bindings. Follow-up (2026-08-20 review): rotate-mode entry is now gated on `onRotate` being defined (CertificateCanvas's legacy consumer doesn't pass it) and the mode badge/announcement now only shows for keyboard-driven focus, not mouse-click focus.
