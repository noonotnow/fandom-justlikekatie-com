---
name: Live Blob audit contention
description: Intermittent duplicate alert decisions observed during concurrent production Blob health updates.
---

**Rule:** Do not treat one passing shared-storage concurrency check as proof that concurrent health transitions always elect a single alerter. Investigate duplicate decisions separately before promising exactly-once alerts.

**Why:** A protected manual run against production Netlify Blobs authenticated successfully but two concurrent workers both reported an alert decision when exactly one was expected. A second unchanged run passed. The discrepancy may be intermittent and was not explained by missing credentials.

**How to apply:** Use only isolated temporary keys for diagnostics. Preserve the canonical audit-health history, inspect conditional-write behavior without disclosing credentials, and prefer reproducible evidence over assuming either the first failure or later pass is definitive.