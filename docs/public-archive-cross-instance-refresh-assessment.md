# Actor-directory refresh duplication: production assessment

Assessment date: **2026-10-04**, approximately 10:05–10:07 UTC.

## Recommendation

**Do not add a distributed refresh lease now.** Cross-instance duplicate scans
are possible in the workspace implementation, but the production release does
not yet contain that implementation. Available historical logs cannot measure
its duplication rate. The live catalogue is small, and there is a separate
partial-directory issue that a lease would not fix.

No application code, browser pagination, manifests, MEDIA associations, approvals,
or live directory state was changed. No deployment or production storage writes
were performed. Release of the existing optimization still requires creator
approval and the project's independent release safeguards.

## Authorized operational evidence

The existing Netlify operator credential was used inside a process for read-only
API and Blob access; no credential values or raw manifests were printed or saved.
The existing GitHub credential was used to read source at the published revision.
Replit deployment metadata reported no Replit deployment; the external Netlify
site was independently verified rather than treating that as a production outage.

### Active release is older than the workspace optimization

- Netlify site: `earnest-gecko-17eb0c`, custom domain
  `https://fandom.justlikekatie.com/`.
- Active ready deployment: `6ac18f731a76d50008059ab9`, published
  **2026-10-03T23:28:46.900Z**, branch `main`, revision
  `be781ee21912fb0e628078c40acfc6fbef5a1a1b`.
- GitHub source at that exact revision returns **404** for
  `netlify/functions/lib/public-archive-directory.js`. Its inventory handler and
  function wrapper contain neither `readVerifiedActorDirectory` nor
  `refreshScope`. The inventory still returns `scope: "verified-page"` and scans
  pages independently.
- The deployed browser hook also lacks the independent directory-loading flow.
  The custom domain returned HTTP 200 with `/assets/index-Drjf6_qu.js`; that
  bundle lacks the `verified-directory` marker.
- A strong read of `star-of-day` key `derived/public-archive-actors-v1` returned
  no object. This corroborates the source comparison; absence alone would not
  prove which code was deployed.

Consequently, production behavior cannot yet validate the workspace's bounded
in-process sharing. This is a release-parity finding, not a recommendation to
deploy without approval.

### Historical function logs

Used the historical log endpoint documented in Netlify CLI source:
`https://analytics.services.netlify.com/v2/sites/{siteId}/function_logs/public-archive-inventory`,
with millisecond `from`/`to` parameters and pagination traversal.

Window: **2026-10-03T10:05:45.611Z to 2026-10-04T10:05:45.611Z**.
HTTP 200, one page, no continuation cursor, **five report entries**:

| UTC completion timestamp | Reported duration | Reported memory usage |
| --- | ---: | ---: |
| 2026-10-03T16:57:37.205Z | 643 ms | 129 MB |
| 2026-10-03T16:57:49.429Z | 290 ms | 143 MB |
| 2026-10-03T18:46:15.713Z | 617 ms | 125 MB |
| 2026-10-03T18:51:21.311Z | 291 ms | 142 MB |
| 2026-10-03T19:10:25.284Z | 598 ms | 133 MB |

Mean reported duration: **487.8 ms**; total: **2,439 ms**. These are function
durations, not Blob-only latency or a billed-cost statement.

A second query restricted to the active deployment returned HTTP 200,
**zero entries**, no continuation cursor, checked at
**2026-10-04T10:06:16.812Z**. All five earlier reports precede its publication.

Returned schema: `type`, `ts`, `level`, `request_id`, `netlify_request_id`,
`message`. The messages contain duration/memory only. They contain no request
query, server-instance identifier, directory generation, scanned count, snapshot
outcome, or conditional-write outcome. Unique request IDs do not identify unique
instances. No starts were returned. Completion timestamps alone cannot establish
overlap, read amplification, or which calls were actor discovery versus exact
editions or ordinary pages.

