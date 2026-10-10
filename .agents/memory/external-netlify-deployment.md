---
name: External Netlify deployment
description: The product's documented production site is an external Netlify deployment, separate from Replit deployment metadata.
---

The production site is deployed outside Replit. Replit deployment status and logs can therefore report no deployment even while the custom Netlify domain is reachable; verify that the live asset bundle and function routes contain the current release before running production-only flows.

Netlify can append its own RUM script and collaboration-toolbar markup to hosted preview HTML, so an unchanged static source file need not produce a byte-identical HTTP body.

**Why:** A release preview retained the complete original article body and closing document, but hosted-response equality checks failed on Netlify's injected footer.

**How to apply:** Verify the exact deployment commit and unchanged source independently. Compare the original article body while accounting specifically for host-managed instrumentation; do not broadly discard script or markup differences. Browser readiness checks should wait for rendered controls rather than network idle, since host instrumentation can keep requests active.

Netlify can append its own RUM or deploy-preview tooling to served HTML. For an exact approved-copy check, compare the authored head and main article independently of provider-injected trailing scripts.

**Why:** A byte-for-byte full-document comparison rejected an otherwise identical approved guide solely because Netlify appended monitoring and preview tooling.

**How to apply:** Keep strict comparisons for the authored content, citations, canonical, and boundaries; identify provider-added markup separately rather than weakening reader-copy checks.

**Why:** The custom domain can continue serving an older Netlify build while the workspace and GitHub main branch contain newer code, making live payment checks invalid unless the deployed revision is checked first.

**How to apply:** Treat a stale live bundle or missing function route as a deployment blocker, not as evidence of an application billing failure. Publish the intended repository revision through the external Netlify pipeline before testing hosted Checkout or webhooks.

For admin-support instructions, verify the component in the JavaScript bundle the custom domain actually serves before describing controls from workspace source.

**Why:** The workspace moderation panel supported multiple discussions while the live admin bundle still rendered only the original discussion. Explaining the newer controls as available gave the creator incorrect instructions.

**How to apply:** If a reported missing control exists locally, check the served bundle rather than attributing the discrepancy to navigation or a selected tab. Distinguish a public API's supported discussions from the live admin UI's coverage.

A successful manual Netlify production publish can immediately be replaced by a concurrent GitHub deployment. Verify the site's current published deployment and the custom domain, not just the deployment ID returned by the CLI.

**Why:** Automatic releases can finish while a manual publish is being verified; the newly active deployment may either preserve or remove the manually published feature.

**How to apply:** Confirm the active release includes the intended feature through its live bundle and function behavior. Keep the GitHub production branch synchronized before relying on a manual release remaining available.

For creator-facing final reviews, provide an externally reachable review URL rather than relying on the workspace preview.

**Why:** The creator reports that they cannot preview the site in this environment.

**How to apply:** Internal screenshots and tests remain useful engineering checks, but do not replace a URL the creator can open. Prepare a Netlify preview or obtain explicit approval before publishing production.

Replit-hosted Project Analytics does not observe this production site because its tracker is injected only into Replit-published apps. Production interaction events must use the site's configured Google Analytics tag and be verified in a Netlify deploy preview or live bundle.

**Why:** Replit analytics can be authorized yet return zero rows while the externally deployed Netlify site is receiving real traffic.

**How to apply:** Do not ask for a Replit publish solely to enable analytics. Send bounded custom events through the existing browser Google tag and use the Google Analytics property for custom-event reporting. The existing Netlify Web Analytics service can answer site-wide traffic questions without a GA reporting grant; it cannot supply GA events or conversion funnels.

Netlify traffic reports use `https://analytics.services.netlify.com/v2/{site_id}/pageviews`, `visitors`, and `ranking/pages` or `ranking/sources`. There is no `/sites/` segment in these traffic endpoints, unlike the function-log endpoint on the same service.

**Why:** Older unofficial v1 documentation and the function-log URL shape both yielded misleading 404s despite an authorized token and enabled traffic reporting.

**How to apply:** Use the existing Netlify runtime authorization without exposing it. Request date-bounded aggregates in the creator's timezone. Use `visitors` with `resolution=range` for period-unique IPs rather than summing daily counts.

Netlify's successful HTML response counts include QA traffic and apparent scans, and even icon URLs can appear as pageviews when they receive an HTML fallback. Unique visitor counts identify IPs, not confirmed human readers.

**Why:** The traffic ranking included icon requests and scanner paths alongside actual content pages. The newly released article's early counts also included release verification.

**How to apply:** Label raw totals honestly, distinguish real content pages in rankings, compare completed days separately from the current partial day, and never infer reader growth or conversion from unfiltered server traffic.

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

Netlify's deploy-function inventory can use compact metadata: function names
appear under `n`, while the response wraps the entries in `functions`.

**Why:** Filtering only a presumed top-level array or `name` property falsely
made deployed refresh functions appear absent.

**How to apply:** Inspect the actual inventory response shape before claiming
a function or schedule is missing; verify scheduling from deployed metadata,
not just workspace configuration.
