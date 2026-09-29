---
name: Netlify Blobs listing pagination
description: Netlify Blobs list return shapes differ depending on the paginate option.
---

Use the default non-paginated list when code expects a single object with a `blobs` array. Explicit `paginate: true` returns an async iterator of pages instead, even though an in-memory store may accept the option and return a single object.

**Why:** A sitemap completeness check treated the iterator as an empty or malformed listing and dropped all dynamic routes while tests with a plain-object fake still passed.

**How to apply:** Exercise storage-dependent public inventory checks against the actual Blobs test server, not only memory stores. If streaming pages, consume the iterator explicitly.