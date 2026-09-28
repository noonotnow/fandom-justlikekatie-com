---
name: Retired source labels
description: Authority of explicit Daily Drop provenance retirement across device races
---

An explicit provenance removal is an authoritative state change, not the same as a legacy item that never had provenance. A device saving an older copy should still be able to save its other edits, but must not silently restore the retired label. Relabeling should require a client that has observed the retirement.

**Why:** Last-writer-wins replacement during a conditional-write retry can undo a deliberate label retirement even while successfully saving unrelated edits.

**How to apply:** For future Collection merge and download changes, distinguish explicit removal from absence and use the client's observed revision to decide whether a new label is intentional or stale.

Malformed historical cloud provenance is also absence of a valid update, not a removal. Only explicit `null` can retire a saved-grid label; a valid label correction can replace it.

**Why:** Cloud records from before write validation may contain impossible dates or malformed source kinds. Treating these as authoritative would erase or replace a device's correct label.

**How to apply:** At download and merge boundaries, validate provenance before overlaying cloud fields; preserve the local label for malformed or missing values.