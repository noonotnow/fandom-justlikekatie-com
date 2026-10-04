# Public Archive scan diagnostics — review preparation

## Approval boundary

The creator approved preparing these diagnostics locally on 2026-10-04.
The creator subsequently approved adding them to PR 181 and refreshing its Netlify
review preview. Production deployment remains **unapproved**. No live scan, CAS
race, snapshot repair, manifest change or production release was performed for
this implementation. Preview approval does not authorize directory-state mutations.

Diagnostics write only bounded JSON console records, never Blob objects.
The Netlify wrapper enables them when this code is eventually deployed; library
handlers remain silent unless supplied the diagnostic factory.

## Records

The schema version is 1. `archive_inventory_request` summarizes each function
request, and `archive_scan_chunk` describes one owned directory operation,
including zero-manifest snapshot hits. Both carry an ephemeral random process
identifier and a random per-request identifier, not provider request IDs or reader
identifiers. Work IDs let waiting requests reference an owner's one chunk record.

Request summaries contain:

- Fixed route category: `directory`, `page`, `edition`, or `invalid`.
- `filtered`: a boolean, not the actor filter value.
- `traffic`: `marked_test` or `unmarked`.
- Actual manifest-read attempts made by this request. An in-process joiner
  counts zero for work performed by its owner.
- Start/end epoch milliseconds, monotonic elapsed milliseconds, HTTP status,
  fixed request outcome and monotonic coalesced-wait time.
- At most four owner/joiner work references; an explicit flag reports truncation.

Chunk records contain:

- SHA-256 candidate-list fingerprint and hashed generation. Generation is hashed
  even when it came from a stored snapshot, so untrusted stored strings are not
  reflected in logs. Oversized generation values yield a null identity.
- Candidate count; attempted range identity; start, attempted-end and retained
  progress offsets. Ranges use half-open catalogue offsets, not raw dates.
- Snapshot initial/latest outcome: missing, changed, expired, invalid,
  exhausted-partial, complete, progressive, or unavailable.
- Snapshot/verification source, final verified/refreshing/partial/error outcome,
  cache availability, omitted count, verified progress, continuation, storage
  failure and restart flags.
- Actual launched manifest-read attempts and scan start/end/elapsed time.
  If a read throws while sibling reads may still be pending, `scanEndKnown` is
  false. The logged end then means observation stopped, not all reads completed.
- CAS outcome: `not_attempted`, `modified`, `not_modified`, `unknown`, or `error`,
  plus monotonic CAS latency. An SDK return without a boolean `modified` value is
  unknown, never assumed to be a winning write.
- Whole owned-operation start/end/elapsed time.

The records omit actor names/IDs, members, sessions, cookies, authorization headers,
IP addresses, full URLs/query strings, raw dates, image/manifest contents or URLs,
credentials, etags and raw errors. They add no fields to public responses or stored
directory snapshots. Logging errors do not prevent inventory loading.

## Bounds and coverage

The production factory caps console records at 600 per process per minute. The
next emitted record reports `droppedRecordsSinceLastEmit`; no extra timer, polling,
network call or storage mutation is added. Ordinary requests emit one summary,
and directory owners additionally emit one chunk record. Waiters emit no duplicate
chunk. Existing scan limits still bound actual work.

Provider retention/delivery and process death can lose records independently of
this cap. If the process dies or receives no later request, pending drop counts
may never be reported. Do not certify complete coverage from a zero drop counter.
Choose a permitted retention window long enough for the seven-day observation and
export records before expiry; no provider retention setting was changed here.

## Tests and real reader traffic

Mark authorized operator/CI probes with the fixed request header:

    x-vibe-atlas-archive-test: 1

The raw header value is never logged. It is a self-declared label, not authentication:
`unmarked` does not mean human or organic. Keep an operator test-window ledger and
exclude uncertain test windows rather than manufacturing a clean traffic count.
If a marked test owns a chunk joined by an unmarked request, or vice versa,
use the work-reference links to classify the work as mixed/test-influenced.
Do not allocate all mixed work to ordinary reader demand.

## Analysis rules

Count manifest work once from owner chunk records. Request summaries provide
route and wait-latency denominators, not a second copy of the owner's scan count.
Compare identical candidate fingerprints and actual attempted ranges on different
processes, with overlapping **scan** intervals. Cold contenders can create
different generations for identical work; generation equality is not required.
Only chunks with positive read counts are candidate duplicate scans.

For partially overlapping ranges, count the intersection once per extra
contender; do not multiply all pairwise intersections in a three-way collision.
Unknown scan ends, missing owner records, truncated references, provider gaps
and suppressed logs must remain explicit uncertainty.

Sequential exhausted-partial rescans are a separate cost category, not
cross-instance overlap. A lease does not solve them. These diagnostics do not
implement a lease, change freshness policy or authorize older editions.

Request elapsed time is server latency, and coalesced wait is in-process waiting.
Neither is browser time-to-directory or a future distributed-lease wait time.
Compare measured duplicate reads/compute with acquisition/renewal/release attempts,
polling, extra invocations and reader latency before making a lease recommendation.
No seven-day result or invoice-specific cost is available yet.