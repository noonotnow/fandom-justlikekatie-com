---
name: Stripe account alignment
description: Prevents mixing Replit-connected Stripe resources with direct Netlify credentials.
---

The Stripe Price ID, server API key, and webhook signing secret must all come from the same Stripe account and mode. A valid key can still fail to read a Price when it belongs to another account, is live-mode instead of test-mode, or is restricted.

**Why:** External Netlify billing uses direct server-only Stripe credentials, while Replit development can use the separate Stripe connector. A Price can be valid in the connector account while inaccessible to Netlify.

**How to apply:** Before live Checkout verification, compare resources within one Stripe account: use its active test Price, its `sk_test_...` key, and the `whsec_...` secret for the exact deployed webhook URL. Do not mix resources from a newly created Stripe account with an existing Replit connection.