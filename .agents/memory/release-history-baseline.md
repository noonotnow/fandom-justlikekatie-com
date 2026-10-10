---
name: Release-history baseline
description: Independent evidence needed before certifying a complete historical publication inventory.
---

Only certify a historical released-date baseline after comparing immutable publication evidence with the full private Archive, and require the derived public catalog to agree before certifying completeness. Keep the ledger monotonic and fail closed on a discrepancy; a shortened but syntactically valid catalog is not evidence that older releases never existed.

**Why:** Releases made before the separate released-date record existed cannot be recovered safely from a catalog that may already have lost dates.

**How to apply:** On recovery or migrations, inspect immutable publication records independently of catalog dates, cross-check Archive date and identity, then use conditional writes for the released-date ledger. If production cannot be accessed or the private operator route has not deployed, report verification as pending rather than claiming the live sitemap is complete.

Legacy Archive public-record paths are weaker than release evidence: an older reader-link repair could attach paths to entries without publication manifests. Do not treat those paths alone as a release, and do not delete the dated Archive entry. A missing manifest must still block the baseline when the date appears in the catalog, prior release history, or a release receipt.

**Why:** A saved public-record path once blocked the historical backfill even though its public page returned 404 and no immutable manifest existed; ignoring all missing manifests would instead allow a previously receipted release to disappear.

**How to apply:** Distinguish legacy Archive link claims from independent release records during verification, retaining strict checks for manifests, catalog entries, ledger dates, and receipts. Apply the same distinction during receipt reconciliation.