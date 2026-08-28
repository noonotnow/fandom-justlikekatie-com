---
name: Distinct data-URL derivatives
description: How to preserve identical rendered derivatives as separate collection records without breaking MEDIA upload.
---

Rendered derivatives may have identical data-URL bytes even when each save must remain a distinct version. Add a unique URL fragment to the data URL rather than a MIME parameter.

**Why:** Collection storage keys cards by image URL, so identical pixels otherwise overwrite an earlier version. MIME parameters make the URL unique but change the Blob type and fail strict MEDIA upload validation; fragments remain part of the storage key while Fetch ignores them for decoding and MIME type.

**How to apply:** When an image save represents a new immutable version, append a unique fragment before persistence. Verify that fetching the result preserves both the exact supported image MIME type and decoded bytes.