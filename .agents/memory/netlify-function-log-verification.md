---
name: Netlify Function-log verification
description: How to reliably view recent production Function invocations in Netlify.
---

Use the Function Logs historical view, not only the default Real-time tail, when verifying a live request.

**Why:** The Real-time view can appear empty even after a successful invocation and `console.log()` output. The historical view retains Function activity for at least 24 hours.

**How to apply:** In Netlify, select the current published Production deploy, choose the exact function, set the date filter to Last hour, and clear text/level filters before judging whether an invocation or its safe telemetry is missing.