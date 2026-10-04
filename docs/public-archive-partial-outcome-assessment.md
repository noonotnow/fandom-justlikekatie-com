# Actor-directory partial-outcome reuse: approval assessment

Assessment date: **2026-10-04**.

## Approved design for separate implementation

Recommend a **fixed 60-second, demand-driven reuse window** for an exhausted
names-only directory whose omissions can all be classified as structurally valid
but non-indexable publication evidence. Keep the existing 15-minute maximum age
for positive evidence. Do not increase the partial window after repeated failures.

The creator **approved the recommended 60-second design on 2026-10-04** for a
separate implementation task, with no additional constraints. This is an approved
proposal, **not an implemented contract** or deployment authorization.
Only this assessment and current-behavior regression tests are added. No runtime
function, browser behavior, approval, manifest, MEDIA association, public page,
live storage, distributed lease, or deployment is changed. Historical editorial
review is separate and is not authorized by this proposal.

The explicit tradeoff: retrying a retained qualifying partial directory would no
longer immediately rescan unchanged dates. A repair could remain absent from the
actor selector for up to 60 seconds after the prior pass finishes, then until the
next reader request and bounded scan finish. The delay affects discovery only;
edition delivery and card acquisition retain their independent authority.

## Evidence and current behavior

Sources reviewed:

- `netlify/functions/lib/public-archive-directory.js` and its tests.
- `netlify/functions/lib/public-archive-inventory.js` and its tests.
- `src/hooks/usePublicArchiveInventory.ts`.
- `src/components/GridBuilder/GridBuilder.tsx` and
  `tests/browser/publicArchiveBuilderInventory.test.ts` for retry presentation.
- `netlify/functions/lib/publication-manifest.js` and
  `netlify/functions/lib/daily-card-acquisition.js` for the authority boundary.
- [Prior read-only live assessment](public-archive-cross-instance-refresh-assessment.md)
  and [existing contract](public-archive-actor-discovery.md).

The prior assessment found 31 eligible dates, 2 available manifests, 29
`not_public` results and 1 distinct public actor. The scan read approximately
344,365 bytes of reserialized JSON. It did not identify the individual rejection
reasons. These are dated inputs, not a fresh production observation. The prior
assessment also found production lacked the workspace directory optimization;
this assessment does not assert that production has since changed.

`validSnapshot` rejects an exhausted pass with any `unavailableCount`. The next
sequential request starts a new generation and repeats all manifest checks.
In-process promise sharing ends when the request settles, so it does not suppress
these sequential scans. CAS prevents older writes replacing newer progress; it
does not prevent scans or elect an owner.

The new local baseline tests reproduce **310 manifest reads for ten sequential
requests over 31 candidates**, plus 20 snapshot reads. The handler adds ten
catalogue reads: **340 total reads**, under the fixture's resolved-etag contract.
Each result remains partial with 29 omissions and no continuation cursor.
Another baseline test confirms a same-catalogue repair is discovered on the very
next retry. These tests lock down today's contract; they do not enable reuse.

The browser currently:

- Automatically follows descending continuation cursors for unfinished scans.
- Stops on a manifest storage failure, preserves already verified names and
  presents an explicit retry. It does not automatically poll or back off.
- Ends a finished partial pass with `directoryComplete=false` and an honest
  partial notice; the Builder offers a retry button for **all** incomplete
  directories, not just errors.
- Retries from the start, preserving usable choices while loading; generation
  changes clear the accumulated pass and replace, rather than union, its names.
- Displays evidence start/expiry. There is no separate scheduled recheck field.

## Classification: non-public evidence is not publication intent

Do **not** label all 29 results “intentionally unreleased.” The current
`not_public` combines invalid grid/MEDIA evidence, insufficient indexable copy,
missing public records, and public-link mismatches. `isGridManifest` validates
the embedded nine-card MEDIA associations and any supplied public record;
`isIndexablePublicationManifest` applies stricter editorial gates.
There is no explicit intended-withholding status in this read path.

Proposed internal classification, without weakening any existing predicate:

