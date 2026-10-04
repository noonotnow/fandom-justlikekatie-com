---
name: Actor-directory freshness boundary
description: Why public actor-name discovery may lag evidence without weakening release or acquisition authority.
---

Names-only actor discovery may use a short, explicitly dated verification snapshot. This freshness delay is not permission to cache edition authorization, image-save eligibility, or release approvals.

**Why:** Independently verifying the entire historical Archive for every reader scales storage cost with both archive size and visitor count. Reusing a disposable public-name derivation avoids that cost while leaving manifest and MEDIA authority unchanged.

**How to apply:** Treat catalogue membership as candidate evidence only. Invalidate discovery on eligible-date changes and periodically reverify unchanged dates so repairs and invalid MEDIA associations are noticed. Keep acquisition and edition delivery tied to authoritative manifests. A stale directory option must never confer access or publication authority.

Prefer bounded in-instance request sharing for duplicate actor-directory refreshes; do not introduce a distributed refresh lease without evidence that duplication across server instances warrants it.

**Why:** A distributed lease adds storage writes and a browser wait/retry protocol to a disposable names-only optimization. Existing conditional writes already protect retained progress; sharing overlapping identical requests reduces scans without changing the reader contract.

**How to apply:** Keep storage scopes isolated, allow abandoned work to be replaced, and never let joining an older request extend its evidence expiry. Cross-instance duplicate scans remain possible; assess real traffic before adding a distributed lock. Deterministic CAS fixtures test race handling, not production atomicity.