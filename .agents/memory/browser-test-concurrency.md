---
name: Browser test concurrency
description: Keep Chromium-based browser checks parallel without exhausting CI runner resources.
---

Browser checks should remain parallel but use a bounded Node test concurrency instead of allowing every browser test to launch at once.

**Why:** Each test starts a Vite server and Chromium instance, and uncapped parallelism can exhaust native thread-pool or process resources before assertions run.

**How to apply:** Choose a small parallel limit appropriate for the runner (currently four) and verify the default package command repeatedly; do not globally serialize the browser suite.

In a large Replit workspace, even the bounded full suite may exhaust the container's file-watch limit because each Vite server watches shared workspace and skill trees. If it fails with `ENOSPC` before assertions, run the relevant browser files individually and report the full-suite limitation; do not treat a watcher failure as a product regression or a clean full-suite pass.

Fixture-only browser checks should not depend on live hot reload or external font loading while other project tasks are editing the same workspace.

**Why:** Concurrent edits repeatedly regenerated Tailwind CSS during Archive browser checks, producing slow navigation and whole-test timeouts despite successful server probes. Increasing the test deadline alone did not remove the interference.

**How to apply:** Isolate fixture servers from file changes when hot reload is not under test, and verify the resolved server configuration actually disables watching. Wait for DOM readiness plus actual UI assertions rather than unrelated external-resource load completion, and mock external fonts/trackers where irrelevant.