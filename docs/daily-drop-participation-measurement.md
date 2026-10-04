# Private Daily Drop participation measurement

## Agreed questions

The creator selected participation plus same-browser seven-day returns before
instrumentation was added:

1. How often is the label guide opened, and how often is a finished grid
   deliberately preserved successfully?
2. Where do reports stop: opening, submitting, sign-in required, failed
   submission, validated pending receipt, or acknowledgement of an already
   reviewed/retracted receipt?
3. Among browsers first observed viewing a Daily Drop, opening its guide,
   successfully preserving a grid, or receiving a validated pending report
   receipt, what proportion return to a displayed Daily Drop on UTC calendar
   days 1–7 after that action?

The four cohorts overlap. Daily viewers include participants; they are not a
nonparticipant control group. This is a descriptive association, not proof
of improvement or causation. Do not subtract overlapping cohorts or call stage
event counts unique users, completed reports, votes, or editorial approval.

## Privacy and authority

The shared analytics wrapper sends these events only to the existing Netlify
engagement collector. Participation is deliberately **not** forwarded to
Umami, Google tags, or the data layer: those destinations can inherit browser
URL/referrer context independently of event properties. Replit analytics
authorization is not proof that the external Netlify site has collected data.

The wire schema accepts only the fixed batch/version, event name, stage or
cohort, UTC cohort calendar day, and return-day integer 1–7. Unknown fields
are rejected on both client and server. Never send image URLs/capabilities,
actor names/identity notes, reaction/report reasons, explanations, email,
account/reporter identifiers, receipt identifiers, or private audit evidence.
The collector stores only this projection plus its server timestamp and
schema version. There is no browser identifier or cross-device linkage.
The collection request also uses `no-referrer` so capability-bearing browser
query strings cannot be sent as the measurement request's HTTP referrer.

The existing account session check must complete before participation is
measured. Known operators are excluded in-browser and independently by the
server's admin check; failed authority checks fail closed. Recognized bots
and test browsers are excluded. Operators are persistently marked internal
on their browser even after sign-out. Staff must set
`localStorage.setItem('daily-participation-internal', '1')` on **every browser
profile before visiting**; the existing `companion-pilot-internal=1` marker
is also respected. These markers contain no identity. Anonymous historical
staff visits cannot be removed retrospectively.

The browser stores only the first UTC day and a returned/not-returned flag
for each of four cohorts, with no generated ID or content. It enrolls each
cohort once per browser storage lifetime and records at most one return per
cohort. Same-day reloads, navigation, duplicate React effects, returns after
day 7, and future clock dates do not count as a return. Expired entries are
not re-enrolled. Clearing storage/new profiles can re-enroll. This is not an
audited unique-human count.

Updated clients serialize cohort enrollment and return read/write/emission
under one fixed, same-origin Web Lock. All four cohorts share this lock so
simultaneous actions cannot overwrite another cohort's state. No lock owner
or generated identifier is stored or sent. The lock callback rechecks the
route, authority, and internal markers before any cohort write. Waiting is
bounded to one second; unsupported, denied, or timed-out locking omits the
cohort operation instead of falling back to a racy storage guard. Stage
events still count actions (including actions in different tabs), not unique
browsers. Viewing, saving, and reporting do not await this measurement.

Deterministic two-tab browser checks verify concurrent first enrollment in
all four cohorts, concurrent day-1 and inclusive day-7 returns, repeated visits,
internal exclusion, lock-timeout omission and subsequent recovery in Chromium
and Firefox. WebKit/Safari is not verified: the local WebKit runtime aborts
before page creation because it cannot create an EGL display. Tabs running
an older client without locking can still race updated clients; reload all
tabs after release before starting a clean observation window.

Only a successful local grid write counts as preservation (not a tier toggle,
reason selection, canceled export, failed save, constituent-card save, or
cloud sync). Both daily export paths count, and intentional preservation of
a Daily Drop Legendary Misprint counts separately. A pending report counts
only after receipt identity, date, image, status, and reason validate in the
UI. This measures a pending receipt acknowledgement, not curator approval
or a unique new report: idempotent retries can acknowledge the same receipt.
Status refreshes are not submission completions.

Totals remain private. No public rewards, rankings, votes, notifications,
curator inputs, training, or eligibility changes consume these events.

## Observation window and private report

There is **no verified live start date yet**, and this task does not authorize
publication. After a creator-approved release, verify the actual production
bundle and collector; mark staff profiles before the first visits. Record the
first complete clean UTC day as **D**, together with the release verification
and internal-exclusion cutover. A contaminated or unverified window must
restart; do not invent a start from implementation time.

- Enrollment/stage window: `[D, D + 28 days)`.
- Follow-up ends: `D + 35 days`, exclusive, so even the last enrollment day has
  seven complete UTC calendar days for return observation.
- Calendar-day returns are not an exact rolling 168-hour duration.
- Do not report retention/conversion claims before this follow-up ends.

An authenticated admin can request the existing endpoint:

`/.netlify/functions/engagement-export?dailyParticipation=1&from=YYYY-MM-DD&to=YYYY-MM-DD`

`to` is exactly 28 days after `from` and is exclusive. Non-admin requests are
rejected by the existing endpoint. This mode returns aggregates only, never
records/storage keys, ignores `records`/`download`, and has private/no-store
cache headers. It returns `collecting` with no counts before day 35. Cohort
counts and rates are suppressed if either the enrollment or return count is
below 10; stage totals below 10 are also suppressed. Suppressed/missing data
is not zero. Inconsistent returns greater than starts never produce a rate.

Transport is best effort and does not block participation or queue retries.
Offline requests, storage/tracker restrictions, page unload, auth-check
outages, clock changes, lock exclusions, older overlapping tabs, and missed enrollment events can
bias totals. The browser cohorts may have begun before the requested window;
the report includes only enrollments inside the selected window, not every
active browser. Compare rates only as overlapping descriptive samples with
these limitations; a causal experiment is outside this scope.

Do not turn absent traffic or a local mocked test into a production result.
Verification here covers schema sanitization, authority exclusion, cohort
calendar rules, receipt-stage placement, save-stage placement, small groups,
and authenticated aggregate-only reporting. Live fan report-loop verification
is tracked separately.