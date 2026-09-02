---
name: Browser test concurrency
description: Keep Chromium-based browser checks parallel without exhausting CI runner resources.
---

Browser checks should remain parallel but use a bounded Node test concurrency instead of allowing every browser test to launch at once.

**Why:** Each test starts a Vite server and Chromium instance, and uncapped parallelism can exhaust native thread-pool or process resources before assertions run.

**How to apply:** Choose a small parallel limit appropriate for the runner (currently four) and verify the default package command repeatedly; do not globally serialize the browser suite.