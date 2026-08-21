---
name: verify-before-claiming-fixed
description: Never report a fix as working on a green test suite alone — reproduce the user's actual symptom.
metadata:
  type: feedback
---

**A green test suite is not evidence that a reported bug is fixed.** Reproduce the symptom the user actually described, through the path they actually used, before saying anything is resolved.

**Why:** WALL-46 (2026-08-20) was "fixed" twice with genuine red-before-green regression tests that genuinely passed, and the bug shipped both times. The tests asserted the *diagnosed mechanism*, not the *reported behaviour* — and the diagnosis was wrong. One test file hardcoded `field_ast: null`, which forced a dead code branch: 236 lines that could not fail while the defect was live. Cost: 72 wrong certificates, 3 delivered to real people, and three full build cycles.

**How to apply:**
- Reproduce the user's symptom first, on the unfixed code. If you cannot reproduce it, your diagnosis is unproven — say so rather than fixing what you assume.
- Verify against the artifact the user actually sees. For certificates that means a **downloaded** file, not a preview — `previewRender()` runs different code from real generation.
- Check your test can actually reach the code you changed. Ask: which branch does this fixture take? A fixture that forces the wrong branch proves nothing.
- Test combinations, never single inputs. This whole defect class needs *two* fields of the same kind to appear.
- Say what you did NOT verify. An honest gap is always better than an unearned claim.

See also [[heisenberg-owns-every-done-transition]].
