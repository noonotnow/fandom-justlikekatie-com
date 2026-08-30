---
name: External Netlify deployment
description: The product's documented production site is an external Netlify deployment, separate from Replit deployment metadata.
---

The production site is deployed outside Replit. Replit deployment status and logs can therefore report no deployment even while the custom Netlify domain is reachable; verify that the live asset bundle and function routes contain the current release before running production-only flows.

**Why:** The custom domain can continue serving an older Netlify build while the workspace and GitHub main branch contain newer code, making live payment checks invalid unless the deployed revision is checked first.

**How to apply:** Treat a stale live bundle or missing function route as a deployment blocker, not as evidence of an application billing failure. Publish the intended repository revision through the external Netlify pipeline before testing hosted Checkout or webhooks.

Replit-hosted Project Analytics does not observe this production site because its tracker is injected only into Replit-published apps. Production interaction events must use the site's configured Google Analytics tag and be verified in a Netlify deploy preview or live bundle.

**Why:** Replit analytics can be authorized yet return zero rows while the externally deployed Netlify site is receiving real traffic.

**How to apply:** Do not ask for a Replit publish solely to enable analytics. Send bounded custom events through the existing browser Google tag, merge through the Git repository, and use the Google Analytics property for production aggregates.

External Netlify Functions cannot resolve the Replit-managed PostgreSQL hostname
`helium`, even when the Replit `DATABASE_URL` is copied into Netlify. External
billing therefore uses the existing Netlify Blobs service for its minimal
account/customer/subscription mapping; the Replit Postgres + Stripe Sync path
remains a development fallback.

**Why:** Replit’s managed database URL is valid inside the Replit runtime but
does not provide DNS reachability from this separate Netlify deployment.

**How to apply:** Do not spend time re-entering the same Replit database URL in
Netlify. Keep it only if another function needs it; external billing needs the
server-side Stripe key and webhook secret plus the normal Netlify Blobs context.
