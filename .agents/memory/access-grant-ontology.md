---
name: Access grant ontology
description: Separation between paid products, durable membership designations, preview grants, and administrative authority.
---

Treat subscription entitlements, membership designations, preview access, and administrative authority as separate concepts. An active `fandom_collector` subscription identifies a purchased product. A designation such as `founding_collector` may confer one or more scoped, revocable preview grants, but it does not confer admin authority. Preview grants should name the feature they unlock rather than exposing every future feature through one permanent boolean.

**Why:** Internal testing needs access independent of Stripe state today, while a future founding membership may legitimately receive early features at scale. Encoding either case as admin access, an account-specific exception, or a permanent all-preview flag would blur customer benefits with operational authority and make later revocation unsafe.

**How to apply:** Authorize owned product actions, such as creating a large-grid publishing handoff, through an explicit feature grant when they are ready for preview. Keep authoritative publishing, queue operation, audits, repairs, private exports, and other system mutations behind admin or the appropriate Creator OS product capability. A founding designation may generate named preview grants with provenance and optional start, expiry, or revocation data.