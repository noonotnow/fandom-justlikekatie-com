---
name: Browser fake-clock boundaries
description: Cross-engine fake clock setup must not depend on the instant of a previous browser roundtrip.
---

Use fixed time for tests that only need deterministic date reads. Tests that
advance timers need a future pause point and must measure deadline offsets
from that paused time, not the earlier clock-install instant.

**Why:** The browser can advance between clock installation and pausing;
pausing at the installation instant can already be in the past. A future pause
also consumes part of the interval before a deadline, making an otherwise
apparently pre-deadline assertion engine-dependent.

**How to apply:** Distinguish fixed-date fixtures from timer-advancement fixtures,
keep assertions clearly before or after the deadline rather than exactly on
it, and preserve the user-visible retry behavior when fixing fixture timing.
