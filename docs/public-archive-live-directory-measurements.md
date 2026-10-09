# Live Archive actor-directory measurements

Measurement date: **2026-10-08 UTC**. Target:
`https://fandom.justlikekatie.com/.netlify/functions/public-archive-inventory?directory=actors`.

## Release and safety

Netlify's site API identified the custom domain's active ready `main` deployment
as `6ac7a29f5b9f420008f16b83`, published **2026-10-08T14:04:13.754Z**, revision
`ba6fd8d8e03eaa9007aae7d207facfaff29e8559`. This is the already published release,
not a release performed by this measurement.

GitHub reads at that exact deployed revision confirmed the names-only v2 snapshot,
partial-reuse implementation, `verified-directory` response and `no-store` handler.
The live browser served `/assets/index-EsL5Zd-4.js`, containing the corresponding
directory and retry metadata. Replit reported no Replit-hosted deployment; this
does not describe the external Netlify site's availability.

Only ordinary public GETs and read-only operator/source/storage checks were used.
No approval, catalogue, manifest, MEDIA association, membership or private field
was changed or published. Public GETs naturally write the existing disposable
directory snapshot during verification; no operator storage writes, invalidation,
forced expiry, failure injection or deployment was performed.

The reproducible sampler is `scripts/measure-live-archive-directory.js`. It
allows at most 12 sequential directory requests, at most two continuation
requests per pass, a 30-second request timeout and a 20-minute measurement window.
It sleeps through deadlines without polling. Its saved diagnostics allowlist
excludes actor identities/names, image references and arbitrary response fields.

## Measurement method

These are elapsed HTTP timings from the Replit workspace to the real production
custom domain, through complete JSON receipt. They are **not** representative
regional browser percentiles, function-only duration, individual Blob latency,
billed storage operations, or a server-instance cold-start measurement.
`source: verification` identifies a cold/invalidated **directory snapshot**, not
necessarily a new Netlify process. Warm requests include ordinary connection
reuse. No cache-busting query or artificial candidate list was used.

The initial parity-check GET completed at **14:30:13.260Z**:
HTTP 200, **1,391 ms**, `source: verification`, **34 candidates scanned**,
**eight actors**, no continuation. Generation:
`0a66af86-b15f-427c-82d8-909a15673825`. Its evidence interval began at
14:30:12.610Z and ended at 14:45:12.610Z, with partial retry at 14:31:13.161Z.
The pass finished at 14:30:13.161Z: **551 ms** after its conservative evidence
start. This initial timing is additional to the sampler's JSON evidence.

Sampler evidence is in `public-archive-live-directory-measurements.json`.
The sampler's baseline joined that retained generation rather than pretending
its first connection was a snapshot-cold read.

## Results

Observation window: **14:30:12–14:46:17 UTC**. Eight measured directory
requests total: the initial parity GET plus seven sampler GETs. No continuation
was required; each warm discovery and each rebuild finished in **one request**.
There were five snapshot hits and three verification passes.

| Request (UTC start) | Snapshot outcome | HTTP total | New candidates scanned | Correlated function duration |
| --- | --- | ---: | ---: | ---: |
| Initial parity check (~14:30:12) | verification | 1,391 ms | 34 | 1,023 ms |
| Baseline (14:30:49.585) | snapshot | 655 ms | 0 | 243 ms |
| Warm 1 (14:30:50.242) | snapshot | 196 ms | 0 | 71 ms |
| Warm 2 (14:30:50.439) | snapshot | 169 ms | 0 | 61 ms |
| After partial retry (14:31:14.169) | verification | 642 ms | 34 | 310 ms |
| Warm after retry (14:31:14.812) | snapshot | 173 ms | 0 | 68 ms |
| After hard expiry (14:46:15.464) | verification | 1,622 ms | 34 | unavailable in queried logs |
| Warm after hard expiry (14:46:17.212) | snapshot | 190 ms | 0 | unavailable in queried logs |

Warm snapshot HTTP median: **190 ms**; range **169–655 ms**, mean **276.6 ms**
(five observations). The baseline used the sampler's first connection but
an already retained snapshot; its 655 ms remains in the summary.
Snapshot-cold/reverification HTTP range: **642–1,622 ms**, median **1,391 ms**
(three observations). This sample is too small for useful p95 or traffic claims.
Total exposed verification work: **102 candidate verifications**, not 102
independently instrumented/billed provider reads. No manifest work was reported
by any of the five snapshot hits.

Function durations above were matched by the public `x-nf-request-id` to report
entries from Netlify's read-only function-log API, queried at approximately
14:46:50 UTC for 14:29:00 through query time. It returned HTTP 200 and 18 entries,
including six matching duration reports. The final two requests had no reports
in that response; they are **unknown**, not zero-duration or failed calls.
Function duration is separate from client HTTP latency and from the conservative
snapshot evidence span; it is not pure Blob time.

### Retry, hard expiry and refresh duration

