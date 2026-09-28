---
name: Browser test concurrency
description: Keep Chromium-based browser checks parallel without exhausting CI runner resources.
---

Browser checks should remain parallel but use a bounded Node test concurrency instead of allowing every browser test to launch at once.

**Why:** Each test starts a Vite server and Chromium instance, and uncapped parallelism can exhaust native thread-pool or process resources before assertions run.

**How to apply:** Choose a small parallel limit appropriate for the runner (currently four) and verify the default package command repeatedly; do not globally serialize the browser suite.

In a large Replit workspace, even the bounded full suite may exhaust the container's file-watch limit because each Vite server watches shared workspace and skill trees. If it fails with `ENOSPC` before assertions, run the relevant browser files individually and report the full-suite limitation; do not treat a watcher failure as a product regression or a clean full-suite pass.