| Observed result | Proposed reuse treatment | Meaning |
| --- | --- | --- |
| `available` | Retain only actor id/name | Passed existing full public projection |
| `not_public` with valid `isGridManifest`, plus a recognized non-indexable editorial gate or an absent public record | Eligible for short partial reuse | Structurally valid publication evidence, no verified indexable edition; **not proof of intent** |
| `not_public` with invalid structure/MEDIA, malformed supplied public record, mismatched paths, or any unexplained failed gate | No exhausted-partial reuse | Integrity/uncertain rejection, not a safe intended omission |
| `missing`, date mismatch (`invalid`), `invalid_date`, unknown status | No exhausted-partial reuse | Uncertain/corrupt/missing candidate; preserve immediate retries |
| `unavailable`, thrown verifier error | No new partial-outcome retention or cooldown | Temporary storage/transport failure; preserve explicit immediate retry |

A future implementation would derive a directory-only reason from the **same
strong-read manifest already fetched**, after the unchanged public projection
rejects it. Exact-date wire outcomes stay unchanged. Do not do a second manifest
read to classify it, parse error strings, infer intent from age, or reinterpret
missing MEDIA as an editorial omission. If an explicit withholding record exists
in some other editorial system, it is not currently part of this authority and
must not be silently imported into it.

All omissions must qualify for the exhausted pass to be reused. A mixed pass with
one uncertain rejection retains today's immediate rescan. This conservative
choice sacrifices some savings but avoids a per-date retry queue or caching
broken records as intentional. The sample's 29 combined statuses alone cannot
establish how many qualify: **actual expected savings are not yet known**.

## Proposed bounded state and response contract

### Retention and validation

Keep one disposable snapshot key, aggregate reason counts and verified actor
id/name pairs only. No rejected actors, dates-to-reasons map, manifests, card
URLs, grids, private editorial text or approval metadata. Aggregate counts remain
names-only derivation metadata; storage growth remains O(distinct verified actors),
not O(candidate outcomes).

Use an explicit schema/kind version change at the existing key. Old snapshots
contain no reason split and cannot qualify for partial reuse. Existing cache
capability checks, strong reads, bounded etag resolution and conditional writes
remain. Losing conditional writes do not certify retention; a subsequent reader
uses the winning strong-read value, never the loser's locally proposed cooldown.

Proposed additional internal fields:

- `nonPublicCount` for only qualifying rejections.
- `retryableOmissionCount` for other counted rejections; keep `unavailableCount`
  as the compatibility **total omissions**, despite its ambiguous name.
- `finishedAt` and `retryAt` only for an exhausted qualifying partial pass.

Require nonnegative integer counts, consistent totals, bounded actor entries,
`scanned <= eligibleDates.length`, finite timestamps and:

`startedAt <= finishedAt <= now < retryAt <= startedAt + 15 minutes`

`retryAt = min(finishedAt + 60 seconds, startedAt + 15 minutes)`.

Never retain or serve a reuse window if the pass has already consumed its
evidence lifetime. Snapshot hits must not rewrite the object, move either time,
or extend expiry. Complete snapshots keep their original 15-minute evidence
expiry. A partial completed near that expiry gets **less** than 60 seconds.

### State transitions

1. Strong-read catalogue on every request; derive the exact eligible-date
   fingerprint, including Shanghai rollover. Any membership/order change
   invalidates the snapshot immediately on that request, regardless of retry time.
2. An unchanged warm complete snapshot behaves as today.
3. An unchanged exhausted qualifying partial snapshot before `retryAt` returns
   its verified names with zero manifest reads or writes.
4. At `now >= retryAt`, at hard evidence expiry, or on malformed/old state, start
   a fresh generation and the existing bounded full pass. Recheck **all** dates,
   not just omissions: repairs, revoked MEDIA, changed names and broken links
   must all eventually be detected.
5. Progressive snapshots continue scanning immediately. Never turn a continuation
   cursor into a waiting/polling cursor. New generations signal restart and reset
   the browser's cursor guard.
6. Temporary manifest failures keep `page.unavailable=true` and the existing
   failed-date cursor behavior. Do not persist partial progress from the failed
   request as a new negative outcome. Verifier rejections release promise sharing.
