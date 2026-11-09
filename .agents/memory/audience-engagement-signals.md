---
name: Audience engagement signals
description: Reader saves and exports as a small, transferable curation preference.
---

**Rule:** For a pairing's last twelve editions, per-card interaction weight is net saves (unsave cancels save) plus half a point per dated grid export that includes the card. Each card's lift is its share of the edition's interactions minus 1/9, so traffic differences cancel. A source or query becomes a preference only with at least three cards, two editions, weight four, and mean lift beyond ±0.03.

**Why:** Saves and exports were logged "to inform future curation" but never read. Exact images are not boosted because freshness already avoids republishing them; reader taste should transfer to new images.

**How to apply:** `log-engagement` also writes `vibe-atlas-export:<date>:` index entries for dated grid exports (exports before this change are not indexed). The board bonus is capped at ±0.04, well below operator calibration (±0.12), applied after safety/identity/promise gates, and only when an engagement profile is passed (Daily Drop), so audits are unaffected. Provenance lands in `curation.audienceEngagement`.
