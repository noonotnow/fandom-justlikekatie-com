---
name: Long audit result handoff
description: How the operator UI should transition from a long-running audit mutation into a blinded editorial review.
---

After a long-running actor audit mutation completes, re-read the authoritative stored run and validate the pending board payload before showing a success message. Move the loaded review into view, and distinguish an unavailable comparison from a review that is ready for a blind choice.

**Why:** A successful mutation can persist the audit while leaving the browser without a renderable pending-board payload. Announcing completion in that state strands the operator with no visible decision controls and makes a storage or transport handoff failure look like a curation failure.

**How to apply:** Any operator workflow that persists a long-running experiment or audit should treat the follow-up detail read as authoritative. Only announce a ready review after its required artifacts are present; otherwise show a recoverable saved-result message or the explicit unavailable state.