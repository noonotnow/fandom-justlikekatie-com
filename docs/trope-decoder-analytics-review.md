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

## Bounded sharing outcome contract

Each completed button attempt emits exactly one of these GA4 events through
the existing safe `gtag`/`dataLayer` wrapper:

| Event name | Allowed properties | Meaning |
| --- | --- | --- |
| `decoder_share_succeeded` | `method: native` or `method: copy` | Native share resolved, clipboard write resolved, or fallback copy returned true. |
| `decoder_share_cancelled` | `method: native` only | Native share rejected with `AbortError`. |
| `decoder_share_failed` | `method: native` or `method: copy` | Other native rejection, clipboard rejection, fallback copy exception, or fallback copy returned false. |

Only the fixed `method` enum is sent. Error names are inspected locally, never
sent; no public URL, error message, account identifier, search query, title,
share text, or free-form reader content is included. An `AbortError` from a
copy operation is a copy failure, not a native cancellation. The chosen method
is fixed at click time, and the button is restored after every outcome.
Analytics errors must not change the sharing result or prevent retry.

Use `decoder_share_succeeded` alone for successful-sharing comparisons.
For observed completed attempts, compare cancellations and failures separately
by method, or divide each count by the sum of all three outcome counts. Do not
treat a cancellation as definitive abandonment: browsers may report
`AbortError` when no share target is available. A native resolved promise does
not prove a recipient received the link. Missing events, including a tab
closed while an operation is pending, are not classified as failures.
These additions do not update the historical snapshot or establish live
collection; the external site's GA4 deployment/reporting must be verified
separately.

### Decision

Do not promote or redesign either decoder interaction from this review: there
is no collected sample from which to compare filter use, sharing, or
pageview-to-interaction rates. The next highest-value improvement is
measurement readiness—make the production reporting source available and
resolve the requested-versus-implemented share event naming contract—then
rerun the same-period comparison. Until then, treat filter and share
performance as unknown rather than as zero reader interest.