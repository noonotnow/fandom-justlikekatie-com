---
name: Netlify dual-lockfile parity
description: Netlify dependency installation behavior when this repository tracks both npm and pnpm lockfiles.
---

Keep `pnpm-lock.yaml` synchronized with `package.json` even when local development and GitHub CI primarily use npm.

**Why:** Netlify detects the pnpm lockfile and runs a frozen pnpm install before the configured build command. A dependency added only to `package-lock.json` can therefore pass npm-based CI but stop production before the build starts.

**How to apply:** After dependency changes, update both lockfiles and reproduce `pnpm install --frozen-lockfile` before relying on an external Netlify deploy.