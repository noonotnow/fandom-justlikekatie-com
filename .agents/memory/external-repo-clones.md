---
name: External repo working clones
description: Where to clone external repos (CREATE) and how to run their tests in this environment
---

- Clone external repos to `/home/runner/<name>`, NOT `/tmp` — `/tmp` is wiped periodically mid-session and uncommitted work is lost (happened twice while fixing CREATE).
- **Why:** losing a working clone forces re-applying every edit from memory.
- **How to apply:** `git clone --depth 5 https://noonotnow:${GITHUB_PAT}@github.com/noonotnow/create-justlikekatie-com.git /home/runner/create-repo`.
- If CREATE's pinned vitest tarball is blocked by the package firewall, `npm install -D vitest@latest` locally but never commit the package.json/package-lock changes.
- CREATE's full vitest suite has pre-existing local failures under substituted vitest (tsx parse/rolldown, media-upload); compare against a `git stash` baseline instead of expecting green.
- CREATE repo has no CI check-runs on push; validate with local vitest + tsc before pushing to main.

## Neon serverless v1 API change
`@neondatabase/serverless` v1.x rejects `sql("SELECT ...")` plain-string calls — use `sql.query(SQL_STRING)`. Older CREATE scripts written for the v0 callable style fail at runtime until patched.

## Installing CREATE deps in Replit
`npm install` fails: vitest tarball is blocked by the Replit package firewall. Use `npm install --omit=dev`, and run scripts with the workspace's own `node_modules/.bin/tsx` (installing tsx in the clone also trips the firewall via the lockfile).

## GITHUB_PAT scope (Aug 2026)
The GITHUB_PAT could clone but got 403 "Write access to repository not granted" on push to CREATE — verify write scope before promising to push fixes upstream.
