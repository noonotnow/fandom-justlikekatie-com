---
name: CI-red but local-green
description: Diagnose GitHub CI failures that don't reproduce locally
---
Rule: when GitHub CI is red but the same tests pass locally, suspect that local and remote main have diverged — tests can land remotely without their implementation. Reproduce against `origin/main` in a throwaway worktree before touching test or CI code.

**Why:** A red-everywhere CI incident was misdiagnosed as env/secret differences; the real cause was implementation commits that existed only locally.

**How to apply:** `git fetch`, diff local vs origin for the files under test, reproduce in a worktree at origin/main; fetch again immediately before pushing, because the remote can advance during a session. When it has, merge it normally, validate the combined tree, and never force-push over it.

Rule: task-completion rebases can replay historical commits that revive retired product flows; never choose a conflict side from its `ours`/`theirs` label alone.

**Why:** A completion rebase reintroduced obsolete packet behavior and spliced stale billing fixtures into otherwise current code, producing API mismatches and test failures even though each side looked plausible in isolation.

**How to apply:** Resolve against current product decisions and live interfaces, remove tests for retired behavior, then rerun the production build, full tests, and lint on the rebased tree before completion.
