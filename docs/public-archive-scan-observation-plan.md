# Shared actor-directory release and observation handoff

## Status — 2026-10-04

Creator approved release preparation, publishing the review branch and its Netlify
preview, local preparation of privacy-safe server diagnostics, and adding those
diagnostics to PR 181 and its review preview. Production deployment (including
diagnostics) and live storage mutations are not approved. Independent release
approval must cover the latest push.

The evidence baseline remains
[the production assessment](public-archive-cross-instance-refresh-assessment.md).
Its historical duration-only logs do not measure the workspace directory's
cross-instance duplication. No new production measurement is claimed here.

A focused local release branch, `release/shared-archive-actor-directory`, is
prepared from GitHub main `be781ee21912fb0e628078c40acfc6fbef5a1a1b`.
Its initial review head was `5725e357`; its external worktree is
`/home/runner/worktrees/actor-directory-release`. The branch is pushed for review:
[PR 181](https://github.com/noonotnow/fandom-justlikekatie-com/pull/181).
Its [Netlify preview](https://deploy-preview-181--earnest-gecko-17eb0c.netlify.app/)
is ready. It is not merged or published to production. Fetch main again before
any further release change and reconcile intervening changes.

The branch includes the existing actor-discovery UI, its existing privacy-safe
browser analytics, verified names-only snapshots, and bounded in-process sharing.
It preserves the published Daily Drop layout. The updated review revision adds
bounded server diagnostics but no distributed lease, partial-snapshot reuse policy,
or publication approvals.
Separate work on partial-snapshot reuse is not implicitly approved for this release.

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
are being added to the review branch under the creator's separate preview approval;
they are not approved for production. Verify the refreshed preview before claiming
hosted diagnostic parity. See the
[diagnostic contract](public-archive-scan-diagnostics.md).

## Remaining gates

1. The directory review branch and preview are approved and published. Do not merge
   the PR or change repository protection.
2. Local diagnostics and their review-preview publication are approved. Verify the
   refreshed preview; obtain separate approval for their production release.
3. Require the repository's `test` status check and independent approval after the
   latest push. Obtain explicit creator production-release approval before merge
   or any other action that publishes production.
4. Verify the **active** Netlify deployment's exact function source, dependencies,
   and browser bundle against the approved revision. Verify browser discovery
   uses `verified-directory`; do not infer parity from a storage key's existence.
   An actor-directory request can write a snapshot, so authorize hosted function
   checks before issuing them. Label deliberate checks as test traffic.
5. Start the observation clock only when parity and usable diagnostics are verified.

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