---
name: Netlify strict test imports
description: Production pnpm installation can expose browser-test type imports that succeed with workspace npm dependencies.
---

Browser tests must import Playwright types through the directly declared `@playwright/test` dependency, not its transitive `playwright` dependency.

**Why:** The Netlify production build type-checks browser tests. A workspace npm installation resolved a transitive type import that Netlify's strict pnpm layout could not, failing an otherwise locally passing release.

**How to apply:** Check direct package ownership when a production type check cannot resolve an import. Do not add a redundant runtime dependency merely to make a test type import resolve.