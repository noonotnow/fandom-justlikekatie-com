---
name: Daily Drop freshness
description: How a recurring actor/Vibe pairing avoids replaying published cards and reaches past page one.
---

**Rule:** A recurring daily pairing curates in three stages: unseen cards only, then unseen ahead of published (published cards moved into trailing batches), then the original ranking. Its last six editions define "published" (thumbnail, candidate id, MEDIA checksum, or source fingerprint).

**Why:** Every provider call used to read page one, and the 7-of-9 overlap "refresh" re-ran the same page one with cache bypass, so recurring pairings replayed the same nine and fell back to rearranging them.

**How to apply:** Curation re-sorts inside a batch and keeps only the first 36 candidates, so ordering must happen by batch position, never within a batch. When fewer than 18 unseen candidates exist, run a bounded deep pass (up to six queries on a rotating page 1–2, plus a past-year recency rung for the first two queries) and append at most three ranked deep batches. The overlap refresh reads the next page, not page one. Baidu has no date filter, so recency windows skip it (and Yandex). Page zero keeps historical URLs and cache keys. Freshness never relaxes safety, identity, promise, or eligibility gates; provenance lands in `curation.freshness`.
