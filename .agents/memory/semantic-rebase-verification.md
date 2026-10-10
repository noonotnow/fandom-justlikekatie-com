---
name: Semantic rebase verification
description: Guard against invalid auto-merged files during divergent workspace rebases.
---

Automatic reconciliation can rewrite non-conflicted files into syntactically invalid or semantically inconsistent combinations even after every reported conflict is resolved. It can also drop required imports from JavaScript build scripts without producing a TypeScript error.

**Why:** A divergent workspace rebase produced a test file with duplicated, misplaced blocks and stale fixture assumptions despite a clean rebase completion. Focused checks passed, but the full function suite exposed the damage.

**How to apply:** After a multi-round rebase, run build preparation as well as the whole relevant test suite and inspect failures in files that were automatically merged, not just files named as conflicts. Isolated project fixtures must copy newly required shared dependencies. Preserve the current branch's richer behavior and repair stale fixtures rather than weakening production guards.

Completion can reconcile concurrent project changes before reviewing them, invalidating the locally verified version.

**Why:** A passing browser test file was automatically combined with incoming multi-tab coverage, relocating fixtures and removing assertions without leaving conflict markers.

**How to apply:** When completion reports failures inconsistent with the last test run, inspect the current merged file and rerun the whole affected test file. Preserve incoming coverage as well as the assigned work.