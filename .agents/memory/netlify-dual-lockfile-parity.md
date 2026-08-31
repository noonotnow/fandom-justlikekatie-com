---
name: Netlify dual-lockfile parity
description: Netlify dependency installation behavior and why npm and pnpm lockfiles must stay equivalent.
---

Keep `pnpm-lock.yaml` synchronized with `package.json` even when local development and GitHub CI primarily use npm.

**Why:** Netlify detects the pnpm lockfile and runs a frozen pnpm install before the configured build command. A dependency added only to `package-lock.json` can therefore pass npm-based CI but stop production before the build starts.

**How to apply:** Treat a dependency change as incomplete until both tracked lockfiles describe the same dependency graph, then reproduce `pnpm install --frozen-lockfile` before relying on an external Netlify deploy.
