---
name: External repo working clones
description: Where to clone external repos (CREATE) and how to run their tests in this environment
---

- Clone external repos to `/home/runner/<name>`, NOT `/tmp` — `/tmp` is wiped periodically mid-session and uncommitted work is lost (happened twice while fixing CREATE).
- **Why:** losing a working clone forces re-applying every edit from memory.
- **How to apply:** `git clone --depth 5 https://noonotnow:${GITHUB_PAT}@github.com/noonotnow/create-justlikekatie-com.git /home/runner/create-repo`.
- If an external repo's lockfile resolves a firewall-blocked dev package, install a compatible allowed version without saving manifest changes; do not jump major versions just to validate.
- CREATE repo has no CI check-runs on push; validate with local vitest + tsc before pushing to main.

## Neon serverless v1 API change
`@neondatabase/serverless` v1.x rejects `sql("SELECT ...")` plain-string calls — use `sql.query(SQL_STRING)`. Older CREATE scripts written for the v0 callable style fail at runtime until patched.

