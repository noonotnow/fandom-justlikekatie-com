# Subscription product audit

Run the subscription product audit with:

```sh
npm run audit:subscription-products
```

Use `-- --apply` to write unambiguous product metadata updates to Stripe.

The command stores its bounded progress-reporting outage streak and alert
delivery receipt in the `subscription-product-audit-health` Netlify Blob store.
Standalone operator machines and automation must provide both protected
environment variables:

- `SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID`: the production Netlify site ID
- `SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN`: a token with write access to that
  site's Blob stores

Keep the token in the operator machine's secret manager or automation secret
store. Do not commit it. If shared storage is unavailable, the command prints a
bounded warning, but Stripe writes, audit output, and exit status are unchanged.

With both protected variables configured, run the deployed shared-storage
concurrency check with:

```sh
node --test scripts/audit-subscription-products.blob-integration.test.js
```

The check uses a unique temporary key in the audit store and removes it after
the run. Without the protected variables it is skipped.

The `Shared Stripe audit consistency check` GitHub Actions job runs this check
on the repository's weekly schedule and on manual workflow dispatches. Its site
ID and token come from protected repository secrets with the same names as the
environment variables above, so the credentials are not supplied to push or
pull-request jobs. The job and test names identify failures as shared Stripe
audit consistency failures. The job fails rather than silently skipping when
either protected secret is missing.

When this scheduled or manually dispatched job fails, a failure-only step
sends one operator email through Resend to the valid addresses in
`FANDOM_ADMIN_EMAILS`, using the protected `RESEND_API_KEY` and
`FANDOM_AUTH_FROM_EMAIL` repository secrets. The message names the failed check
and links to its GitHub Actions run and attempt; it never includes Blob
credentials or the provider response. The notification makes one bounded
delivery attempt. If alert delivery fails or is misconfigured, the job still
reports the original consistency-check failure (and the alert step also
fails). Push and pull-request jobs do not run this check or send this alert.

## Controlled failure alert verification

On September 25, 2026, a temporary workflow-dispatch switch caused the
consistency step to fail **before accessing the shared audit store**. In
[run 36186262164, attempt 1](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/36186262164),
the consistency step failed, the failure-only notification step succeeded,
and the job remained failed. An operator confirmed exactly one alert in each
intended inbox, naming and linking that run and attempt. The temporary branch
and switch were removed after the run.

This verifies failure-alert delivery, not the normal shared-storage check.
The protected GitHub repository still needs the
`SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_SITE_ID` and
`SUBSCRIPTION_PRODUCT_AUDIT_BLOBS_TOKEN` secrets before that check can run
against the production Netlify Blob store.