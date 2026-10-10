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

Verify active Netlify function source and browser release parity before measuring an optimization. Duration-only invocation reports cannot distinguish actor discovery from edition requests or identify cross-instance duplicate scans.

**Why:** An operational assessment found production still using the older page inventory while the workspace already had directory request sharing. Historical reports exposed request identifiers but no process identity, query, or scan outcome, so assigning them to the new optimization would have produced a false cost claim. An honest partial outcome describes coverage, not whether new storage work occurred.

**How to apply:** Establish the deployed revision first. Require privacy-safe process/chunk/outcome evidence for duplication estimates; label candidate-count scenarios as estimates rather than measured production amplification. Count actual manifest-read work rather than partial responses: bounded reuse can remain partial without rescanning.

Do not infer intentional withholding from a combined non-public manifest outcome. A valid daily board without an indexable editorial page is different from broken MEDIA/public links or temporary storage failure.

**Why:** The read-only candidate sample combined multiple rejection gates into `not_public`; its aggregate count cannot establish either editorial intent or eligibility for safe negative-outcome reuse. Daily card acquisition also has deliberately separate authority from editorial indexability.

**How to apply:** Assess rejection reasons without changing approval gates. Any proposed partial-directory cooldown needs explicit creator approval for its repair-discovery delay; temporary failures must remain immediately retryable.

The creator approved fixed 60-second, demand-driven reuse of exhausted names-only partial outcomes only when every omission qualifies as structurally valid but non-indexable evidence. Do not grow the window or infer publication intent; retain the 15-minute hard evidence lifetime.

**Why:** The creator accepted the bounded discovery-repair delay in exchange for reducing repeated sequential scans, while retaining honest partial notices, immediate transient-failure retries and independent edition/save authorization.

**How to apply:** Follow `docs/public-archive-partial-outcome-assessment.md` for the approved design and acceptance criteria. Approval covers separate implementation, not deployment, historical publication or a distributed lease.

Measure live freshness with ordinary bounded GETs and natural deadline waits, not forced snapshot deletion or injected production failures. Label a verification response as snapshot-cold, not necessarily a cold server instance.

**Why:** The public response establishes verification work and retained freshness but does not reveal process startup or every recovered storage error. A partial retry deadline may expire before the hard evidence deadline; crossing both cannot isolate which gate caused the rebuild.

**How to apply:** Preserve the original response deadlines and generations, report partial reuse separately from hard evidence expiry, and distinguish observed fallback/error signals from provider-wide failure counts. Never infer Blob billing or storage-read timing from total HTTP latency.