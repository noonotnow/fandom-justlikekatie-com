---
name: Netlify Blobs test-server etags
description: Compatibility behavior for conditional writes tested against the installed Netlify Blobs server.
---

The installed Netlify Blobs test server may omit the `etag` response header from both `getWithMetadata` and `getMetadata`, while successful writes and exact-key listings still include the current etag. For compare-and-swap mutations, an etag recovered separately must be captured before the body read. Its filesystem-backed conditional writes are not atomic when multiple requests perform the precondition check simultaneously.

The SDK exposes `list({ paginate: true })` as an async iterator against the test server, but the test server returns its entire listing in one page without a cursor. A test can verify the real iterator and storage reads/deletes there, but cannot demonstrate behavior across multiple server pages.

**Why:** Conditional JSON update flows can pass against in-memory stores but fail against the SDK test server when they assume metadata reads always return an etag. Resolving the etag after the body read can pair stale data with a newer version and permit a replaying write. Simultaneous `onlyIfNew` or `onlyIfMatch` requests can all pass the local server's filesystem check before any rename completes, producing lost updates that do not represent the production Blob service. Pagination tests could otherwise mistake an iterator exercised on one page for a multi-page contract.

**How to apply:** For conditional mutations, resolve the current etag first (HEAD, then an exact-key listing fallback), perform the strong body read second, and write with the earlier etag. Any intervening mutation then makes the write fail. Exercise this ordering with an orchestrated stale-read test: pause one reader, let a competitor commit, then release the stale reader and verify its retry. Do not use fully simultaneous test-server writes as evidence of production CAS behavior. Use a controlled multi-page listing fixture when a test must prove traversal beyond page one.