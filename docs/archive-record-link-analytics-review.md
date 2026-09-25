# Archive editorial-record link review

## Review status — 2026-09-20

This review uses the authorized Replit Project Analytics dataset. The public
Fandom Vibes site is externally deployed, so this dataset is not evidence that
the Netlify site's Google Analytics property has no traffic.

The query covered **2026-03-24 through 2026-09-20 (partial day)**, a 180-day
lookback that is longer than the required 30-day representative window. It
returned no pageviews anywhere in the project and no
`archive_record_opened` events. The dataset therefore contains no matching page
traffic against which to calculate a click rate.

| Placement | Record type | Click volume | Relevant page traffic | Recommendation |
| --- | --- | ---: | ---: | --- |
| Daily drop | Actor | Unavailable | Unavailable | Keep unchanged until production reporting supplies a representative sample. |
| Daily drop | Edition | Unavailable | Unavailable | Keep unchanged until production reporting supplies a representative sample. |
| Archive picker | Actor | Unavailable | Unavailable | Keep unchanged; do not remove or emphasize based on this review. |
| Archive picker | Edition | Unavailable | Unavailable | Keep unchanged; do not remove or emphasize based on this review. |
| Locked preview | Actor | Unavailable | Unavailable | Keep unchanged; the accessible editorial record remains useful beside the membership gate. |
| Locked preview | Edition | Unavailable | Unavailable | Keep unchanged; the accessible editorial record remains useful beside the membership gate. |
| Full archive | Actor | Unavailable | Unavailable | Keep unchanged; do not alter the secondary actor link without observed production behavior. |
| Full archive | Edition | Unavailable | Unavailable | Keep the prominent edition-record path unchanged; its effectiveness is not yet measurable. |

These are preservation recommendations, not performance findings. There is no
evidence in the accessible dataset that one placement or record type performs
better than another, so this review does not support redesigning, removing, or
further emphasizing any link.

## Required measurement period

Another measurement period is required because the available sample size is
zero. Start the next review only after production reporting confirms that both
pageviews and `archive_record_opened` events are arriving from the externally
deployed site. Use at least 30 complete days of representative published
traffic, then compare:

- `daily` and `archive_picker` clicks with `/vibe-atlas` pageviews;
- `locked_preview` clicks with the relevant gated archive views;
- `full_archive` clicks with `/vibe-atlas/archive` pageviews; and
- actor versus edition clicks within each placement.

Report aggregate event counts and click events per relevant pageview. Do not
export raw events, visitor identifiers, record paths, edition dates, or
capability-bearing URLs.


## Production aggregate review source

Starting with the next production deployment, the Netlify engagement store
records a privacy-bounded mirror of the two canonical archive pageviews, gated
preview views, and `archive_record_opened` events. The mirror accepts only the
documented `record_type` and `location` enums; it does not store visitor,
session, account, capability, edition-date, or record-path values.

An authenticated operator can query a half-open UTC date range of at most 93
days:

`/.netlify/functions/engagement-export?archiveLinkReview=1&from=YYYY-MM-DD&to=YYYY-MM-DD`

The response contains only aggregate canonical pageview counts, the gated
preview denominator, and eight placement-by-record-type rows with click counts,
relevant pageviews, and clicks per pageview. It never includes raw records.
Use `/vibe-atlas` as the denominator for `daily` and `archive_picker`,
`/vibe-atlas/archive` for `full_archive`, and gated preview views for
`locked_preview`. A valid 30-day review window begins only after this
instrumentation is deployed and confirmed to be receiving production traffic.
## Operator readiness signal

Do not start the clock when instrumentation ships. Record the first UTC calendar
date only after the production reporting destination confirms that relevant
pageviews and `archive_record_opened` events are arriving from the externally
deployed site. Until that date is confirmed, readiness is
`awaiting_reporting`.

Build one privacy-safe aggregate row per UTC date with only:

- the calendar date;
- the total relevant pageviews across the review's approved page groups; and
- the total `archive_record_opened` events.

Exclude the current UTC date because it is partial. A complete day is usable
only when both aggregate counts are greater than zero. The review becomes
`ready` when 30 complete days on or after the confirmed reporting start are
usable; 30 elapsed calendar days alone are not enough. Before then it remains
`collecting`.

The operator signal reports the confirmed reporting start, covered complete-day
start and end, complete-day count, usable-day count, and `sample_usable`
boolean. It must not include raw events, visitor or session identifiers, record
paths, edition dates from clicked records, page locations, or
capability-bearing URLs. When `sample_usable` first becomes true, notify the
operators that the aggregate review can begin; do not interpret the signal as a
performance finding.

Persist the notification state returned by the readiness tracker and supply it
to the next reporting run. The ordinary readiness signal continues on every run
so `ready` remains visible, but `archive_link_review_ready` is emitted only on
the first ready assessment for that confirmed reporting start. Repeated ready
runs do not resend it. Deliberately changing the confirmed reporting start
begins a new notification cycle: the new period collects independently and can
emit one ready notification when its sample becomes usable.

The persisted notification state is limited to the confirmed reporting start,
the current readiness status, and whether that period's ready notification was
sent. It must not be expanded with visitor or session identifiers, record
paths, clicked edition dates, page locations, raw events, or
capability-bearing URLs.
