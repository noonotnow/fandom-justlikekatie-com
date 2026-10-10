---
name: GitHub API push protocol
description: How to push commits via the GitHub API from Replit
---
An administrator merge can still be rejected when the repository requires independent approval of the last push. Treat that as a reviewer gate, not a token or push failure.

**Why:** GitHub rejected a creator-authorized editorial release after every check passed because the last pusher had no independent approval; administrator access did not override the rule.

**How to apply:** Prepare the bounded release PR and verified preview, then obtain another reviewer's approval. Do not disable protection or manually deploy an unsynchronized tree to avoid this gate.

Rule: use a PAT-in-URL (`https://user:PAT@github.com/…`) for `git push`; the connector proxy is not needed for push.

**Why:** Direct git push with PAT works reliably from Replit shell. The connector API write paths (PUT /contents, POST /git/trees) have proven unreliable (Cloudflare blocks, 404s).

**How to apply:** Always use `git push https://owner:${GITHUB_PAT}@github.com/owner/repo.git branch`. Never pipe large content through shellExec for blob creation — read files with readFile and verify the sha before any PUT.

When an isolated Actions drill is needed, push a clean branch based on GitHub's current default branch rather than the workspace's divergent history. GitHub secret scanning can reject a temporary branch because of an old local commit even if its current tree contains no credentials. Do not bypass the protection; carry over only the needed job and dependencies. A successful mail API step proves acceptance, not inbox receipt — obtain operator confirmation separately.

When the workspace has moved far ahead of GitHub's default branch, do not cherry-pick a workspace commit that touches a workflow also changed by unpublished commits; it can conflict across unrelated jobs. Apply only the relevant workflow change to a clean worktree based on the remote default branch for the live drill. **Why:** the local and remote workflow files can have different sets of jobs even though the failing action exists in both. **How to apply:** compare the remote version first, keep the drill branch minimal, and leave unrelated local workflow changes out of that branch.
