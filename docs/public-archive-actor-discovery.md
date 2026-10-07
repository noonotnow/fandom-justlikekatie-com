# Verified actor-directory cost and freshness

The date catalogue is a candidate list, not publication evidence. Every actor
enters the derived directory only through the existing exact-date manifest,
public-record and nine-card MEDIA-association checks. Nothing reads private pack
indexes, changes approvals, or serves grids/images from the directory snapshot.

## Read budget

Previously each reader discovered N editions through `ceil(N / 100)` requests,
reading all N manifests and one catalogue per request. At 10,000 editions that
is 100 requests and 10,100 Blob reads per reader (not counting edition browsing).

Now the shared names-only snapshot uses a single reusable Blob key:

- A warm complete directory, or a qualifying partial directory within its fixed
  reuse window, needs one catalogue read and one snapshot read.
  It returns all verified names in one request, with zero manifest reads.
- Cold or invalidated discovery verifies at most 100 manifests per request,
  with at most 10 manifest reads in flight. Normal rebuild cost is approximately
  N + 3 × ceil(N / 100) reads, shared across subsequent readers. The first
  completed directory is available without waiting for an edition-page scan.
- Snapshot mutation uses conditional writes. The existing bounded etag resolver
  can add up to four HEAD/list/body reconciliation attempts when storage omits
  etags. The warm complete path does not need etags or listing.
- The catalogue read and fingerprint calculation remain O(N) in bytes/CPU;
  the snapshot is O(distinct actors) and never retains grids or private fields.
- Overlapping cold readers can duplicate a bounded verification chunk, but a
  slower writer cannot overwrite newer stored progress. This is not a guarantee
  of exactly-once reads or a distributed refresh lock.

The 10,000-candidate synthetic test checks request/read counts, not live network
latency. Production latency and Blob billing are not inferred from that fixture.

## Invalidation and retry

The fingerprint uses all eligible catalogue dates in their scan order. Adding
or removing a date invalidates the snapshot; Shanghai rollover includes newly
eligible dates. Publication names from the catalogue are never used.

Reverification starts no later than 15 minutes after the oldest verification in
the snapshot. This catches missing-manifest repairs, changed public-record
links, and invalid MEDIA associations even when the catalogue dates do not
change. There is no stale-while-revalidate delivery from the HTTP cache:
directory responses use `no-store`. `verifiedAt` is the conservative start of
the pass, not a claim that every manifest was read at that exact instant.

Responses expose verification generation, source, freshness, expiry, candidate
progress, omitted-record count and completeness. Exhausted partial snapshots
may be reused for **60 seconds after the pass finishes**, capped by the original
15-minute evidence expiry, only if every omission is structurally valid but
non-indexable. Classification uses the same strong-read manifest after the
unchanged public projection rejects it: valid grid/MEDIA evidence, no malformed
or mismatched supplied public record, and either a missing public record or
failure of the existing editorial indexability predicate. This is not evidence
of editorial intent. Combined `not_public` alone is insufficient.

Missing, invalid, uncertain or mixed omissions retain immediate full rescans.
The versioned snapshot stores only verified id/name pairs and aggregate counts;
it never stores per-date rejection details or private records. Old snapshots
without that reason split cannot qualify. Cache hits never rewrite the snapshot
or extend either deadline. Lost conditional writes cannot advertise a locally
proposed retry deadline. Temporary manifest read failures are
never persisted as omissions. A snapshot outage falls back to bounded manifest
verification; an unretained prefix cannot certify a complete global directory.
Exact edition and save/report requests continue to strong-read their manifests.

A retained partial response remains incomplete with an honest partial notice,
zero new manifest scans, no continuation cursor, original generation/evidence
times, and optional `actorInventory.retryAt`. The browser validates this future
time against evidence expiry and a maximum 60-second remaining wait. Its explicit
retry is disabled until that deadline; a local timer only reenables the button,
without polling. English and Chinese messages distinguish next verification
from evidence expiry and say edition access and saves are checked separately.
Missing/invalid metadata or storage errors impose no wait and do not erase names.
Discovery repairs are demand-driven: an idle tab does not refresh automatically.

Changing evidence during a paginated pass starts a new generation. The browser
replaces that pass's names and resets cursor checks instead of merging stale
actors into the new verified inventory. Actor selection and its independently
verified edition pages remain usable during discovery and retries; late edition
responses still cannot replace a newly selected actor's images.

The 15-minute interval is deliberately a bounded discovery-cache delay, not a
release-approval or acquisition authorization grace period.
The same applies to the one-minute partial window. Valid non-indexable daily
boards remain independently saveable under the existing identity, Shanghai-age
and membership checks, while invalid edition/save evidence still fails closed.
Catalogue changes bypass reuse on the next request. Joined in-instance readers
must respect both original deadlines; there is no distributed lease.

Synthetic qualifying 31-date coverage verifies 31 manifest reads and 52 total
reads for ten sequential discoveries (including catalogue reads), versus the
unclassified immediate-retry baseline of 310 and 340. These are fixture savings,
not production billing or latency measurements. Deployment and production
observation remain separately authorized.