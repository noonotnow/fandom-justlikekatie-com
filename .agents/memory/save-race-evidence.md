---
name: Save race evidence
description: Keep native database durability separate from delayed callback and UI completion evidence.
---

For save-race checks, distinguish a pending persistence promise from an uncommitted database write. Hold and release actual asynchronous boundaries, and assert durable contents separately from bookmark state and acquisition feedback.

**Why:** Native IndexedDB can commit before a deliberately delayed transaction-completion callback reaches the application. Treating that pending callback as proof that no record exists gives false race assertions and misses removals requested after the native commit but before the save UI finishes.

**How to apply:** Test both delayed authorization before any write and delayed completion after the native write. When removing during a pending save, prove the intent was issued while completion was still held, then release it and verify the final record and controls, including after reload. Preserve unrelated records throughout.
