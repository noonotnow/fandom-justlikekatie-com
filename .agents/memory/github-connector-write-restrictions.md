---
name: GitHub connector proxy write restrictions
description: Which GitHub write endpoints the Replit connector proxy allows vs blocks — critical for any push workflow
---

## The rule
The Replit GitHub connector proxy (connectors.replit.com/api/v2/proxy) blocks most git data write endpoints. Do not rely on `POST /git/trees` or `PUT /repos/.../contents/...` — they are consistently blocked regardless of OAuth scope.

**What works:**
- `GET` on all endpoints (reads)
- `POST /git/blobs` → 201
- `POST /graphql` for read queries

**What is blocked:**
- `POST /git/trees` → 404 "Not Found" (proxy restriction, not GitHub permissions)
- `PUT /repos/{owner}/{repo}/contents/{path}` → 403 Cloudflare HTML (WAF rule)
- GraphQL `createCommitOnBranch` mutation → FORBIDDEN
- git push HTTPS → credential helper times out / returns invalid token

**Why:** The Replit GitHub connector is scoped for read-heavy usage. The git data write endpoints (trees, commits, refs) are blocked at the proxy level, not at the GitHub App permission level.

**How to apply:** When a task needs to push files to GitHub, exhaust the above list first. If all are blocked, note the limitation in `drift_reason` when marking complete — the file is on disk and will activate when the user pushes or when Replit's sync mechanism picks it up.