7. Snapshot read/write outages or unsupported/read-only stores use today's
   bounded direct scan fallback. Do not invent a retained cooldown, certify an
   unretained prefix, or block retries. Missing etags retain the existing resolver
   and fallback behavior.

No proactive worker or distributed lease is added. Concurrent instances may
still duplicate cold/expired scans; the proposal targets **sequential** repetition.
Existing bounded sharing must respect both `retryAt` and evidence expiry: joining
an older in-flight snapshot response across either deadline must revalidate.

### Public fields and reader behavior

A reused partial response retains:

- `page.partial=true`, `status="partial"`, `hasMore=false`, `nextCursor=null`;
  `scanned=0` for work in this request and the original omission total.
- `actorInventory.complete=false`, `freshness="partial"`, original generation,
  `verifiedAt`, evidence `expiresAt`, candidate counts and `source="snapshot"`.
- A validated optional `actorInventory.retryAt`, only when a qualifying partial
  response has a retained bounded window. It is **not** a successful release
  timestamp, storage-error retry deadline or pagination cursor.

Keep the partial notice and never announce a complete Archive/star count.
Proposed extra localized message: “The actor directory is partial. The next
verification can run at [time]. Edition access and saves are checked separately.”
Do not say the omitted actors themselves are known public actors or promise
that waiting will make the directory complete.

The hook should validate a finite future `retryAt`, bounded by `expiresAt` and
at most 60 seconds from receipt (allowing a shorter remaining window). Invalid
new metadata must not impose a wait or erase names. Keep freshness evidence
separate from “next verification” in the Builder.

The existing explicit retry button remains: during a known retained window,
disable repeat submissions and show the available retry time; a local timer
reenables the control but performs **no network polling**. On remount or another
reader's request, the server may return the same bounded partial response.
At/after the deadline, one explicit retry initiates verification. If no retained
window is provided or a temporary failure occurs, retry stays immediately
available. Preserve selected actor/verified choices while loading and keep
edition-page loading independent.

An already-open idle tab does not automatically refresh today and would not
under this proposal. Repair discovery is demand-driven, **not** a guarantee that
every open selector updates within 60 seconds. Catalogue changes invalidate on
the next server request; a local disabled retry control is not a push channel
and can delay that reader's next request by at most the remaining minute.

## Quantified savings and retry scenarios

Assumptions: unchanged 31-date catalogue, all 29 omissions qualify, pass completes
and retains its snapshot within the evidence lifetime, no storage outages,
resolved etags, no overlapping cross-instance rebuilds. Count directory reads
only, excluding edition browsing/saves. Figures are **scenarios**, not live
traffic, billed dollar savings or production latency measurements.

For R sequential requests in one reusable window:

- Current: `31R` manifests, `34R` total Blob reads, R snapshot-write attempts.
- Proposed: `31` manifests, `34 + 2(R - 1)` total reads, one write attempt.
  Each warm reader still makes one HTTP request and two Blob reads
  (catalogue + snapshot). No reader waits on a lease or polls.

| Requests within one window | Current manifest reads | Proposed manifest reads | Manifest reduction | Current total reads | Proposed total reads |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 31 | 31 | 0% | 34 | 34 |
| 10 | 310 | 31 | 90% | 340 | 52 |
| 100 | 3,100 | 31 | 99% | 3,400 | 232 |
| 1,000 | 31,000 | 31 | 99.9% | 34,000 | 2,032 |

Ten requests avoid about **2.96 MiB** of repeated reserialized manifest payload
using the prior sample (9 × 344,365 bytes). This is not measured wire bandwidth;
catalogue/snapshot payloads and headers are excluded. The prior 779-ms workspace
scan cannot be converted into a guaranteed browser or function latency reduction.

For a synthetic hour with 360 requests at ten-second intervals, zero-duration
scans and a 60-second window: 60 rebuilds + 300 warm reads cost **1,860 manifest
reads / 2,640 total reads / 60 writes**, versus **11,160 / 12,240 / 360** today:
83.3% fewer manifest reads and 78.4% fewer total reads. At one request per minute
or less, this aligned model saves **nothing**. Real scan duration and exact
arrival/deadline placement alter the number of reusable requests.

