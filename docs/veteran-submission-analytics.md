# Veteran submission funnel analytics

The public veteran journal route receives a controlled pageview for the
canonical `/vibe-atlas/veteran-journal` location. Before analytics initializes,
the capability-bearing `journal` query value is moved into browser history
state for the form and removed from the visible URL. Veteran custom events also
set that same canonical `page_location`, so neither pageviews nor event context
can inherit the public journal identifier.

The custom events add coarse funnel milestones without sending journal IDs,
account identifiers, IP-derived data, interpretation text, or other free-form
user content.

| Description | Event name | Safe properties |
| --- | --- | --- |
| An eligible public form finished loading and became usable | `veteran_form_started` | `surface`, canonical `page_location` |
| A visitor chose the kind of journal moment to respond to | `veteran_relation_selected` | `relation_kind` (`entry` or `prediction`), canonical `page_location` |
| The sealed submission endpoint returned an accepted submission | `veteran_submission_succeeded` | `relation_kind`, canonical `page_location` |
| A submission attempt was rejected or could not complete | `veteran_submission_failed` | `relation_kind`, `failure_category` (`validation`, `rate_limit`, `network`, `server`, or `unknown`), canonical `page_location` |

## Questions to answer later

Once pageviews and events have accumulated, useful pageview-to-submission
questions include:

1. Of pageviews to `/vibe-atlas/veteran-journal`, what share reaches
   `veteran_form_started`, and what share reaches a successful sealed
   submission?
2. After `veteran_form_started`, do visitors select entries or predictions
   more often, and does either relation kind have a higher success rate?
3. What proportion of submission attempts end in each coarse failure category,
   especially `validation` versus `rate_limit`, and does that explain the gap
   between relation selection and successful submission?

These are aggregate questions only. The public journal query parameter is
removed before tracking and must never be restored to analytics data or
context.

## Production review status — 2026-08-31

This review is intentionally recorded as a production data-gap finding rather
than a guessed funnel analysis.

| Review item | Status |
| --- | --- |
| Google Analytics property | The external `fandom.justlikekatie.com` site is configured to send to GA4 measurement ID `G-CGWB67360Q` in the production document. The GA4 reporting property itself was not accessible from this workspace. |
| Source | Not Replit Publishing analytics. No GA4 reporting connection or existing aggregate export was available to query. |
| Date range | No production date range was queried. A future review must state the selected window explicitly, from the first usable production event through the review date or another justified bounded period. |
| Event availability | The source code defines the canonical pageview location and all four veteran events, but production availability of `page_view`, `veteran_form_started`, `veteran_relation_selected`, `veteran_submission_succeeded`, and `veteran_submission_failed` could not be verified. |
| Sample sufficient for a decision | No. Counts were unavailable, so sample size, statistical stability, and any relation-path comparison cannot be assessed. |

### Bounded comparison result

No aggregate counts or rates are reported because the GA4 property could not
be queried. In particular, the following comparisons remain unverified:

- canonical veteran journal pageviews → form starts → relation selections →
  successful submissions;
- successful submissions versus coarse failure categories; and
- entry versus prediction selection and success rates.

There is therefore no evidenced largest drop-off and no supported UX
recommendation from this review. Do not change the veteran form based on this
record alone. The next review should use only aggregate GA4 reports for the
canonical page location and the event names/properties above, with no visitor,
session, journal, capability, submitted-text, account, or raw-URL export.
