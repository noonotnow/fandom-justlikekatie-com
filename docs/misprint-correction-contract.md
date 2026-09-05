# Misprint correction contract

Misprints are both collectible artifacts and structured correction evidence. Preserving a
Misprint in Collection never makes the failed result ordinary again, and correcting curator
evidence never deletes the collectible.

## Result-level behavior

The same reason taxonomy applies in Actor Preflight, saved Collection results, and grid-level
corrections:

| Reason | Scope | Future exclusion |
| --- | --- | --- |
| `wrong_actor` | Actor identity | Matching evidence for this actor |
| `wrong_vibe` | Actor and vibe | Matching evidence for this actor/vibe |
| `query_mismatch` | Result set | Evidence produced by this query for this actor/vibe |
| `misleading_metadata` | Metadata signal | Matching evidence for this actor |
| `composite_or_collage` | Global asset | Matching evidence everywhere |
| `bad_asset` | Global asset | Matching evidence everywhere |
| `duplicate` | Board | Diagnostic only |
| `ranking_bug` | Diagnostic | Diagnostic only |
| `other` | Local | Diagnostic only |

Candidate matching prefers an exact image digest, then canonical upstream image identity, then
candidate identity. Canonical image identity unwraps the application image proxy and ignores
known rotating authorization/cache parameters. Meaningful query parameters remain part of the
identity so distinct variants are not merged accidentally.

Perceptual hashing is not yet available. Crops, recompressions, and rehosts without a shared
digest or canonical URL therefore require separate corrections.

## Trust, review, and retraction

- Operator corrections are active immediately.
- Signed-in non-operator Collection feedback is stored as `pending_review` and is inert.
- Anonymous feedback is rejected.
- An operator can append an `approved` or `rejected` review decision.
- An operator can append a reasoned retraction to an active correction.
- Source receipts and prior decisions are never rewritten.

The effective status is derived from the source receipt and its decisions. A retracted correction
stops affecting future runs, but it does not restore an approval invalidated while the correction
was active. A fresh run and approval are required.

Receipt identities are deterministic for the action, source object, actor/vibe, reason, principal,
and strongest candidate identity. Concurrent retries therefore converge on one immutable receipt.
Different reasons remain independent evidence.

Trusted correction activation, approval, normal Daily Drop materialization, and backfill
publication share one short-lived compare-and-swap lock in the publication store. Daily Drop
eligibility is revalidated after acquiring that lock. A correction cannot become active between
final publication validation and commit. If publication wins first, the correction runs afterward
against the newly written immutable manifest and appends its correction notice before returning.
Strongly readable catalogs supplement eventually consistent Blob listings for both correction
receipts and every reserved publication date, including historical backfills.

## Frozen audit evidence

Historical audit runs remain byte-for-byte immutable. Later runs apply active corrections while
retaining corrected candidates in the frozen display evidence with:

- `dropReason: "curator_misprint"`
- the correction receipt ID
- the original query and source provenance

Corrected evidence is retained before the normal display cap is filled. A correction cannot vanish
from a rerun merely because 36 other candidates were displayable.

## Collection and Legendary independence

An ordinary Misprint stores the authoritative correction receipt and calibration status. Making
that collectible Legendary, removing its Legendary promotion, moving it between local collection
scopes, recovering its media, or deleting the collectible does not review, retract, or otherwise
change the server correction.

Collection intentionally has no “restore ordinary result” action. Retraction is an operator-only,
append-only curator decision, not a local presentation toggle.

## Approved and published boards

If an active future-excluding correction matches the current approved publication board:

1. The prior approval decision remains immutable.
2. A new derived eligibility decision marks the pairing `invalidated_by_misprint`.
3. Backfill publication fails closed.
4. A corrected audit run must be reviewed and approved before publication resumes.

If the candidate already appears in an immutable Daily Drop manifest:

1. The original manifest and board hash remain unchanged.
2. An append-only publication-correction receipt records the manifest, publication date, original
   board hash, correction receipt, reason, and affected card positions.
3. The receipt is marked `requires_explicit_supersession`.
4. The historical edition remains an auditable artifact.

Replacing a public edition requires a separately authored superseding edition linked to the
original. Automatic superseding-edition publication and public rendering of correction notices
are not implemented yet; the correction ledger is the durable prerequisite for that workflow.
