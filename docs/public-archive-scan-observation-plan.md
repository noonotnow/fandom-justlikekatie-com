# Shared actor-directory release and observation handoff

## Status — 2026-10-08

**Latest scope and activation update:** The creator explicitly chose to close this
work as **capture setup completed**, keep automatic capture running, and defer
the seven-day measurement and cost/latency comparison to follow-up work.
PR 191 is merged; both the first reviewed-main export and the first scheduled
export succeeded, and their sanitized artifacts were inspected. The earlier
marked browser check's missing summaries were recovered. No seven-day dataset
or lease recommendation is claimed. Historical preparation/activation statements
below describe their dated state, not the latest status.

Creator approved release preparation, publishing the review branch and its Netlify
preview, local preparation of privacy-safe server diagnostics, and adding those
diagnostics to PR 181 and its review preview. The creator subsequently merged
PR 181, releasing the directory and diagnostics to production. The final head's
required tests passed and independent approval covered that head. On 2026-10-08
the creator separately approved a bounded marked production directory/browser
check and preparation of a reviewed twice-daily log-export job. The marked check
performed the normal derived snapshot refresh. No live CAS race, publication
approval change, manifest mutation or manual snapshot repair was authorized or run.

The evidence baseline remains
[the production assessment](public-archive-cross-instance-refresh-assessment.md).
Its historical duration-only logs do not measure the workspace directory's
cross-instance duplication. New setup samples below are not a representative
seven-day measurement.

