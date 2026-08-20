---
name: a11y-review
description: Accessibility pass on dashboard UI components — keyboard nav, ARIA, contrast, focus management. Use after building or editing components in src/components or app/dashboard.
---

# Accessibility Review — Authentix Dashboard

Stack: React + Tailwind + Radix UI. Radix primitives handle most ARIA/focus concerns correctly out of the box — the job here is to catch places where custom markup bypasses them.

## Checklist

- Interactive elements are real `<button>`/`<a>`, not `<div onClick>` — if a div must be clickable, it has `role`, `tabIndex`, and keyboard handlers
- Custom dropdowns/dialogs/popovers use Radix primitives (`@radix-ui/react-*`) rather than hand-rolled equivalents — check the diff isn't reinventing what Radix already provides
- Form inputs have associated `<label>` (or `aria-label`/`aria-labelledby`) — check `ManualDataEntry`, `DataSelector`, and other data-entry components specifically
- Focus is trapped correctly in modals/dialogs and returned to the trigger on close (Radix `Dialog`/`AlertDialog` do this by default — verify it isn't broken by custom overrides)
- Color is not the only signal for state (error/success/warning) — check status badges and form validation states
- Images/icons convey meaning via `alt` text or `aria-hidden` if purely decorative
- Drag-and-drop flows (`@dnd-kit/*` — `DraggableField`, template builder) have a non-drag fallback path

## Output

List findings as ✅ / ⚠️ with the specific WCAG-relevant issue and file:line. This is advisory, not a merge blocker, unless a component is entirely keyboard-unreachable.
