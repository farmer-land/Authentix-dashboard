---
paths:
  - "**/__tests__/**"
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
---

# Writing tests here

Loads only when touching a test file.

**The lesson that cost us 72 wrong certificates:** a regression test can be
genuinely red-before-green, genuinely pass, and still prove nothing. PR #86's
236-line test hardcoded `field_ast: null` in its fixture, which forced a code
branch that no live template uses. It could not have failed while the defect
was live.

So, every time:

1. **Check which branch your fixture actually takes.** If the code under test
   branches on a field, your fixture decides the branch. Assert that you are
   on the branch production uses, or set up both.
2. **Test the combination, never the single input.** Two of a thing, an empty
   set, a duplicate, a boundary. WALL-46 had 23 passing single-field cases and
   missed a defect that needed two fields present at once.
3. **Verify red-before-green for real** — stash the fix, run, see actual red,
   restore, see green. Quote the real red output. Never assert it happened.
4. **Never weaken a test to get green** — no `.skip`, no `.only`, no deleted
   assertions, no loosened matchers. A suite that is green because a test was
   weakened is worse than a red one: it removes the signal and nobody notices.
5. **Say what you did NOT cover.** A declared gap on the reported symptom's own
   dimensions is a FAIL, not a footnote.
