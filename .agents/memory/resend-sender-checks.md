---
name: Resend sender checks
description: Permission tradeoff for verifying sender readiness without sending a test email.
---

To verify a configured sender domain through Resend without delivering mail, use the domains read API with a separate full-access verification credential from the delivery key's account. A sending-only Resend key cannot access that endpoint.

**Why:** Credential presence and DNS alone do not prove the sender is verified in the account that owns the delivery key. Resend does not offer a narrower read permission for this endpoint.

**How to apply:** Restrict the separate verification credential to the scheduled/manual check, never the alert sender. Domain verification only proves status in the verification account; use a controlled send plus inbox confirmation to prove actual delivery and account alignment. Make the full-access requirement explicit and never print API responses, keys, sender addresses, or recipients in check failures.