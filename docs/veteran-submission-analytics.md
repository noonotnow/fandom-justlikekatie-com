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
| Google Analytics property | Operator-supplied GA4 Admin evidence verified that the Web stream for `https://fandom.justlikekatie.com` uses measurement ID `G-FHZJ1T74TG`. The project had been sending to an unrelated `G-CGWB67360Q` value and was corrected to the verified stream on 2026-09-10. |
| Source | Not Replit Publishing analytics. The GA4 Admin evidence verifies the destination only; no reporting connection or approved aggregate export was available to query. |
| Date range | No production date range was queried. The first valid review window must begin after the corrected `G-FHZJ1T74TG` configuration reaches production and end on an explicitly stated review date. |
| Event availability | Before the correction, GA4 reported no data received by the verified stream in the preceding 48 hours. Production availability of `page_view`, `veteran_form_started`, `veteran_relation_selected`, `veteran_submission_succeeded`, and `veteran_submission_failed` must be verified after deployment. |
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

### Verified stream correction — 2026-09-10

Operator-supplied GA4 Admin evidence captured on 2026-08-31 shows that the only
visible Web stream for `https://fandom.justlikekatie.com` is `G-FHZJ1T74TG`.
Before the 2026-09-10 correction, the project and live site
were still sending directly to `G-CGWB67360Q`, a value introduced in the
project before this review with no matching stream in the supplied property.
The project configuration was therefore changed to the verified stream while
leaving the separate, newly created Tag Manager container out of the site to
avoid a second tracking path.

The GA4 evidence reported inactive collection and no data received in the
preceding 48 hours. It verifies the correct destination but is not an approved
aggregate funnel export. After the corrected configuration is deployed and
events have accumulated, export only aggregate counts for an explicitly
bounded date range and the veteran events described above.

### Production delivery verification — 2026-09-11

The external Netlify site was checked at 2026-09-11 23:25 UTC. The correction
commit was authored at 2026-09-10 21:20 UTC, so the observed deployment lag is
bounded at no more than 26 hours 5 minutes. Netlify did not expose an exact
deployment timestamp in the public response, so no narrower lag is claimed.

| Review item | Production evidence |
| --- | --- |
| Live HTML destination | Both `https://fandom.justlikekatie.com/` and the canonical veteran journal route loaded `G-FHZJ1T74TG`. Neither response contained `G-CGWB67360Q` nor `GTM-W7DJ27L5`. |
| Canonical delivery | A browser probe against the live veteran route observed exactly one `page_view`, one `veteran_form_started`, and one `veteran_relation_selected` request to the GA4 collection endpoint for `G-FHZJ1T74TG`. |
| Duplicate-path check | Each exercised veteran event appeared once. The page retained its established `GTM-5T5P2C9S` container, but the probe found no second pageview or duplicate veteran event from it. |
| Privacy check | The browser URL was replaced with the canonical route before collection. The outgoing requests used only the canonical page location and the documented coarse event properties; the probe capability and submitted-text sentinel were absent. No account, visitor, session, journal, capability, submitted-text, or raw-URL export was requested or produced. |
| Submission outcomes | The success and failure emitters remain covered by the focused analytics test, including coarse relation and failure-category values. The production probe did not create a real veteran submission merely to generate analytics. |

This check verifies live delivery to the GA4 collection endpoint. It does not
substitute for a later aggregate funnel review in the GA4 reporting interface;
no GA4 reporting connection or approved aggregate export was available during
this verification.
