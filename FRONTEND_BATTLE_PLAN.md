# FRONTEND_BATTLE_PLAN.md — Authentix Dashboard Audit Findings

> **Jira keys below are stale.** The `XEN` project was split on 2026-08-19 and has since been
> **deleted** — an `XEN-###` key resolves to nothing. Keys verified against each GARDEN ticket's own
> *Migrated from* line have been converted. Ones still shown as `XEN-##` could not be verified without
> guessing: the old numbering had gaps (`GARDEN-23` came from `XEN-92`, not `XEN-87`), so it does not
> convert by arithmetic. Find those by summary in `GARDEN` rather than trusting a computed key.

Generated 2026-08-19, consolidating the real `team-frontend` Jira backlog (20 issues, filed by the Frontend Experience Audit and Engineering Compliance Verification routines on 2026-08-18) with a fresh doc-currency audit run the same day. **This is a findings catalog, not a changelog** — nothing here has been fixed. Every item already has (or now has) a Jira ticket; work it from there via `bug-fixer`/`feature-builder`, not by editing this file directly.

Mirrors [`Authentix-backend/BATTLE_PLAN.md`](../Authentix-backend/BATTLE_PLAN.md)'s format for direct comparison across the two repos.

---

## HIGH

| # | Finding | File:Line | Jira |
|---|---|---|---|
| 1 | Misfiled security audit — `SECURITY_AUDIT.md` in this repo is actually Authentix-**backend's** audit (Fastify paths, `src/domains`, `src/api/v1/internal.ts` — none of which exist here). Anyone reading it here audits nonexistent code. | `SECURITY_AUDIT.md` | new ticket (see below) |
| 2 | Billing account-deletion and email-template autosave failures are silently swallowed — no user-visible error. A user can believe a deletion request or an edit was saved when it wasn't. | `billing/page.tsx:1078-1083,634-637`, `email-templates/[id]/page.tsx:223-238` | XEN-75 |
| 3 | Hand-rolled modals skip Radix Dialog — no focus trap, no ARIA dialog semantics. Worst instance is in the **shared dashboard shell** (`NotificationPanel.tsx`, rendered on every page) — the pattern other engineers are most likely to copy. | `billing/page.tsx:1092-1206,164-172`, `src/components/dashboard/NotificationPanel.tsx:47-53` | GARDEN-6 |
| 4 | Primary click targets (template cards, picker cards, contact-selection rows) are non-keyboard-operable `<div onClick>` — no `role`, `tabIndex`, or `onKeyDown`. WCAG 2.1.1 Level A failure on frequently-used controls. | `email-templates/page.tsx:487-494`, `broadcasts/page.tsx:739-786,1209-1229` | GARDEN-5 |
| 5 | Certificate design canvas is 100% pointer-only — fields can't be selected, moved, resized, or rotated via keyboard at all. Blocks the entire generate-certificate workflow for keyboard-only users. | `generate-certificate/components/DraggableField.tsx:383-400`, `InfiniteCanvas.tsx:302,314,445-555` | GARDEN-4 |

## MEDIUM

