# Released-pack conversion analytics

Replit Publishing analytics automatically records pageviews. The released-pack
library adds the following privacy-safe custom events:

| Description | Event name |
| --- | --- |
| Visitor or Collector opens the released library | `released_library_opened` |
| Collector changes the actor or vibe filter | `released_library_filter_used` |
| Locked visitor requests an email sign-in link | `released_library_sign_in_started` |
| Locked visitor starts Collector checkout | `released_library_checkout_started` |
| Verified Collector capability appears after an attributed checkout return | `released_library_collector_activated` |
| Collector opens an entitled pack's source depth | `released_pack_opened` |

Event properties are limited to a bounded source (`daily_star`,
`public_record`, or `library_navigation`), entitlement state, filter kind, a
slug-shaped actor identifier, and a numeric vibe index from 0 through 99.
Account data, email addresses, search queries, source queries, authoring
prompts, and capability values are never sent.

Checkout attribution is stored locally for at most two hours and consumed once.
The completion event only fires after the billing return and a verified
Collector capability. Library opens wait for membership resolution so the
initial unresolved state cannot double-count a Collector as a locked visitor.
Sign-in attribution uses the same bounded, expiring local handoff so an email
magic-link return can restore the released library without putting account
data or unbounded content into the callback URL.

## Post-publish funnel questions

1. For pageviews of `/vibe-atlas?view=released`, which bounded source produces
   the highest rate of `released_library_sign_in_started` and
   `released_library_checkout_started` and verified
   `released_library_collector_activated`?
2. Which actor and vibe identifiers most often progress from
   `released_library_opened` to `released_pack_opened` for entitled visitors?
3. Do visitors arriving from Daily Star links convert to checkout more often
   than visitors using library navigation, and which actor/vibe pairings drive
   that difference?

## Aggregate review — 2026-09-23

The authorized Replit Publishing analytics dataset was queried at 23:00 UTC.
In the rolling seven days, it contained **no pageviews anywhere in the
project**, no pageviews of `/vibe-atlas?view=released`, and no occurrences of
any of the six released-pack events listed above (including
`released_pack_opened`). A separate 90-day coverage check also found no
pageviews or custom events anywhere in the project. The released-library
pageview query accepted `view=released` in any query-parameter position; the
coverage check did not depend on a page path or query parameter.

| Entry source | Library opens | Sign-in starts | Checkout starts | Verified activations | Entitled pack opens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Daily Star (`daily_star`) | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| Public record (`public_record`) | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |
| Library navigation (`library_navigation`) | Unavailable | Unavailable | Unavailable | Unavailable | Unavailable |

These cells are **not observed conversion rates or evidence of zero visitor
interest**. There is no collected Replit sample to compare the entry sources,
rank actor/vibe identifiers, or identify which released packs prompt sign-in
or checkout. Every segment is below a usable sample size. No visitor-level
rows or identifiers were retrieved for this review.

The public production site is deployed externally on Netlify. Replit injects
its Publishing tracker into Replit-published apps, not that external site;
the empty Replit dataset does not establish whether the Netlify site has
traffic. The shared tracking wrapper also sends these events to the
configured Google tag when present, but this review does not have production
Google Analytics aggregates. Confirm that the production destination
receives pageviews and the released events before starting a comparison
window; do not publish a second site simply to produce a Replit metric.

For a later aggregate review, separate locked and entitled library opens,
then compare the three bounded `source` values using event counts and
approximate same-period audiences only where the reporting destination
supports them. Compare `actor_id` (bounded slug) and `vibe_index` (0–99)
only in sufficiently populated aggregate groups; suppress tiny groups.
Treat event-count ratios as directional, not person-level conversion:
library opens can repeat, the pageview route has no source dimension of
its own, a sign-in **start** does not confirm a completed sign-in, and a
checkout **start** does not confirm payment. A verified activation is
attributed only when the locally stored checkout context survives the return
within two hours, so unmatched or cross-device completions are not counted
as released-library activations. `released_pack_opened` reflects entitled
source-depth expansion, not a locked visitor's preview.

## Live Netlify reporting

The production HTML loads Google tag `G-FHZJ1T74TG`; its initial config sends
the landing pageview (canonicalized to `view=released` on a direct library
arrival). SPA arrivals explicitly send one canonical Google pageview instead
of relying on automatic navigation tracking. The six custom events also go
to that tag. A separate `released_library_page_view` measurement is recorded
once when the released library mounts. All seven measurements go to a dedicated Netlify collector, which
stores only an allowlisted event, source, optional actor/vibe/filter/entitlement,
and server timestamp. No email, account, visitor ID, free text, capability,
or raw URL is included. Browser analytics failures cannot block the flow.
The Netlify count is event volume, not distinct visitors or GA4 session volume.

An operator with an authorized admin session can request **only aggregate
counts** at `/.netlify/functions/released-pack-report?from=YYYY-MM-DD&to=YYYY-MM-DD`.
Dates are UTC and half-open (`to` exclusive), up to 31 days and no future days.
Use the authenticated operator browser session; unauthenticated requests are
rejected. The response returns `bySource`, `bySourceAndEntitlement` for library
opens, and `byActorAndVibe`. Only groups with **at least 10 events** appear;
absence is *suppressed or unobserved*, never proof of zero. There are no raw
event rows, per-visitor IDs, or unsuppressed overall totals. Do not use the
general engagement export to retrieve this dedicated store.

The live bundle checked on **2026-09-24** loaded the Google tag but its
`/assets/index-Duewsgnr.js` asset contained **none** of the six released event
names. Therefore the previous 90-day Replit no-data result and the existing
live bundle cannot establish released-pack conversion. After deploying this
revision to Netlify, verify the live HTML's asset hash and inspect that asset
for all six names, then confirm an authorized report is accessible. Wait for
representative real traffic and compare complete UTC days within the confirmed
deployment coverage window. Report pageviews, locked versus entitled opens,
sign-in **starts**, checkout **starts**, verified Collector activations, and
entitled pack opens separately. Label the actual coverage dates and suppressed
groups; don't calculate person-level conversion rates from event counts.