---
name: Misprint exclusions
description: Approved Misprint reports remove their images from future Daily Drop and Collector boards.
---

**Rule:** A Misprint receipt with `futureExclusion` excludes its image only while active (approved review or trusted operator feedback, not retracted). Scope sets reach: global_asset everywhere; actor_identity and metadata_signal for every Vibe of that actor; actor_vibe and result_set for that pairing only.

**Why:** Receipts were labelled as future exclusions but nothing consumed them, so an approved "Some Other Man" image could be retrieved and published again.

**How to apply:** `readMisprintExclusions` reads the actor-audit store and applies the shared `applyMisprintDecisions` (the operator console imports the same function). Excluded results are removed from every search pass before ranking; counts land in `curation.misprintExclusions`. Reads fail open with `unavailable: true` so storage trouble cannot stop a Drop. Exact approved editorial/rescue boards are not filtered.
