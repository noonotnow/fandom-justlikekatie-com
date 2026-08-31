# Trope decoder interaction review

## Review status — 2026-08-31

This review uses the authorized Replit Project Analytics dataset. The public
Fandom Vibes site is externally deployed, so this dataset is not evidence that
the Netlify site's GA4 property has no traffic.

| Review item | Result |
| --- | --- |
| 30-day decoder pageviews | 0 pageviews, 0 visitors on `/c-drama-fandom/trope-decoder/` |
| 30-day requested events | 0 `trope_filter_used`; 0 `decoder_share_succeeded` |
| 30-day share methods | No `method` properties returned |
| 90-day decoder coverage | No pageview or custom-event rows for any path containing `trope-decoder` |
| 365-day project coverage | 0 pageviews and 0 custom events across the whole project |

The production contract now emits `trope_filter_used` and
`decoder_share_succeeded`. Successful sharing retains the bounded
`method: native` or `method: copy` property, and the review query should use
only `decoder_share_succeeded` for future comparisons. The snapshot above
predates any collected share data, so it does not establish a baseline.

### Decision

Do not promote or redesign either decoder interaction from this review: there
is no collected sample from which to compare filter use, sharing, or
pageview-to-interaction rates. The next highest-value improvement is
measurement readiness—make the production reporting source available and
resolve the requested-versus-implemented share event naming contract—then
rerun the same-period comparison. Until then, treat filter and share
performance as unknown rather than as zero reader interest.