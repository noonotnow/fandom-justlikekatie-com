---
name: Netlify preview trigger
description: Why a GitHub PR may lack a Netlify deploy preview after changing its base branch.
---

**Rule:** If a PR opened against a non-default branch has no Netlify deploy-preview status, changing its base to main alone may not trigger a build. A subsequent meaningful push to the PR head can trigger the synchronize event and start the preview.

**Why:** One PR had no Netlify status after opening against a release branch or after changing its base to main. A later test-only commit to its head produced a pending deploy-preview status and a successful build. The missing preview was not evidence of a broken function.

**How to apply:** Before assuming Netlify is unavailable, inspect the GitHub commit statuses and PR base, then make a meaningful change and push if one is needed; do not add empty commits solely to trigger a preview.