The warm reads retained their generation, `verifiedAt`, `expiresAt` and `retryAt`.
No hit extended either deadline.

1. Initial generation finished **551 ms** after its conservative evidence start.
2. The partial retry deadline was **14:31:13.161Z**. The next verification request
   started **1.008 seconds after** it, returned a new generation, and finished its
   stored pass **254 ms** after its new evidence start. Its fresh evidence expiry
   was **14:46:14.463Z**, and partial retry was **14:32:14.717Z**.
3. No measurement GETs were sent during the following 15-minute wait. The hard
   expiry request started at **14:46:15.464Z**, **1.001 seconds after** the previous
   hard evidence deadline. It returned a new generation
   `3b61bee4-9090-4a75-9848-c0bc3abfbfb5`, verified all 34 candidates, and finished
   at **14:46:16.983Z**, **599 ms** after its new `verifiedAt`
   (**14:46:16.384Z**). Its new hard expiry was **15:01:16.384Z**.
   Complete JSON arrived at **14:46:17.086Z**, only **702 ms** into that new
   900,000 ms freshness interval. The next snapshot hit retained these times.

**A full candidate refresh demonstrably finishes within its freshness interval.**
The largest observed stored evidence span was **599 ms**, far below both the
15-minute hard lifetime and the 60-second partial reuse interval. Durations derive
from the retained `retryAt − 60 seconds − verifiedAt` and were corroborated by
strong snapshot reads; they are not individually timed storage operations.

Because the real directory is partial, the minute retry deadline was also expired
at the hard-expiry request. This proves a fresh retained generation after the old
hard deadline, but does **not isolate hard-TTL invalidation from partial-window
invalidation**. No forced mutation or approval change was used to manufacture a
complete directory for that distinction. The refresh exhausted candidates while
remaining honestly partial; it did not make the omitted edition public.

## Partial status and storage evidence

Every observed pass returned eight actors and one omitted candidate, with an
honest partial directory, `complete: false`, no continuation, and `no-store`.
Scanning all candidates is **not** the same as making all editions public.

A separate strong, read-only snapshot check at **14:31:37.950Z** took **314 ms**
from the workspace. It confirmed the retained second generation,
`c5f1f027-a846-489e-9347-7cbbbe4ed84b`, 34 scanned candidates, eight actors,
one `nonPublicCount` and zero `retryableOmissionCount`. This is aggregate
valid-non-indexable classification, **not** editorial intent or permission to
publish the omitted record.

The final strong snapshot check at **14:46:49.817Z** took **200 ms** and confirmed
the final retained generation, finish/retry times, 34 candidates, eight actors,
one valid-non-indexable omission and zero retryable omissions. Both diagnostic
strong reads succeeded. These workspace-to-Blob timings are **not Netlify-runtime
Blob timings**.

Observed failure signals across all eight directory requests:

- **0** non-200 responses.
- **0** `page.unavailable` storage-interruption signals.
- **0** `cacheAvailable: false` fallback/lost-retention signals.
- **0** unretained generations or continuation failures.
- Each new generation was immediately reusable through a subsequent snapshot hit.

This establishes **no observed storage failure in the bounded sample**, not zero
production storage failures overall. Recovered reads, etag retries and provider
operation/conditional-write counts are not separately instrumented. Expected
non-indexable omissions are not storage outages. No deliberate production
failure was introduced; outage behavior remains covered by local unit/SDK tests.

The final Netlify site check at **14:46:49.617Z** confirmed the same ready
deployment and revision as the start; no release switch occurred.

## Synthetic coverage remains separate

The existing 10,000-candidate fixture measures bounded request/read work:
100 rebuild chunks, approximately 10,300 normal Blob reads for a retained pass,
then two reads per warm discovery. Etag reconciliation can add bounded work.
The classified 31-candidate fixture's ten discoveries use 31 manifest reads and
52 total reads instead of the unclassified fixture's 310 and 340.

None of those synthetic counts is a production timing or billing measurement.
Production here has **34** candidates, not 10,000. Public scanned counts expose
manifest verifications; actual provider operation totals and all recovered
storage errors are not exposed by this endpoint.

## Verification and reproduction

Run `node scripts/measure-live-archive-directory.js <workspace-relative-result.json>`
only for an approved live release after independently checking deployment parity.
Allow approximately 16 minutes if the first partial response has a minute of
reuse remaining. Natural reader traffic may refresh the snapshot while the sampler
is sleeping; always inspect reported generations instead of assuming a cold hit.
This script does not certify release approval or infer missing provider telemetry.

`node --test scripts/measure-live-archive-directory.test.js netlify/functions/lib/public-archive-directory.test.js netlify/functions/lib/public-archive-inventory.test.js`
passed **52 tests, zero failures**. This includes the existing installed Netlify
Blobs SDK storage-contract test and new sampler deadline/budget/privacy checks.
Local tests are not the source of the production timings in the table.
