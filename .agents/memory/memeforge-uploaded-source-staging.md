---
name: MemeForge uploaded-source staging
description: Cross-boundary rule for carrying user-uploaded originals into durable CREATE packets.
---

Uploaded MemeForge originals must be registered as durable MEDIA before packet staging. Never embed their data URLs in an idea packet, and never derive the MEDIA association ID from a filename; use a stable server-safe UUID that also identifies the saved original.

**Why:** Data URLs can exceed the packet request limit, while ordinary filenames can contain dots, spaces, or Unicode rejected by MEDIA association validation. Either failure makes a valid local rework impossible to stage.

**How to apply:** When a rework source is a local upload, canonicalize it first, replace local saved-image references with the returned MEDIA URLs, attach the verified descriptor, and preserve the logical upload identity in provenance.