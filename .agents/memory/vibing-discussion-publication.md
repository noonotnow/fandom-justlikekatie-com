---
name: Vibing Now discussion publication
description: Editorial and storage boundary for low-traffic episode-bounded reader discussion.
---

For a small moderated discussion, keep the pending queue and approval state in a single private, conditionally updated archive. Public reads must explicitly project only approved text, never return the archive. A future article or episode needs its own editorial activation and immutable safe-through boundary; do not repurpose an earlier thread.

**Why:** Splitting an approved public copy from a private queue creates partial-failure windows where hiding a response could fail to retract it. Explicit episode activation prevents later material from silently widening an earlier conversation.

**How to apply:** When extending Vibing Now discussion, preserve conditional writes and fail-closed public reads. Review the new article and boundary before adding an activated identifier. Keep moderation actions and report identities private.

Archive retention should be a deliberate operator action after the pilot review, not an automatic side effect of submitting or reading. Never age out visible approved replies or their unresolved reports just to make room under the archive cap; unresolved saturation requires a separate storage decision.

**Why:** Automatic pruning can erase unreviewed reader submissions before editorial review, while evicting approved replies would silently change the public conversation. Cleanup must re-evaluate eligibility under the archive's conditional-write retry.

**How to apply:** Keep retention controls private, preview only aggregate counts, and make eligibility depend on the current status and moderation age. Treat missing or malformed timestamps as ineligible rather than guessing.