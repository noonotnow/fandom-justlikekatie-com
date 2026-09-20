# Archive access funnel and operations

Archive reporting combines privacy-safe client funnel events with aggregate server
access checks. Neither source records customer, account, email, session, IP,
capability, raw URL, or free-form error values.

## Funnel

| Description | Event name | Safe properties |
| --- | --- | --- |
| A locked edition preview rendered | `archive_preview_view` | `edition_date`, bounded `access_reason` |
| A visitor interacted with the gate | `archive_gated_intent` | `edition_date`, bounded `access_reason` |
| A visitor requested archive sign-in | `archive_sign_in` | `edition_date`, `access_reason=requested` |
| A visitor started membership checkout | `archive_checkout` | `edition_date` |
| Access returned after sign-in or checkout | `archive_restored` | `edition_date`, optional bounded `access_reason` |
| An authenticated check could not grant access | `archive_denied` | `edition_date`, `access_reason=upgrade` or `billing_delay` |
| A historical full edition loaded | `archive_full_use` | `edition_date` |

Normal anonymous `sign_in` gates are previews in this funnel, not denied-access
incidents. `archive_denied` is emitted only for upgrade or billing-delay outcomes.

## Operator report

Release Desk → Audience evidence shows a rolling 24-hour aggregate and an exact
trailing-60-minute health summary. Each immutable server record contains an exact
timestamp, a bounded outcome, and an authenticated/non-authenticated boolean.
It contains no account, customer, session, request, URL, edition, or error
identifier. Billing lookup exceptions are grouped with `billing_delay`;
exception messages and identities are not retained.

Immutable access-check records are retained for seven days, which covers the
24-hour operational report and short incident review. Opening the admin report
also runs an idempotent, paginated cleanup: records older than seven days are
deleted after the rolling report is calculated. The exact seven-day boundary is
retained. Cleanup failures do not fail or change the report, and cleanup never
runs in the member archive-access request path.

The denominator for both incident rates is authenticated server access checks.
Anonymous previews and sign-in gates remain visible as funnel volume but cannot
trigger an alert.

| Signal | Warning | Critical |
| --- | --- | --- |
| Billing delay | 3+ delays and at least 20% of authenticated checks in one hour, or delays in two consecutive hours | 5+ delays and at least 50% of authenticated checks in one hour |
| Denied access | 10+ upgrade denials and at least 40% of authenticated checks in one hour | 25+ upgrade denials and at least 60% of authenticated checks in one hour |

Counts below the minimum sample remain `normal` even when their percentage is
high. Missing buckets mean no recorded checks, not proof of healthy billing.


## Operator notifications

The admin health endpoint evaluates each signal independently. A transition from
`normal` to `warning` or `critical` sends one email to the configured operator
allowlist. Escalation from `warning` to `critical` sends one additional email.
When an alerted signal returns to `normal`, one resolved email is sent. Repeated
reads at the same state are deduplicated in the aggregate operations store.
An hourly scheduled health check drives the same transition logic, so operators
do not need to keep Release Desk open.

Messages contain only the bounded signal category, aggregate count,
authenticated-check denominator, rate, trailing 60-minute window, status, and
transition kind. They never contain customer, account, email, session, IP, URL,
edition, request, capability, timestamp, or error details. Anonymous previews
and sign-in gates cannot enter the notification state machine.

Notification delivery is best-effort. Missing email configuration or a provider
failure is logged for operators but does not change archive access or prevent
the health report from loading. A failed transition remains eligible for retry
on the next authenticated health check.

## Triage

For a billing warning, confirm Stripe and membership-repository availability,
then verify a fresh active-member archive check returns full use. For a denial
warning, compare the current hour with checkout and restoration funnel counts
before treating it as authorization failure: a campaign can legitimately send
inactive signed-in visitors to the gate. Escalate only when the aggregate signal
persists or restoration/full-use outcomes also fall.
