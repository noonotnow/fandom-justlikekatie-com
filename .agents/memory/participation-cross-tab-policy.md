---
name: Participation cross-tab policy
description: Privacy and fail-closed measurement tradeoff for concurrent cohort operations.
---

Cohort measurement favors omission over duplicate counts when cross-tab exclusion cannot be guaranteed; stage events continue to count individual actions.

**Why:** The wire schema deliberately has no browser/account identity, so the collector cannot safely deduplicate raced cohort events. Best-effort analytics must not delay or prevent participation.

**How to apply:** Preserve the no-identifier boundary and the bounded, fail-closed locking policy. For a clean release observation window, reload older open clients too: a client that never requests the lock cannot cooperate with updated tabs.

Hold the cohort lock through the browser task boundary after a localStorage mutation, not merely until synchronous writes or their microtasks finish.

**Why:** Firefox can buffer writes in per-process localStorage snapshots and checkpoint them at stable state. Releasing a Web Lock in the writing task lets another tab acquire it while still seeing old enrollment or return flags. CI exposed duplicate enrollments and returns even with an origin-wide lock.

**How to apply:** Preserve the task-boundary checkpoint when modifying cohort locking. Model buffered storage in unit tests and exercise repeated real lock handoffs in Firefox; do not weaken exact counts or replace the checkpoint with a resolved Promise. Mozilla's implementation documents stable-state checkpointing in [LSSnapshot](https://github.com/mozilla-firefox/firefox/blob/main/dom/localstorage/LSSnapshot.cpp).