---
name: wrong-fix-research-2026-08-21
description: Key measured evidence on why coding agents ship plausible-but-wrong fixes, and which mitigations are actually supported — researched 2026-08-21, published to Confluence pageId 2818061
metadata:
  type: project
---

Research done 2026-08-21 after 3 agents in a row declared a defect fixed when it wasn't (72 certs shipped with wrong dates). Written up at Confluence pageId **2818061** ("Why Agents Ship Wrong Fixes — Research 2026-08-21", SCRUM/Xencus space, spaceId 131075).

**Why:** Heisenberg needs mitigations backed by measured results, not advocacy. Manufactured process change is a real cost here.

**The load-bearing numbers (re-verify links before re-quoting):**
- Between a fifth and a third of agent patches that PASS their gate are wrong. Two independent studies: arXiv:2503.15223 (29.6% behaviourally divergent from ground truth; 7.8% counted correct while failing dev tests; +6.2pp resolution-rate inflation) and arXiv:2410.06992 SWE-Bench+ (31.08% suspicious due to weak tests; SWE-Agent+GPT-4 12.47% -> 3.97% after cleaning).
- LLM patch failures are BIMODAL: functionality preserved (0.832) but defect unfixed (0.251); 51.4% use a fundamentally incorrect repair strategy, only 13.2% fail to compile (arXiv:2603.10072). A fix that "looks clean and breaks nothing" is the MODAL failure, not evidence of success.
- Runtime grounding is the strongest measured lever: SWE-Doctor (arXiv:2607.00990) +8.0-8.9pp on SWE-bench Pro; ablation removing runtime-grounded diagnosis drops 56.0% -> 48.0%.
- Self-verification by the same model is the one mitigation evidence argues AGAINST. TACL survey arXiv:2406.01297: "no prior work demonstrates successful self-correction with feedback from prompted LLMs"; degrades on code generation; bottleneck is feedback generation. Works only with reliable EXTERNAL verifiers.
- Multi-agent debate is weaker than it looks: majority voting accounts for most of the gain, and MAD cannot exceed its strongest participant (arXiv:2508.17536). Ensembling agents that share a blind spot reproduces the blind spot.

**How to apply:** when anyone proposes hardening the agent pipeline, the ranking is (1) external execution/runtime oracles, (2) mechanical fail-to-pass gates on reproduction tests, (3) fresh-context reviewer that never saw the reasoning — NOT more self-review, NOT more voters. See [[verify-before-claiming-fixed]].
