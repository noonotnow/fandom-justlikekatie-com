---
name: Publication MEDIA boundary
description: Durable ownership and composition rules for published Vibe Atlas grids.
---

Published Vibe Atlas boards use two immutable layers: MEDIA owns each image byte and its checksum-backed delivery descriptor; the publication manifest owns the exact nine-card order, hero position, date, and approval provenance. A transient search URL is provenance only, never the public delivery source.

**Why:** Source thumbnails can expire or change, while a published editorial board must remain the exact approved composition. Keeping image ownership separate from composition also lets Collection records reuse canonical MEDIA assets without changing the publication receipt.

**How to apply:** Materialize all nine images before exposing a new edition. Treat the date manifest as append-only and first-write-wins, strong-read the authoritative record after conditional writes, and keep partial failures in a retryable reconciliation receipt.