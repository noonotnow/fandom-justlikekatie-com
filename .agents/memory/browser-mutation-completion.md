---
name: Multi-stage browser mutation completion
description: Choose completion signals that cover every stage of an automatic save before testing the next mutation.
---

Browser tests must wait for the final save confirmation before asserting that a subsequent mutation is enabled. Rendering a saved receipt can be an intermediate stage, not completion of its automatic Collection handoff.

**Why:** The receipt appeared before its Collection save finished. A stricter mutation lock correctly kept approval disabled, but an immediate enabled-state assertion failed in both GitHub jobs.

**How to apply:** Wait for the final Collection success notice or an equivalent complete-operation signal, then assert the next action is enabled. Preserve tests that deliberately hold the handoff pending and verify that approval remains blocked. Do not weaken the lock or add arbitrary sleeps to make the fixture pass.