| # | Finding | File:Line | Jira |
|---|---|---|---|
| 6 | Dormant living docs — `projectmemory.md` and `CHANGELOG.md`, the two docs `AGENTS.md` explicitly requires be kept current, have both been dormant since 2026-03-27 (~150 days, hundreds of commits missing: broadcasts, contacts, delivery-events, segments, admin, the email-editor rewrite). | `projectmemory.md`, `CHANGELOG.md` | new ticket (see below) |
| 7 | Test coverage gap — 9 test files for 218 source files; 23/28 `generate-certificate/components/*` untested despite `AGENTS.md`'s own rule; zero e2e coverage of broadcasts/contacts/billing/email-templates. | `__tests__/`, `e2e/` | XEN-86 |
| 8 | `UsageCard.tsx` reintroduces localStorage-as-source-of-truth for billing plan/limit — the same anti-pattern already fixed once in delivery settings. No cross-device sync; unvalidated numeric input can produce a NaN/negative usage bar. | `settings/delivery/UsageCard.tsx:136-164` | XEN-85 |
| 9 | `broadcasts`/`contacts`/`billing` `page.tsx` (1,205–1,895 lines) never received the layered hooks/state/service pattern used for `generate-certificate` — mixes data-fetching, business logic, and presentation directly in the page component. | `broadcasts/page.tsx`, `contacts/page.tsx`, `billing/page.tsx` | XEN-83 |
| 10 | `ExportSection.tsx` (3,777 lines) and `generate-certificate/page.tsx` (3,188 lines) have regrown past their March-2026 "done" refactor — the masterplan's completion status is stale, not just the code. | `ExportSection.tsx`, `generate-certificate/page.tsx` | XEN-82 |
| 11 | Brand color `#3ECF8E` hardcoded via Tailwind arbitrary-value classes in 17 files, well outside the documented canvas/SVG exception — plus an undocumented second hex (`#2aac76`) one line away in the same file. | `settings/delivery/page.tsx` (+16 others) | XEN-81 |
| 12 | No shared `StatusBadge`/`EmptyState`/`PageHeader` primitives — every feature reimplements status pills, empty states, and page headings independently, each with different styling. | `src/components/ui/*` (missing) | XEN-80 |
| 13 | `formatDate` duplicated 4x in billing components with **silently divergent output** — the same invoice date renders as "15 Jan 2026" in one component and "15 January 2026" in another. Real user-visible bug, not just duplication. | `invoice-list.tsx:18-20`, `invoice-detail.tsx:19-21`, `trial-banner.tsx:10-12` | XEN-79 |
| 14 | Hand-rolled dropdowns/popovers duplicated 4-5x in `EmailBlockBuilder.tsx`/`RightPanel.tsx` instead of Radix primitives — directly violates `REVIEW.md`'s own checklist. | `EmailBlockBuilder.tsx`, `RightPanel.tsx:110-157` | XEN-78 |
| 15 | Contacts import-delete optimistically clears UI before the API call resolves — no rollback on failure; a failed delete leaves no retryable trace. | `contacts/page.tsx:1285-1302` | XEN-77 |
| 16 | Broadcast "Save draft" has no loading/disabled guard — double-click risks duplicate draft creation. | `broadcasts/page.tsx:596-618,1483-1486` | XEN-76 |
| 17 | Destructive delivery-settings actions (cancel scheduled send, remove sender) fire immediately with no confirmation dialog, inconsistent with the `AlertDialog` pattern used elsewhere in the app. | `UsageCard.tsx:317-326`, `SendersCard.tsx:81-92` | XEN-74 |
| 18 | Data tables missing `th scope`/`caption`; zero automated accessibility regression testing exists (`jest-axe`/`@axe-core/react` not even a dependency). | `CertificateTable.tsx`, `broadcasts/page.tsx`, `contacts/page.tsx` | XEN-73 |
| 19 | Icon-only buttons and search inputs missing accessible names across the dashboard; custom tab bar has no `role="tablist"` semantics despite a proper Radix `ui/tabs.tsx` already existing. | `CertificateTable.tsx`, `DomainManager.tsx`, `broadcasts/page.tsx` | XEN-72 |
| 20 | Low-contrast text fails WCAG 1.4.3 AA in `EmailBlockBuilder`/`EmailEditor` dark panels (≈2.6:1) and billing light cards (≈2.5:1) — informational text, not decorative. | `EmailBlockBuilder.tsx`, `EmailEditor.tsx`, `billing-overview.tsx:99,130` | GARDEN-7 |

## LOW / Docs hygiene

| # | Finding | Jira |
|---|---|---|
| 21 | No Miro architecture diagram exists for Authentix-dashboard, unlike the backend. | XEN-91 |
| 22 | `console.*` logging regression — 71 direct calls across 24 files bypass the logger facade established (and marked "done") in March 2026. | XEN-84 |
| 23 | 5 of 7 routes from XEN-87 remain genuinely undocumented in `SYSTEM_OVERVIEW.md`/`FILE_INDEX.md`: broadcasts, contacts, delivery-events, segments, admin. (Billing and verification-logs are now covered — that part of XEN-87 is resolved.) | XEN-87 (comment added) |
| 24 | Four March-2026 planning docs are frozen and duplicate each other — `DEPENDENCY_ENTERPRISE_AUDIT_2026-03-26.md`, `CTO_ARCHITECTURE_GUIDE.md`, `ENGINEERING_IMPROVEMENT_MASTERPLAN_2026.md`, `FRONTEND_BOUNDARY_REDUCTION_PLAN_2026.md`. Nearly all self-report as "✅ Done"; one has a hardcoded file path from a different developer's machine. | new ticket (see below) |
| 25 | `REVIEW.md` is fully prepared for Claude Code's native GitHub PR review feature but not yet active — needs Mayank to enable Code Review for this repo at `claude.ai/admin-settings/claude-code`. No code change needed, just a settings toggle only Mayank can flip. | — (not a bug, an available capability) |

---

## Recommended next action

Triage items 1-5 (HIGH) first — item 1 (misfiled security audit) is a documentation-only fix but has real consequence (misleads anyone auditing this repo); items 2-5 are accessibility/reliability issues on shared or high-traffic surfaces (`NotificationPanel` renders on every page; the certificate canvas is the core product workflow). Items 6, 24 are doc-hygiene, addressed directly in this pass (banners + `docs-writer` catch-up). The remaining 15 medium items are real but not urgent — good `bug-fixer`/`feature-builder` tickets, prioritized by the "shared infra first" pattern already visible in the audit (e.g., GARDEN-6's `NotificationPanel` fix before the two billing-page-local modals).

Per `.github/TICKET_STANDARDS.md`, each new ticket filed from this catalog gets a `team-frontend` label plus its type label (`security`/`docs`/`accessibility` as applicable) before handoff.
