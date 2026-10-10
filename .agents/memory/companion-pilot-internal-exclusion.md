---
name: Companion pilot internal exclusion
description: Privacy boundary and reporting cutover for anonymous internal pilot visits.
---

Known internal visitors must opt out locally on each browser profile before visiting the live companion routes. This is cooperative exclusion, not a server-side identity system; don't add email, account identifiers, or private tokens to engagement analytics.

**Why:** Anonymous historical sessions cannot be recognized after the fact without introducing an identity signal. Even a perfectly implemented opt-out cannot make an earlier reporting window clean.

**How to apply:** When comparing paths, document the rollout and staff marking cutover, and use a new full window if the earlier window included unmarked internal visits. Keep consent receipts and actual paid outcomes separate from this visit filter.

Live normal-reader branch checks necessarily create synthetic companion visits when the endpoint accepts them. Run them before a clean observation window, disclose the test traffic, and do not bypass aggregate suppression or invent a retroactive identity-based cleanup.

**Why:** A realistic user agent is needed to test acceptance independently of the server's crawler/headless exclusion; passing that branch adds anonymous events indistinguishable from reader events.

**How to apply:** Start a prospective clean window on a complete UTC day after the last unmarked smoke check and confirmation that every known staff testing profile is marked. Successful marking in one isolated test context does not certify the rest of the staff's browsers.