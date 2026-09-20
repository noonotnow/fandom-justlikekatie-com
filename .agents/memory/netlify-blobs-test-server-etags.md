---
name: Netlify Blobs test-server etags
description: Compatibility behavior for conditional writes tested against the installed Netlify Blobs server.
---

The installed Netlify Blobs test server may omit the `etag` response header from both `getWithMetadata` and `getMetadata`, while successful writes and exact-key listings still include the current etag.

**Why:** Conditional JSON update flows can pass against in-memory stores but fail against the SDK test server when they assume metadata reads always return an etag.

**How to apply:** Keep strong `getWithMetadata` reads authoritative for data. When an etag is absent and a conditional write is required, resolve the exact key from a listing and use that etag; tests should still verify the strong JSON read options.