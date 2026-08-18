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
