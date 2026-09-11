---
name: Calibration authority boundary
description: Production image calibration authority, evidence freshness, and control-comparison rules.
---

Repeated human-versus-proxy evidence is diagnostic only. Production may apply one explicitly approved query-ladder or signal-class adjustment, and eligibility must remain bound to the newest active approval over the current evidence set.

**Why:** Diagnostic receipts can accumulate, retire, or be superseded independently. Treating them as production instructions, or trusting a once-valid embedded snapshot after evidence or authority changes, can silently alter publication behavior.

**How to apply:** Keep hard image, identity, rights, composite, and anti-anchor gates before calibration scoring. Revalidate approval, evidence, retirement, and revocation state at every eligibility read. Compare query-ladder changes against the base ladder using a shared frozen union analysis, while recording the distinct query sets rather than claiming identical inputs.