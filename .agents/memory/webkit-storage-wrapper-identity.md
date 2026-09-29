---
name: WebKit storage wrapper identity
description: Avoid reference identity checks when intercepting browser storage writes in cross-engine tests.
---

In cross-browser tests that intercept `Storage.prototype.setItem`, identify the intended storage write by its dedicated key rather than testing `this === localStorage`.

**Why:** WebKit may expose a different JavaScript wrapper on successive `localStorage` property reads, so a storage write can occur while a reference-equality test misses it. This made a real notification-fallback attempt look absent in CI.

**How to apply:** For test-only interception, choose a unique application key and assert that the write was attempted; do not assume browser storage objects retain reference identity across accesses. Keep the override narrowly scoped to that key so unrelated storage behavior remains intact.