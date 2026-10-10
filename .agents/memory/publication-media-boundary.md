---
name: Publication MEDIA boundary
description: Durable ownership and composition rules for published Vibe Atlas grids.
---

Published Vibe Atlas boards use two immutable layers: MEDIA owns each image byte and its checksum-backed delivery descriptor; the publication manifest owns the exact nine-card order, hero position, date, and approval provenance. A transient search URL is provenance only, never the public delivery source.

**Why:** Source thumbnails can expire or change, while a published editorial board must remain the exact approved composition. Keeping image ownership separate from composition also lets Collection records reuse canonical MEDIA assets without changing the publication receipt.

**How to apply:** Materialize all nine images before exposing a new edition. Treat the date manifest as append-only and first-write-wins, strong-read the authoritative record after conditional writes, and keep partial failures in a retryable reconciliation receipt.

An unfinished publication must not enter the derived public-date catalogue before its immutable manifest exists. If a historical catalogue reference is dangling, preserve any pending MEDIA receipt and reconcile only the derived reference under publication coordination; a later successful retry can safely restore the date.

**Why:** One missing manifest in the catalogue made the entire public record inventory fail closed, hiding an unrelated verified edition and its sitemap links. A pending receipt from a failed attempt was not itself evidence that a public record existed, but deleting it would have lost the retry path.

**How to apply:** Verify the immutable manifest directly before trusting a catalogue reference. Distinguish recent work from stale pending receipts, and verify public routes and sitemap after any catalogue reconciliation.

Individual acquisition and direct fan reporting of an already delivered Daily Drop card must not depend on editorial Archive indexability. A complete, immutable, MEDIA-backed daily publication is evidence of public delivery even when it lacks the substantive copy needed for an Archive page.

**Why:** A valid publicly displayed nine-card board was unsaveable because the acquisition check reused the stricter editorial inventory gate. Publishing a page or regenerating the board would change unrelated editorial state rather than fix access.

**How to apply:** Strong-read only the exact date's authoritative publication manifest and validate its exact card identity and MEDIA association. Retain server-derived Shanghai age and Collector gates for individual acquisition, but never impose those save gates on reporting a publicly delivered image. Fail closed on missing or invalid evidence; do not recover from caches on public save or report requests or fabricate links or receipts.