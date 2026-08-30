---
name: External Netlify deployment
description: The product's documented production site is an external Netlify deployment, separate from Replit deployment metadata.
---

The production site is deployed outside Replit. Replit deployment status and logs can therefore report no deployment even while the custom Netlify domain is reachable; verify that the live asset bundle and function routes contain the current release before running production-only flows.

**Why:** The custom domain can continue serving an older Netlify build while the workspace and GitHub main branch contain newer code, making live payment checks invalid unless the deployed revision is checked first.

**How to apply:** Treat a stale live bundle or missing function route as a deployment blocker, not as evidence of an application billing failure. Publish the intended repository revision through the external Netlify pipeline before testing hosted Checkout or webhooks.