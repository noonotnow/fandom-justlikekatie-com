---
name: Daily Drop actor eligibility
description: Safety contract for binding scheduled actor-pack pairs to current private audit evidence.
---

**Rule:** Daily Drop eligibility is pairing-specific and fail-closed. An approval is valid only for the current retained audit run, identity-profile version, and exact query fingerprint. Revalidate before serving cached or fallback editions and after expensive curation work.

**Why:** A rerun, query correction, or operator revocation can happen while a Drop is cached or still building. A verdict-shaped snapshot alone can silently schedule stale or wrong-person evidence.

**How to apply:** Keep audit runs and verdicts append-only, move current state with a separate head, and make scheduler snapshots prove they match the authoritative head/run/verdict. Never filter or reindex the public actor-pack roster to implement fallback.