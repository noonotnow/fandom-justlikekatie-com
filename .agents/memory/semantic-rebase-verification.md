---
name: Semantic rebase verification
description: Guard against invalid auto-merged files during divergent workspace rebases.
---

Automatic reconciliation can rewrite non-conflicted files into syntactically invalid or semantically inconsistent combinations even after every reported conflict is resolved.

**Why:** A divergent workspace rebase produced a test file with duplicated, misplaced blocks and stale fixture assumptions despite a clean rebase completion. Focused checks passed, but the full function suite exposed the damage.

**How to apply:** After a multi-round rebase, run the whole relevant test suite and inspect failures in files that were automatically merged, not just files named as conflicts. Preserve the current branch's richer behavior and repair stale fixtures rather than weakening production guards.