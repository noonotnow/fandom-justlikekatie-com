---
name: Netlify secret runtime audits
description: How to safely run one-off production audits that require secret-scoped Netlify environment values.
---

Netlify CLI environment listings can return redacted placeholders for secret-scoped values even to an authenticated site operator. Do not pass those listings into a local process and interpret provider authentication failure as proof that the saved secret is invalid.

**Why:** A local subscription audit received Netlify's redacted placeholder instead of the saved Stripe key. The real key was usable only inside the deployed Functions runtime.

**How to apply:** Run production audits requiring secret-scoped values inside a temporary admin-only function. Keep compatibility behavior active during the audit, require a complete dry run before mutation, remove the endpoint afterward, and only then deploy stricter authorization.