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