Thus **the production cross-instance duplication rate is unknown**, not zero.
Five reports in this window are not a forecast of typical traffic, and a complete
pagination result does not certify that provider log retention/delivery captured
every request. Do not use these logs as a causal measurement of the new code.

### Live candidate and read-cost sample

Strong-read the actual catalogue key,
`vibeAtlas:grid-manifest-catalog:v1:dates`, rather than relying on a listing.
It contains **31 candidate dates**, 2026-09-03 through 2026-10-04, all eligible at
the assessment's Shanghai date.

One read-only verification pass used the workspace's
`readPublicManifestForDate` against those dates, capped at ten reads in flight.
It completed at **2026-10-04T10:06:40.734Z**:

- **31 manifest Blob reads**, zero writes, zero image HTTP requests.
- **2 available**, **29 not_public**, yielding **1 distinct public actor** under
  the workspace predicate. `not_public` is a combined gate result; this sample
  does not identify the reason or imply that those records should be approved.
- **344,365 bytes** (about 336 KiB) of reserialized manifest JSON.
  This is a payload-size estimate, not measured wire transfer or billed bandwidth.
- Approximately **779 ms** for the scan from this workspace to production storage;
  median individual read **111 ms**, p95 **245 ms**. These are diagnostic client
  timings, not Netlify-instance or reader latency.

`readPublicManifestForDate` reads one manifest object. `publicArchiveGrid`,
`isGridManifest`, and `isValidMediaReference` validate embedded public-record and
nine-card MEDIA associations in memory. This path does **not** perform nine
separate MEDIA-store reads, fetch image bodies, or prove present image-host
availability. Duplicate scans duplicate manifest reads and validation CPU, not
nine extra image transfers per edition.

## Cost model and its limits

For N eligible dates, let P = ceil(N / 100), and K be independent server instances
starting the same refresh chunk before retained progress is visible.

- A successful single rebuild costs approximately **N + 3P Blob reads**:
  one catalogue and two snapshot reads per cold request, plus N manifests.
  It attempts P existing snapshot writes. Missing etags can add bounded
  HEAD/list/body resolution work.
- A warm complete request costs **two Blob reads**, no manifest reads or writes.
- Identical overlapping requests in one process share scan work, but each handler
  still reads the catalogue before joining. Different cursors are not identical.
- Independent instances share retained progress, not the in-memory promise.
  At a colliding chunk of B <= 100 dates, duplicate manifest reads are approximately
  **(K - 1) × B**. Conditional snapshot writes protect retained progress under the
  intended CAS contract; they do not elect a scanner or recover already-spent reads.

For this live 31-date sample, a hypothetical complete cold rebuild is roughly
**34 reads and one snapshot-write attempt**. Two colliding instances could add
**31 manifest reads / about 336 KiB**; five could add **124 / about 1.31 MiB**.
These are scenarios using measured candidate/payload size, **not observed
production collisions**.

Even assigning all five legacy reports to worst-case full catalogue scans gives
only a loose bound of **0–155 manifest reads**, up to five catalogue reads, within
that logged sample. Exact-date calls, early page completion, invalid requests and
failures change the cost. This is not an estimate of duplicate reads.

### Persistent partial results matter more than a 15-minute TTL assumption

With the sampled manifests, the workspace directory would finish its 31-date pass
with 29 omissions and remain partial. `validSnapshot` deliberately rejects an
exhausted snapshot with `unavailableCount > 0`; the next request re-verifies it
immediately. Therefore **do not project one 31-read rebuild per 15 minutes** from
this sample: sequential discovery can repeatedly scan even without cross-instance
overlap. This follows from the workspace code and read-only sample, not an
observed execution of that code in production.

A lease could suppress overlapping work but would not solve repeated sequential
partial passes. Investigating bounded reuse of explicit partial outcomes is
separate from approving historical records; any future optimization must preserve
partial notices, repair detection, expiry, and authoritative edition/save reads.

## What a lease would add

No lease design was implemented. A plausible chunk-scoped design would add:

