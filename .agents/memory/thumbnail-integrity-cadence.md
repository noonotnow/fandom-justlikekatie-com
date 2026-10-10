---
name: Thumbnail integrity cadence
description: Why full-body thumbnail integrity and release-time availability use separate checks.
---

**Rule:** Keep whole-body digest verification of published Archive thumbnails on a rotating, rate/size-limited cadence, not on each release. The release check should stay bounded to availability and image signatures.

**Why:** Historical Archive inventory grows over time. Fetching every full image body after every release would make releases increasingly expensive and fragile, while a bounded header check cannot detect body corruption.

**How to apply:** When changing publication or image validation, preserve the distinction between fast release checks and a periodic deep audit. Check thumbnails only in the latter; full-size image integrity is a separate scope.