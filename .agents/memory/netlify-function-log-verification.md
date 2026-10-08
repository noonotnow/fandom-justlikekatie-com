---
name: Netlify Function-log verification
description: How to reliably view recent production Function invocations in Netlify.
---

Use the Function Logs historical view, not only the default Real-time tail, when verifying a live request.

**Why:** The Real-time view can appear empty even after a successful invocation and `console.log()` output. The historical view retains Function activity for at least 24 hours.

**How to apply:** In Netlify, select the current published Production deploy, choose the exact function, set the date filter to Last hour, and clear text/level filters before judging whether an invocation or its safe telemetry is missing.

Do not assume the historical API retains structured console records just because
it lists an invocation. A preview probe returned an empty historical line while
the documented function-log WebSocket delivered the expected JSON diagnostic.

**Why:** Emission, historical retrieval and multi-day capture are different
evidence boundaries. A successful real-time sample cannot certify observation
coverage or retention.

**How to apply:** Verify a permitted retention/export path before starting any
multi-day scan measurement. Use the deployed function's metadata for the log
subscription, mark deliberate probes, and retain missing history as unknown.

Verify production separately from a preview: production history subsequently
returned structured diagnostics even though the earlier preview history did not.

**Why:** Preview retrieval behavior is not evidence of production retention or
delivery. Netlify's documented minimum retention is 24 hours (longer on some
plans), and its per-invocation output cap can discard older lines independently
of application log caps.

**How to apply:** Export safely before the guaranteed retention expires; inspect
missing owner/chunk relationships, not just suppression counters. Never claim an
unattended collector is running unless one has actually been configured.

Historical delivery can expose a chunk before its owner's request summary or
another completed request from the same browser session.

**Why:** A marked live browser check returned both directory and page responses,
but its first historical retrieval contained only the directory chunk. Complete
pagination and zero logger suppression did not establish complete delivery.

**How to apply:** Reconcile owner/work relationships across overlapping later
captures before choosing an observation window. Keep unresolved missing summaries
unknown rather than treating a chunk-only export as complete traffic coverage.