---
name: GitHub API push protocol
description: How to push to GitHub from this repl safely (git push auth fails; API-only), and the corruption trap to avoid
---
Shell `git push` WORKS when the URL embeds the PAT: `git push "https://x-access-token:${GITHUB_PAT}@github.com/<owner>/<repo>.git" <branch>` (verified 2026-08-16). Prefer this for normal pushes; the connector git-data API path below is the fallback when no PAT is available. Note: GraphQL `createCommitOnBranch` via the connector cannot touch `.github/workflows/` files (needs `workflow` scope → FORBIDDEN); the PAT push handles those fine.

**Rule:** never collect file content via shellExec output (base64 or otherwise) — the sandbox mangles output (strips tabs, adds \r) and silently head/tail-truncates beyond maxOutputBytes, which once corrupted all 20 pushed files and shipped a broken deploy.

**How to apply:** read text files with the readFile callback, create blobs with encoding "utf-8", and verify each returned blob sha equals local `git hash-object <file>` before committing the tree. After updating the ref, `git fetch` and compare `HEAD^{tree}` vs `origin/main^{tree}`; only then reset local onto origin. Keep binaries out of API pushes (re-upload or exclude). Before any `git reset --hard` recovery, park the good commit on a rescue branch first.
