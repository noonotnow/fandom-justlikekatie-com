---
name: Stripe account alignment
description: Prevents mixing Replit-connected Stripe resources with direct Netlify credentials.
---

The Stripe Price ID, server API key, and webhook signing secret must all come from the same Stripe account and mode. A valid key can still fail to read a Price when it belongs to another account, is live-mode instead of test-mode, or is restricted.

**Why:** External Netlify billing uses direct server-only Stripe credentials, while Replit development can use the separate Stripe connector. A Price can be valid in the connector account while inaccessible to Netlify. A subscription created before the correct webhook destination exists will also remain unknown to the app even though its payment succeeded.

**How to apply:** Before Checkout verification, compare the Price, API key, and exact deployed endpoint's signing secret inside one account and mode. If a live subscription predates that endpoint, replay a real subscription event or update that subscription's metadata to trigger reconciliation; a checkout-session event alone only links the customer.