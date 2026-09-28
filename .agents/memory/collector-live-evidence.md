---
name: Collector live evidence boundary
description: Distinguishes deployed-renderer testing from authenticated production grid verification.
---

Testing the deployed frontend with intercepted membership and grid responses proves only the frontend behavior under those inputs, not the actual production saved-run response. However, a matching authenticated card count plus a controlled reproduction of the deployed bundle can identify a rendering mechanism without collecting private URLs.

**Why:** The Collector grid endpoint requires a session; an anonymous browser sees the sign-in gate. In one incident, the user's response contained nine images but the DOM had eleven cards. Repeated source links produced duplicate sibling keys; switching saved runs against the deployed bundle reproduced progressively increasing DOM counts.

**How to apply:** Separate live-bundle renderer evidence from authenticated network evidence. Never use a source link as a unique image-card key: one page can supply several distinct images from the same source. Pair a real user's count-only observation with a controlled reproduction before attributing a screenshot to the renderer.