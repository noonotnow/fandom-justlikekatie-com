---
name: CI-red but local-green
description: Diagnose GitHub CI failures that don't reproduce locally
---
Rule: when GitHub CI is red but the same tests pass locally, suspect that local and remote main have diverged — tests can land remotely without their implementation. Reproduce against `origin/main` in a throwaway worktree before touching test or CI code.

**Why:** A red-everywhere CI incident was misdiagnosed as env/secret differences; the real cause was implementation commits that existed only locally.

**How to apply:** `git fetch`, diff local vs origin for the files under test, reproduce in a worktree at origin/main; after committing locally, push main promptly so tests and implementation travel together.