For larger catalogues let N be candidates, P=ceil(N/100), R reader attempts
and G full passes whose bounded partial windows expire within observation:
current cost is approximately `RN` manifest reads and `R(N+3P)` total reads;
proposed cost is `GN` and `G(N+3P)+2(R-G)` with no collisions/outages.
A rebuild still takes P paginated requests, <=100 manifests per request and
<=10 in flight. Retry starts may join progressive work rather than cost a full
pass, so these formulas assume separate exhausted attempts, not arbitrary traffic.

If any sample omission is unclassified/invalid/missing, the conservative
whole-pass eligibility rule yields **zero** exhausted-partial reuse savings.
That is intentional. A separately authorized read-only aggregate reason sample
could establish eligibility; it must not write approvals or publish editions.

Reader examples:

- Repeated clicks at seconds 10/20/30: local control waits until second 60;
  other readers still get one immediate partial response, no manifest scan.
- Repair at second 5 after completion: not discovered by a warm directory request
  at second 10; eligible for the next demand-driven scan at second 60.
- New eligible catalogue date at second 10: next server request invalidates
  immediately, regardless of the previous partial retry time.
- Temporary manifest outage: explicit error/retry immediately, no 60-second wait.
- Snapshot write outage: direct result can show verified names, but there is no
  retained partial window to suppress a later request.

## Independent authorization and implementation acceptance criteria

Never use the directory to grant exact-date access, authorize a card identity,
decide the Shanghai three-day free-save boundary, waive Collector checks or
publish a previously rejected record.
`readPublicManifestForDate` retains its strong-read public edition gate.
`readDailyAcquisitionManifest` separately strong-reads a valid immutable daily
board; acquisition deliberately need not require an indexable editorial page.
Caching a `not_public` directory outcome must not block an otherwise authorized
daily card save or grant an unauthorized one.

If approved, implementation must cover:

1. Cold partial, warm reuse, equality/just-before retry boundary, evidence expiry,
   late completion and invalid counts/times/old schema.
2. Same-date repair and revoked MEDIA/name/link changes after the bounded delay;
   additions/removals/Shanghai eligibility bypassing cooldown.
3. Safe non-indexable vs corrupt public record/MEDIA vs missing vs unavailable;
   mixed outcomes disabling reuse; no private fields in snapshot/response.
4. 100-candidate bound, ten-read concurrency, multi-page restart/cursor semantics,
   cache outage/read-only fallback, no retained prefix certification.
5. CAS losses, late writers, per-scope coalescing and joined readers crossing
   either deadline; local fixtures do not prove production atomicity.
6. Chromium/Firefox/WebKit: honest partial notice/count, localized retry time,
   no polling, retry reenabled at deadline, immediate outage retries,
   preserved selection and no stale-generation union.
7. Warm-directory then changed exact-date/save evidence: strong reads still reject
   invalid records and enforce card/access/date checks; valid non-indexable daily
   acquisition remains available under its own rules.

Implementation should update the existing contract documentation when the approved
behavior is implemented. Release and production observation require separate approval and the
existing independent release safeguards. The existing live-scan measurement work
remains separate; do not duplicate it or historical editorial-review tasks.

## Alternatives

- **Keep immediate retries:** zero repair delay change, but no sequential savings.
- **Reuse every combined `not_public` for 60 seconds:** simpler and more potential
  savings, but hides reason ambiguity; not recommended without classification.
- **Reuse partials for the full 15 minutes or growing exponential backoff:** more
  savings but longer discovery repair delays; not recommended.
- **Per-date negative cache/selective repair probes:** more state, complex actor
  removal/provenance and fairness; not justified for this 31-date assessment.
- **Distributed lease:** no sequential fix and introduces waiting/storage costs;
  explicitly outside scope.

## Verification

`node --test netlify/functions/lib/public-archive-directory.test.js netlify/functions/lib/public-archive-inventory.test.js`:
**36 passed, zero failed**, including the two new baseline tests. The scenario
arithmetic was independently recomputed with Node. Test imports warned about
missing magic-link development configuration; no sign-in behavior was tested or
changed.

Only current behavior is executable here; proposed timing, UI and savings require
implementation tests after approval. No new live queries or authenticated UI
claims are made.