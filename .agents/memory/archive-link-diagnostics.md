---
name: Archive link diagnostics
description: How operator diagnostics must inspect archive reader-link failures.
---

Operator diagnostics for rejected reader links must inspect the authoritative stored historical metadata. Do not diagnose a regenerated or already-sanitized public projection, because it can only produce valid canonical links or omit the pair and therefore cannot preserve the rejection reason.

**Why:** Reader delivery correctly fails closed, but reconstructing metadata for an operator check can erase whether the actor path or edition path was malformed.

**How to apply:** Correlate current manifests with stored historical payloads and include legacy records that have no manifest. Return only bounded diagnostic status codes; never return rejected raw paths to operator UI.