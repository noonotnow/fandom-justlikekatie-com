---
name: Sitemap record release checks
description: Why post-release checks should cover all publicly listed record URLs.
---

Validate every sitemap-listed actor and edition record after a production release, with bounded concurrency rather than selecting only one of each kind. Treat a verified empty publication inventory as healthy, but never interpret an unverified inventory as empty.

**Why:** A sampled first record can pass while later listed records are inaccessible, non-indexable, or have incorrect canonicals, leaving a monitoring blind spot as publication grows. A complete-but-empty catalog has no records to probe, while a fallback sitemap can look similarly empty despite a failed inventory read.

**How to apply:** For future public sitemap route families, check the entire listed set when claiming protection for that family; use concurrency limits and request timeouts rather than silently skipping entries. Require authoritative inventory health before accepting an empty set.