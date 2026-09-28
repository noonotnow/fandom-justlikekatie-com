---
name: Cleanup alias scope parity
description: Scope handling requirement when expanding browser cleanup ownership analysis
---

When recognizing a new source of browser or server ownership, check that the lexical binding collector recognizes the same binding site and every destructured identifier it introduces.

**Why:** Ordinary declarations can pass while parameter-like bindings collide with outer aliases, producing false unsafe-cleanup reports across scope boundaries.

**How to apply:** Include tests with same-named outer and inner aliases, checking cleanup both inside and after the inner scope, whenever expanding resource classification.