---
name: Netlify Blob canonical reads
description: Prevent saved operator decisions from appearing missing when Netlify Blob prefix listings lag.
---

**Rule:** When a workflow already knows the immutable key for a current audit run, canonical verdict, or exact receipt, read that key directly with strong consistency. Use prefix listings only for discovery and history, with a direct-key fallback for the current record. Derived history indexes need a lightweight key-coverage check so a later-complete listing can invalidate an index rebuilt from an incomplete listing.

**Why:** Netlify Blob prefix listings can temporarily omit a successfully written canonical record even while a direct strong read returns it. This caused an approved rescue board with both human confirmations to fail its publication gate until the read path stopped depending on listing visibility.

**How to apply:** Bind current-record reads to the strongly read head or immutable receipt reference, verify the exact run and hashes, and keep publication fail-closed if the direct record does not validate. For derived indexes, separate key coverage from record validity: fingerprint discovered keys, derive values only from verified canonical records, and rebuild when coverage changes. Do not weaken receipt, board-size, or current-run checks to compensate for list lag.