- A strong lease read and conditional acquisition attempt per contender; owner
  renewal and conditional release/expiry handling as necessary.
- Typically one acquisition mutation and one release mutation per owned chunk
  (or expiry instead of release), **in addition to** the existing snapshot write.
  Failed acquisitions are requests too; dollar treatment must be checked against
  this site's actual plan/invoice.
- Waiting readers polling strongly for progress and/or retrying HTTP requests,
  which add reads, function invocations and reader latency. Expired ownership,
  crashed owners, catalogue changes and fencing of late owners need handling.
- A browser protocol change. The current hook follows a strictly descending date
  cursor; an unchanged cursor is invalid pagination, and storage unavailability
  ends discovery with an explicit retry. There is no lease-wait state, backoff,
  `Retry-After` handling, or automatic polling. Encoding lease contention as an
  ordinary partial page would be incorrect.

For a model with one extra lease read per K contender, W wait/poll reads, and L
lease-write attempts, a read-only break-even comparison is roughly:
**(K - 1)B > K + W**, before weighting L writes, failed attempts, extra function
compute, wait latency, engineering risk and cleanup. There is no demonstrated
K > 1 here and no authorized invoice-specific per-operation dollar rate in this
assessment. Netlify documents Blobs as optimized for frequent reads and infrequent
writes; equating one read and one write financially would be unjustified.

## Decision and next measurement

Keep the existing in-process sharing and browser contract. Do not add a lease or
run a live conditional-write race just to justify one. No local simultaneous
Blob-server write test was used as evidence of production atomicity.

After a separately approved release containing the current directory:

1. Verify deployed function source and browser parity before starting observation.
2. Prefer passive, bounded, privacy-safe server diagnostics: ephemeral process
   identifier, hashed refresh identity, generation, chunk start/end, scan count,
   source, complete/partial outcome, durations and CAS modified result. No names,
   user IDs, full URLs, manifest bodies, credentials or image URLs are needed.
3. Observe at least seven representative days including cold/expiry/rollover
   windows. Separate exact-date/page traffic, directory reads, deliberate tests,
   overlapping duplicate chunks and sequential partial rescans.
4. Estimate duplicate reads from overlapping identical chunks on **different
   process identifiers**, rather than total invocations. Compare their daily
   read/byte/compute cost with candidate lease attempts/polling and reader p95.
   Reconsider a lease only when sustained, material cross-instance duplication
   remains after cheaper causes are addressed.
5. If that evidence warrants lease prototyping, verify conditional-write behavior
   with creator-authorized, isolated disposable diagnostic keys and guaranteed
   cleanup—not the directory, manifests, MEDIA, or health-history keys. Neither
   one passing live race nor a deterministic local fixture proves universal
   atomicity.

## Verification and references

- `node --test netlify/functions/lib/public-archive-directory.test.js netlify/functions/lib/public-archive-inventory.test.js`:
  **34 passed, zero failed**. The local SDK test and deterministic CAS fixtures
  establish local regression behavior only, not production concurrency.
- Production homepage screenshot loaded normally. It verifies public rendering,
  not the unreleased directory UI or authenticated behavior.
- Relevant implementation: `netlify/functions/lib/public-archive-directory.js`,
  `netlify/functions/lib/public-archive-directory.test.js`,
  `netlify/functions/lib/public-archive-inventory.js`,
  `netlify/functions/public-archive-inventory.js`,
  `netlify/functions/lib/blob-store.js`, `src/hooks/usePublicArchiveInventory.ts`.
- [Existing directory contract](public-archive-actor-discovery.md).
- [Netlify function logs](https://docs.netlify.com/build/functions/logs/).
- [Netlify CLI historical-log API source](https://github.com/netlify/cli/blob/main/src/commands/logs/log-api.ts).
- [Netlify function metrics and limitations](https://docs.netlify.com/manage/monitoring/function-metrics).
- [Netlify Blobs contract](https://docs.netlify.com/build/data-and-storage/netlify-blobs/).