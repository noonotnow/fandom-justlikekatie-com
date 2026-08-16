---
name: Split-brain main breaks CI
description: Why sign-in tests were red in CI but green locally, and how to prevent it
---
Rule: local `main` and `origin/main` can diverge in this project (partial pushes of test files without their implementation commits). CI-red-but-local-green almost always means origin/main is missing implementation commits that exist locally.

**Why:** Sign-in tests were merged to origin/main while the matching public-auth implementation only existed on local main → ~11 CI failures blocked all merges.

**How to apply:** When CI fails but local passes, first `git fetch` and diff local vs origin for the files under test; reproduce with a worktree at origin/main. After any local commit meant for production, push main promptly so tests and implementation travel together.
