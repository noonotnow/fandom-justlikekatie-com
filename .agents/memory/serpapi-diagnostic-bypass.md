---
name: SerpAPI diagnostic bypass
description: Provider-specific cache behavior for bounded fresh-search comparisons.
---

SerpAPI result-cache bypasses must use the provider-supported `no_cache=true` request parameter. HTTP `Cache-Control` and fetch `no-store` settings alone can still return an existing SerpAPI result set.

**Why:** A normal-versus-bypass diagnostic applied no-cache headers successfully, but every bypassed request returned the same cached fingerprint with cache-hit telemetry. SerpAPI documents its parameter as the mechanism that forces a new search; forced searches count toward quota while cached searches do not.

**How to apply:** Add the provider parameter only for explicit, private refresh diagnostics. Keep ordinary searches cacheable, preserve quota controls, and report the provider-controlled bypass separately from generic HTTP cache headers.