---
name: Release receipt rollout
description: Why old release evidence must not be silently minted during public sitemap reads.
---

Per-release evidence should be created only on a trusted publication or deliberate operator reconciliation path, never by a public sitemap request using the current mutable release-history record alone. A missing receipt must keep the dynamic sitemap closed until the old releases have been checked and seeded.

**Why:** If a truncated history and catalog are used to mint "immutable" receipts during a public read, the truncated records become their own proof and erased editions stay invisible. Existing historical releases may predate the receipt scheme, so an initial static-only sitemap is preferable to claiming they are verified without an audit.

**How to apply:** When introducing or migrating historical release receipts, compare against the actual manifests and the independently reviewed release baseline before seeding. Do not turn a missing-receipt sitemap fallback into automatic backfill.