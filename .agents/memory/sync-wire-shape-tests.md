---
name: Sync wire-shape tests
description: How to avoid mistaken assertions in end-to-end collection sync fixtures.
---

When testing collection sync, inspect the serialization boundary before asserting on outbound fields; the operation wrapper, embedded item, and returned server item do not necessarily share the same fields.

**Why:** Assumptions that grid-specific fields lived on the operation wrapper or that a response-only identifier was present in the outbound item caused otherwise valid regression checks to fail.

**How to apply:** For new sync-path tests, derive the request expectations from the producer and model server-only fields separately in the response fixture.