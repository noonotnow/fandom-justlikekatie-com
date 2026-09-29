---
name: Published MEDIA hosts
description: Why public edition image checks must recognize the published image delivery host separately from the MEDIA upload API host.
---

**Rule:** Do not infer the sole public image delivery origin from the MEDIA registration API endpoint. A verified public edition has served its nine immutable, digest-addressed thumbnail assets from the XHS image host.

**Why:** A live Archive check rejected an otherwise working edition when it allowed only the default MEDIA registration host; the approved public edition HTML pointed to a separate image delivery host and the image bytes returned successfully.

**How to apply:** For public image checks, use a narrow allowlist of observed MEDIA delivery origins and digest-addressed image paths. Never follow arbitrary source-search links from editorial records.