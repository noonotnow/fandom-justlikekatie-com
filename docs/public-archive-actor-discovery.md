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

- A warm, complete directory needs one catalogue read and one snapshot read.
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
are immediately reverified on a retry. Temporary manifest read failures are
never persisted as omissions. A snapshot outage falls back to bounded manifest
verification; an unretained prefix cannot certify a complete global directory.
Exact edition and save/report requests continue to strong-read their manifests.

Changing evidence during a paginated pass starts a new generation. The browser
replaces that pass's names and resets cursor checks instead of merging stale
actors into the new verified inventory. Actor selection and its independently
verified edition pages remain usable during discovery and retries; late edition
responses still cannot replace a newly selected actor's images.

The 15-minute interval is deliberately a bounded discovery-cache delay, not a
release-approval or acquisition authorization grace period.