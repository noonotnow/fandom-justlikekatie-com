---
name: Daily Drop clock and preview boundary
description: Noon Eastern expectations, separate Shanghai save cutoffs, and the risk of preview functions sharing publication stores.
---

Star of the Day must refresh at noon Eastern year-round, not Shanghai midnight.

**Why:** The creator explicitly chose “Noon Eastern year-round” rather than keeping Shanghai midnight.

**How to apply:** Use America/New_York for the refresh and current-edition rollover, including public requests before noon in winter. Preserve the existing edition date labels and keep the Shanghai three-day individual-save cutoff separate; do not change Collection save deadlines.

Netlify deploy-preview functions can access the same named site-level Blob stores as production. An unreviewed automatic generation worker must not publish an edition into that shared history.

**Why:** Testing or opening a preview can otherwise trigger real publication before the creator approves the release.

**How to apply:** Restrict automatic publication to production, or use genuinely isolated test stores and fixtures. Compiled background-mode checks and mocked browser checks do not prove a real production generation completed.

Do not assume Netlify's build environment variables exist inside running Functions.

**Why:** [Netlify's runtime-variable documentation](https://docs.netlify.com/build/functions/environment-variables/) guarantees only `URL`, `SITE_NAME`, and `SITE_ID` among its built-in variables. Synthetic tests with `CONTEXT`, `DEPLOY_ID`, and `DEPLOY_URL` can pass while the same production protection rejects every real invocation.

**How to apply:** Consult the [V2 Function API](https://docs.netlify.com/build/functions/api/) and use trusted runtime deployment metadata. Test with build-only variables absent, with conflicting build variables, and with unpublished/preview metadata. Reuse an existing Functions-scoped signing secret with domain separation rather than assuming a Replit secret is also configured on Netlify.

Use the trusted main site address for a production-only worker handoff, while retaining signed deployment binding.

**Why:** A live investigation found the published-site API accepting a queued job while the active deployment permalink rejected automatic generation. The queued job had no recorded worker execution. HTTP 202 acceptance alone did not prove the worker started. The creator subsequently confirmed live recovery, corroborated by a completed nine-card response.

**How to apply:** Use Netlify's runtime main site address, not caller headers or build variables. Keep the published-production guard and signed deployment/date/job checks. Recover only unstarted queued jobs from an older deployment with conditional writes; never steal a running lease. Verify a real completed publication after release before claiming generation is fixed.
