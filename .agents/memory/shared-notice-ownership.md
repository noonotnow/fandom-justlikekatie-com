---
name: Shared notice ownership
description: Prevent an older multi-phase operation from replacing a newer operator decision's status.
---

Serialize mutations that share an operator status message, or give each message an operation owner and reject late writes from older operations. A visible saved receipt is not proof that its subsequent Collection export and sync have finished.

**Why:** An approval conflict could be correctly returned and then hidden by a prior Collection save finishing later. This appeared as an intermittent full-suite timeout while isolated checks passed.

**How to apply:** Keep conflicting mutation controls disabled through every persistence phase. In regression tests, deliberately hold the later phase pending, prove the second action is unavailable, then release it and assert the next operation's exact outcome. Do not treat the arrival of an intermediate saved record as completion.
