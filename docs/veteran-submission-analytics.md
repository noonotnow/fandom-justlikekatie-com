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