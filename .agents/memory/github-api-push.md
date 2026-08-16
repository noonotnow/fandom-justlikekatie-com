---
name: GitHub API push protocol
description: How to push commits via the GitHub API from Replit
---
Rule: use a PAT-in-URL (`https://user:PAT@github.com/…`) for `git push`; the connector proxy is not needed for push.

**Why:** Direct git push with PAT works reliably from Replit shell. The connector API write paths (PUT /contents, POST /git/trees) have proven unreliable (Cloudflare blocks, 404s).

**How to apply:** Always use `git push https://owner:${GITHUB_PAT}@github.com/owner/repo.git branch`. Never pipe large content through shellExec for blob creation — read files with readFile and verify the sha before any PUT.
