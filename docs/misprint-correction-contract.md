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

## Daily Drop fan participation

Whole-board Legendary and Misprint marks are personal export choices, not community
consensus, editorial approval, or training signals. The optional Legendary appreciation
reason travels as additive `personalReaction` metadata only when deliberately preserving
the finished grid. Automatic export heuristics remain separate. Neither a reaction nor
an export imports constituent cards. Legendary Misprint preservation in Collection is
a separate intentional act; retaining or deleting it cannot review or retract evidence.

The enlarged Daily Drop image offers a free, signed-in report without a Collection save
or Collector purchase. `report_daily_image` accepts only date, publicly delivered image
identity, taxonomy reason, optional actual identity (200 characters), and note (1000
characters). The server strong-reads the exact immutable publication manifest, including
complete MEDIA-backed boards without indexable Archive pages. Candidate URLs, private
audit ids, actor labels, and badges are never accepted as authority.

Reports are frozen pending receipts even when submitted by an operator through the fan
endpoint. Same-principal, same-image, same-reason retries converge on one receipt.
Atomic per-account Shanghai-day slots bound new submissions to 20 per day. Failed
attempts that already reserved a slot retain that reservation so retries remain safe.
No report sends email notifications; the existing sign-in link is only authentication.

`GET actor-audits?reports=own&date=...&imageId=...` projects only the authenticated
principal's reason-specific receipts and truthful pending/approved/rejected/retracted
statuses, with no reporter ids, private audit evidence, or operator notes. An approved
duplicate, ranking bug, or local report remains diagnostic, not identity training.

The private console uses `reports=queue`, with pending or active status, a keyset cursor,
and a maximum of 50 receipt keys scanned per page (default 20). Empty filtered pages
can still have a next cursor. Each receipt's two deterministic decision records are read
directly; source detail retains intended actor/vibe, exact MEDIA preview, upstream source,
query when retained, and frozen publication hash/position. Approve, reject, and reasoned
retraction reuse the existing append-only decision and publication-lock paths.

### Verification boundary

Local verification covers the real handler and in-memory conditional-write publication
fixtures, the full function/app suites, and browser flows with explicitly mocked
authentication/API responses. Browser checks include mobile keyboard forms, fresh-tab
magic-link recovery across MEDIA/canonical aliases, inert reactions, failed submissions,
approved retry acknowledgements, account-status clearing, operator pagination and
retraction, and Collection preservation/removal independence.

The normal workspace workflow serves Vite, not Netlify functions; it truthfully shows
the data-service-unavailable message when no Daily Drop backend is present. A screenshot
of that preview is not live reporting or signed-in operator evidence. No production
deployment, live submission, or real operator decision is authorized by this change.
After creator-approved release, verify the authenticated Netlify participation loop
separately before claiming live success. Reports themselves have no email notifications;
an explicitly requested authentication magic link is separate.

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
