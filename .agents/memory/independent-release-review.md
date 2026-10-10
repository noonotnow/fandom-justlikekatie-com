---
name: Independent release review
description: Separate creator publication consent from GitHub's required independent review after the latest push.
---

Explicit in-chat production authorization does not satisfy a repository rule requiring approval from someone other than the last pusher.

**Why:** GitHub refused to merge a fully green, explicitly authorized release because an independent post-push review was still required.

**How to apply:** Confirm current repository requirements when submitting a release. If this gate blocks merging, request an authorized independent reviewer and leave production unchanged until approval is present. Do not disable protection, force-push, or use another credential to impersonate independent review. Further pushes may require renewed review.