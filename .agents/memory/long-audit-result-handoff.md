---
name: Long audit result handoff
description: How the operator UI should transition from a long-running audit mutation into a blinded editorial review.
---

After a long-running actor audit mutation completes, re-read the authoritative stored run and validate the pending board payload before showing a success message. Move the loaded review into view, and distinguish an unavailable comparison from a review that is ready for a blind choice. If a private image judgment returns a current-run conflict, treat it as stale audit context rather than a failed Blob write: reload the current head without replaying the judgment, then let the curator choose on the new run. A curator confirmed that refreshing the live preflight after this conflict restored saving.

**Why:** A successful mutation can persist the audit while leaving the browser without a renderable pending-board payload. Announcing completion in that state strands the operator with no visible decision controls and makes a storage or transport handoff failure look like a curation failure. A stale-run conflict happens before the immutable judgment receipt is written; trying to repair its index or blindly retry the old run addresses the wrong failure.

**How to apply:** Any operator workflow that persists a long-running experiment or audit should treat the follow-up detail read as authoritative, even if a mutation response named a different run. Only announce a ready review after its required artifacts are present; otherwise show a recoverable saved-result message or the explicit unavailable state. On a current-run conflict, inspect the redacted response status before diagnosing storage or index health; keep the curator's new choice explicit.