A focused local release branch, `release/shared-archive-actor-directory`, is
prepared from GitHub main `be781ee21912fb0e628078c40acfc6fbef5a1a1b`.
Its initial review head was `5725e357`; its external worktree is
`/home/runner/worktrees/actor-directory-release`. The branch is pushed for review:
[PR 181](https://github.com/noonotnow/fandom-justlikekatie-com/pull/181).
Its [Netlify preview](https://deploy-preview-181--earnest-gecko-17eb0c.netlify.app/)
is ready. The PR was merged on 2026-10-04 at 23:51:20 UTC as
`b7af64505d248304b1f87f9da6284ba04208b39a`. Fetch main again before any further
release change and reconcile intervening changes.

The branch includes the existing actor-discovery UI, its existing privacy-safe
browser analytics, verified names-only snapshots, and bounded in-process sharing.
It preserves the published Daily Drop layout. The updated review revision adds
bounded server diagnostics but no distributed lease, partial-snapshot reuse policy,
or publication approvals.
Separate work on partial-snapshot reuse was not implicitly included in this release.
It has since reached production through a different approved release; observations
before and after that policy boundary must remain separate.

## Preparation checks

Checks ran against the focused release worktree:

- Production build and lint passed; lint emitted existing warnings.
- Directory/inventory tests: 34 passed.
- Existing actor-discovery analytics tests: three passed.
- Archive browser tests: seven each passed in Chromium, Firefox, and WebKit.
  WebKit initially closed during page creation. Aligning its verification-only EGL
  vendor manifest and DRI path with Mesa from the declared Replit runtime resolved
  that launch problem. No browser helper or production graphics setting changed.
- Lockfile parity passed.
- The workspace release-tree checker passed against the release worktree.
  That checker is not present in the remote-main-based branch itself.

These are local functional checks, not production parity, independent release
approval, live conditional-write evidence, or a seven-day observation.
GitHub's required `test` jobs passed on the initial `5725e357` revision, which
also received an APPROVED review. Neither certifies the later diagnostics push:
require passing checks and independent approval for that updated revision.

The preview homepage renders normally. Its served browser bundle contains
`verified-directory`. An invalid-directory function request returns the expected
HTTP 400 JSON before catalogue/manifest access or snapshot writes. These checks
establish preview routing/bundle presence, not a live scan or production parity.

Local diagnostics preparation passes the production build, lint (existing warnings),
43 targeted server tests, and the full 1,150-test function suite. The diagnostics
are now on the review branch under the creator's separate preview approval;
they were subsequently released through the creator's merge. See the
[diagnostic contract](public-archive-scan-diagnostics.md).

## Refreshed preview evidence — 2026-10-04

- PR 181 head: `2e03b12d81da4503636c6a4f0db0cae1b2b2e5c8`.
  Only the diagnostic implementation, tests and observation documentation were
  added to the existing directory release. GitHub main remains at the assessed
  `be781ee2` revision.
- Netlify deploy `6ac28e5f87aca80008aeea94` is ready, context `deploy-preview`,
  at that exact head. Its alias remains
  `https://deploy-preview-181--earnest-gecko-17eb0c.netlify.app/`.
- The homepage and served `/assets/index-H6ZGIxHY.js` return HTTP 200; the
  bundle contains `verified-directory`. A fresh public screenshot renders normally.
- Marked invalid-directory validation returns the expected HTTP 400 JSON.
  Netlify's documented function-log WebSocket delivered a schema-version-1
  `archive_inventory_request` record with `traffic: marked_test`, status 400,
  **zero manifest reads**, zero owned/joined work and zero suppressed records.
  This verifies deployed request diagnostics without triggering a directory scan.
  The invalid-directory query is classified as `page` by the fixed request-kind
  parser; HTTP status/outcome identify the rejected request.
- No chunk record, actual hosted scan or live CAS behavior was exercised.
- The historical function-log API returned a blank line for the first probe,
  not the structured diagnostic record. A real-time sample proves emission,
  **not seven-day retention/export completeness**. Verify reliable capture and
  permitted retention before starting the observation clock.
- The production published-deploy identity is still `6ac18f731a76d50008059ab9`,
  revision `be781ee21912fb0e628078c40acfc6fbef5a1a1b`. It was not changed.
- GitHub `test` checks for the updated head are running. The approval on the
  original head is now dismissed; renewed independent approval is required.

## Production evidence — 2026-10-07

- GitHub confirms PR 181 merged, both required `test` runs succeeded on
  `2e03b12d`, and an APPROVED review covered that exact head.
- Active Netlify deployment `6ac6874482507f000822a14d` is ready at
  `5384ba9c3b9b8157aca1a27ea189a5c78010847b`, published
  **2026-10-07T17:55:36.035Z**. The PR 181 merge is an ancestor of this revision.
- The active source contains the diagnostics wrapper, directory implementation and
  matching browser directory/retry flow. Its lockfile resolves `@netlify/blobs`
  to 10.7.13. The runtime function archive was not downloaded for binary inspection.
- The custom-domain homepage and `/assets/index-CK9Hs8QH.js` return HTTP 200;
  the bundle contains `verified-directory`, and a public screenshot renders normally.
  This does not exercise the interactive actor-directory flow.
- Two marked validation probes used invalid directory/date values and returned
  HTTP 400. A subscription using the active deployment's exact function metadata
  received a schema-version-1 request diagnostic at 18:05:50 UTC: marked test,
  zero manifest reads, zero owned/joined work and zero suppressed records.
  Neither probe accessed manifests, refreshed a directory or attempted CAS.
- Production historical retrieval works, unlike the earlier preview sample.
  A paginated query from the PR merge to 18:05:06 UTC returned one complete page:
  30 provider entries, 18 structured records (12 requests and six chunks).
  The sanitized [initial export](evidence/public-archive-scans/2026-10-07-initial-production-export.json)
  retains only approved diagnostic fields, not raw provider logs or provider request IDs.
- All 18 records precede the latest deployment; the earliest is
  2026-10-07T16:44:47.258Z. The 12 requests are unmarked, not certified organic.
  The six owner chunks report 198 manifest attempts. These are not a seven-day
  sample, a duplicate-read estimate, or evidence of the new reuse policy.
  Newly emitted probe records were not yet present in this historical response.
- Current source uses `verified-public-archive-actors-v2` and a separately released
  **60-second exhausted-partial reuse window** (PR 187). Treat its publication as
  a new scan-policy boundary; never pool earlier sequential rescans into its cohort.

## Remaining gates and capture requirements

1. **Approved and exercised on 2026-10-08:** the marked Archive builder check below
   verifies the browser flow and actual chunk emission. Historic request-summary
   delivery for that check is still incomplete; emission and retention are separate.
2. Preserve sanitized production logs before retention expires. Netlify documents
   at least 24 hours of function activity, with seven days on some plans; this
   site's longer retention has not been certified. Complete pagination does not
   certify complete provider delivery. No unattended daily export is configured
   by this task, and the observation clock has **not** started.
3. Netlify also documents a 4 KB total per-invocation log limit, retaining only the
   final 4 KB on overflow. Missing owner/chunk pairs, partial records and unknown
   intervals must be reported even when the diagnostic suppression count is zero.
4. A reviewed read-only twice-daily export job, or confirmed daily manual exports with
   less than 24 hours between captures, is needed before promising a seven-day
   dataset. The job is prepared for review, not activated. No provider setting changed.
5. Start at least seven representative full days only after functional parity and
   reliable capture are established. The conditional Oct 8–14 window was **not**
   started. Choose seven new full UTC days after the first successful unattended
   captures and their delayed-log reconciliation; do not backdate the start.

Provider reference: [Function log retention and limits](https://docs.netlify.com/build/functions/logs/#log-retention-and-limits).

## Approved production parity check — 2026-10-08

The initial 11:29:15–11:29:31 UTC browser visit used `/vibe-atlas/archive`.
That public Archive listing does not mount the actor-directory hook; it produced
no `public-archive-inventory` response. The real directory path is
`/vibe-atlas?view=builder&source=archive`. Keep both operator windows excluded from
organic-traffic claims. The public listing was also screenshotted around 11:33 UTC;
it displayed its ordinary loading state and did not exercise actor discovery.

The [marked browser receipt](evidence/public-archive-scans/2026-10-08-marked-browser-parity.json)
covers **11:30:42.474–11:30:51.024 UTC**. Inventory requests carried
`x-vibe-atlas-archive-test: 1`; Google analytics calls were blocked in this browser.
No function responses were mocked:

- Directory HTTP 200, `verified-directory`, names-only actor count one, normal
  verification source, partial status, 34 attempted candidates and 31 omissions.
  Its refresh was retained (`cacheAvailable: true`), with a one-minute retry time.
- Ordinary page HTTP 200, `verified-page`, three editions and one actor, with the
  same explicit omissions. The selector was enabled and the partial/retry notices
  were visible. No browser JavaScript exception was observed.
- Directory response arrived approximately 2,742 ms after navigation began;
  page response approximately 3,978 ms. These are one marked browser setup sample,
  not a p95, seven-day reader distribution, or pure server latency.
- The [narrow historical export](evidence/public-archive-scans/2026-10-08-parity-log-export.json)
  retrieved one marked chunk: 34 manifest-read attempts, partial outcome,
  normal snapshot CAS `modified`, 470.17 ms whole operation. Its hashed identities,
  scan interval and CAS latency are retained. At 11:34:45 UTC the provider had
  **not returned its owner summary or the marked page summary**. Coverage remains
  uncertified; the orphan chunk is explicitly counted.
- At the probe, the ready deployment was `6ac6d499c3696400089ae4a8`, source
  `f342806ab177ee5283f749d2077759dd7200853d`, published 2026-10-07T23:25:10.672Z.
  Another approved release became live during setup at 11:32:28.171 UTC:
  `6ac77f08fd056a000832a9ed`, source `4289a32644714113b7c1d1e9699743c643da6729`.
  Git source comparison shows no changes between these revisions in the directory,
  inventory library/wrapper, diagnostic factory or browser directory hook.
  This is source plus functional parity, not downloaded binary certification.

## Read-only capture preparation — 2026-10-08

`scripts/export-public-archive-scans.js` uses only provider GET requests, with
fixed site/function scope. It validates and copies only the approved diagnostic
schema, discards raw provider messages/request IDs, rejects unknown diagnostic
values, traverses bounded pagination and records release boundaries. Manual
deployments without a commit remain an explicit unknown revision.

The [22-hour preparation export](evidence/public-archive-scans/2026-10-08-production-export.json)
returned 32 records (22 requests and ten chunks), zero rejected records and zero
missing owner/chunk relationships **within that returned sample**. It spans both
scan policies and is not a post-policy seven-day cohort. Unknown provider delivery,
retention and truncation remain explicit even when relationship counts are zero.

The proposed `.github/workflows/archive-scan-export.yml`:

- Runs at 05:23 and 17:23 UTC, with a 22-hour lookback and 15-minute indexing delay.
  Windows overlap; later analysis must deduplicate by diagnostic identities across
  artifacts and re-check missing relationships after the next capture.
- Checks out reviewed `main`, not an unreviewed dispatched branch; no dependency
  installation, publication call or Blob mutation occurs.
- Uploads sanitized JSON as a GitHub Actions artifact with 14-day retention.
  Exporter errors fail the job; an already-written sanitized rejection receipt
  can still be retained. No email notification or provider configuration is added.
  Download the artifacts for analysis before they expire; this is not permanent
  evidence storage.
- Is inactive until the creator supplies the repository secret
  `NETLIFY_ARCHIVE_LOG_READ_TOKEN` through **GitHub Settings → Secrets and variables
  → Actions**, and sets the repository variable `ARCHIVE_SCAN_CAPTURE_UNTIL` to a
  UTC ISO stop date at most 16 days ahead. No credential was copied from Replit.
  At proposal time, existing repository secret names were checked read-only and
  the required Netlify log credential was absent. Subsequent creator-authorized
  setup is recorded below. Existing Blob-audit tokens are not reused.
- Makes no provider calls at/after the stop date. Scheduled workflows can be
  delayed or skipped; twice-daily scheduling alone is not proof of complete capture.

The bounded proposal is published as
[PR 191](https://github.com/noonotnow/fandom-justlikekatie-com/pull/191),
head `0faa6e8fb39803c26e4cfaabe0e17ccd4b1600d9`, from current GitHub main.
It is open for independent review; it was not merged, dispatched or deployed by
this task. The external review worktree passed 21 exporter/diagnostic tests.

Before starting the clock: obtain independent review and creator merge; configure
the credential and stop variable securely; run the main-branch workflow once and
verify its artifact; verify the next scheduled capture and reconcile the marked
probe's missing summaries. Track successful capture intervals, not only schedules.
Gaps approaching 24-hour retention, missing chunks, changed source/policy or
uncertain delivery require explicit unknown coverage or a replacement window.
No automatic capture is currently running. The task remains incomplete pending
activation, at least seven representative days, and the duplicate/lease comparison.

Local checks for the exporter: 11 new exporter/workflow tests plus nine existing
diagnostic tests passed; targeted lint and whitespace checks passed. The workspace
script suite reported 589 passes, two skips and one unrelated failure:
`published US observations do not imply another country or a finale date` in
`scripts/where-to-watch.test.js` compares a dated page against the current freshness
warning. That same watch-guide test fails in isolation. No watch-guide source or
published page was changed by this task.

## Repository configuration — 2026-10-08, 13:53 UTC

The creator reported approving the PR and fixing its failing check, then requested
adding the activation configuration. GitHub confirms an APPROVED review on the
updated PR head `fa88ee7ff7b3ad8e820e86d1f5135889f2e4cbc8`. The PR remains open and
unmerged; its two `test` checks were still running when configuration was verified.
The export workflow is not yet on `main`. This task did not merge the PR or
dispatch an unreviewed-branch workflow.

With that authorization:

- Set repository Actions variable `ARCHIVE_SCAN_CAPTURE_UNTIL` to
  **2026-10-20T00:00:00Z** and verified its value through GitHub.
- Securely stored the existing Netlify operator credential as repository Actions
  secret `NETLIFY_ARCHIVE_LOG_READ_TOKEN`, using GitHub CLI's local encryption and
  stdin. Neither credential value was printed, put in command arguments, written
  to disk or stored in documentation. Secret-name/update metadata was verified.
- This reuses the operator credential's existing permissions; the new secret name
  does not narrow them. The reviewed export job itself uses only provider GETs.

Configuration is ready, but metadata verification is not a successful workflow
capture. After the creator merges the approved, passing PR, run the reviewed
`main` workflow once, verify the sanitized artifact, then verify a scheduled run
and delayed-record reconciliation. The observation clock has **not** started.
If merge/setup is delayed enough to leave fewer than seven full representative
days before the stop date, obtain an extension rather than backdating the sample.

## First main-branch capture — 2026-10-08, 14:47 UTC

The creator reported merging PR 191. GitHub confirms its merge at
**2026-10-08T14:46:49Z**, merge revision
`2f7450dbc3745c135e369f21692da86bba85ce80`. The export workflow is now
active on `main`; the stop variable remains **2026-10-20T00:00:00Z**.

Dispatched only the reviewed-main GET-only exporter:
[successful run 37795357514](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/37795357514).
The job completed in 12 seconds and retained artifact
`archive-scans-37795357514-1` (artifact ID `11558730594`, 5,308 compressed bytes),
which expires **2026-10-22T14:47:43Z**. Downloaded and inspected its sanitized JSON:

- Window **2026-10-07T16:32:40.295Z–2026-10-08T14:32:40.295Z**;
  captured **2026-10-08T14:47:43.235Z**.
- One complete pagination page, 77 provider entries, **47 typed diagnostic
  records**, 30 unstructured lines, zero rejected or duplicate records.
  Every retained record matches the exporter's typed allowlist.
- Zero missing chunk references, ownerless chunks, unknown scan ends,
  truncated work references or reported suppressed records in the returned sample.
  Provider-wide delivery, retention and truncation remain uncertified.
- The marked 11:30 browser check now has its directory owner summary linked to
  the known chunk and its separate ordinary-page summary. Both request summaries
  are explicitly `marked_test` and each reports 34 manifest attempts. This
  resolves the previously missing summaries; it is not organic observation.
- Active deployment was unchanged during capture:
  `6ac7a29f5b9f420008f16b83`, source
  `ba6fd8d8e03eaa9007aae7d207facfaff29e8559`, published
  **2026-10-08T14:04:13.754Z**. GitHub comparison from the prior parity revision
  shows no directory, inventory wrapper/library, diagnostics factory or browser
  directory-hook change. Publication-manifest and historical-approval changes
  did occur; preserve this deployment boundary rather than assuming identical
  public candidate eligibility.

No deployment, directory write, live CAS experiment or production browser request
was initiated for this capture. The next scheduled opportunity is **17:23 UTC
on October 8**; a schedule is not evidence that it ran. Verify its artifact and
reconcile the overlapping records before choosing seven new full UTC days.
**October 9–15 is only a candidate window**, conditional on successful scheduled
capture and continuing coverage; it is not an observed or completed dataset.
Under the original scope, completion required seven representative days and the
duplicate-work-versus-lease/reader-latency comparison. The creator subsequently
deferred those requirements to follow-up work as recorded below.

## Setup-only closeout and scheduled capture — 2026-10-08

The creator selected **“Close setup; keep automatic capture running”** and
confirmed **“yes the follow up is best.”** Completion now covers approved release
and diagnostic setup, functional parity evidence, activation, a verified manual
export and a verified scheduled export—not the original seven-day measurement.
No workflow, stop date, credential permission or provider setting was changed
at closeout.

The first scheduled run was delayed until **2026-10-08T22:13:51Z**:
[successful run 37852132909](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/37852132909).
Downloaded and inspected artifact `archive-scans-37852132909-1`:

- Captured **2026-10-08T22:14:08.912Z**, querying
  **2026-10-07T23:59:05.523Z–2026-10-08T21:59:05.523Z**.
- One complete pagination page, 29 provider entries, 19 allowlisted records,
  ten unstructured lines, zero rejected or duplicate records.
- Zero missing chunk references, ownerless chunks, unknown scan ends,
  truncated work references or reported suppression within this sample.
  The receipt still correctly reports `coverageCertified: false`.
- Active production deploy remained `6ac7acdbcece04000843c10c` at merge revision
  `2f7450dbc3745c135e369f21692da86bba85ce80`, published
  **2026-10-08T14:47:51.260Z**. This was the creator's merged release, not a
  deployment initiated during closeout.

The delayed scheduled run demonstrates why scheduled times alone cannot certify
capture coverage. Follow-up work must preserve/download artifacts before their
14-day expiry, reconcile overlapping exports, track actual successful intervals,
retain release/policy boundaries and qualify at least seven representative full
days before making the duplication-versus-lease comparison. October 9–15 remains
a candidate window, not a certified result. The unchanged stop date is
**2026-10-20T00:00:00Z**; extending it requires creator approval.

## Approved review diagnostic design

One bounded server record per actual refresh chunk and one request summary should
be sufficient. Record ephemeral process identity, opaque chunk/work identity,
catalogue fingerprint, snapshot generation, chunk interval, start/end offsets,
actual manifest-read attempts, outcome, CAS attempted/modified/error result,
and scan/CAS/request elapsed time. Distinguish exact editions, ordinary pages,
snapshot hits, scan owners and in-process joiners. Joiners must reference the same
work identity rather than counting the owner's reads again.

Different cold scans can create different generations for the same dates.
Compare hashed candidate range and catalogue fingerprint as well as generation;
generation equality alone cannot identify all duplicate work. Record actual
attempts even if a manifest read throws or progress stops within a concurrent batch.
Unavailable progress is not equivalent to zero reads.

Use fixed outcome categories and explicit test classification. Do not log actor
names/IDs, member or session identifiers, full URLs/query strings, manifest/image
bodies or URLs, credentials, raw errors, or persistent browser identifiers.
Bound log volume and retention; count missing or truncated evidence as unknown.
Do not add public diagnostics endpoints or diagnostic Blob writes.

## Observation and decision

Collect at least seven representative full days after the gates above, including
cold starts, expiry, Shanghai rollover and ordinary reader traffic. Preserve
deployment boundaries and provider log coverage. A release or changed scan policy
must be recorded rather than silently pooling incompatible observations.

Report ordinary-page/exact-edition traffic separately. Distinguish overlapping
identical candidate chunks on different processes from sequential partial rescans,
disjoint chunks, in-process sharing and deliberate tests. Use interval overlap and
actual attempted reads, not invocation count or successful retained progress.

Report daily duplicate manifest reads and scan time, snapshot outcomes, CAS
modified rates and latency, and reader response p50/p95. Server request latency is
not browser time-to-directory; measure or clearly identify the latter as unavailable.
Payload estimates are not wire bytes or billed transfer. Unknown log coverage
must remain explicit.

Compare measured duplicate reads against lease acquisition reads/writes, renewal,
release or expiry handling, failed contenders, strong polling reads, extra
invocations, and reader wait latency. Do not invent invoice-specific rates or treat
reads and writes as financially equal. Recommend a lease only for sustained,
material duplication after cheaper causes are addressed.

No live CAS race is authorized. Any later justified check needs separate creator
approval, disposable isolated keys and guaranteed cleanup; never use directory,
manifest, MEDIA or health-history state.