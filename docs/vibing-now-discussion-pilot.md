# Vibing Now discussion pilot review

The only activated conversation is the *Against the Current* article through Episode 21. The editor must approve each contribution before it becomes visible. A report flags an approved response in the private review queue; the operator can hide it. Approval is a human editorial decision, not automatic spoiler detection.

Review the pilot after an initial 21-day observation window following release, without automatically opening any other series or later episodes. Record a privacy-safe aggregate of:

- Approved substantive replies (exclude spam and near-duplicates).
- Distinct participating visitors only if the anonymous browser identity remains reliable; otherwise mark this measure unavailable rather than equating submissions with people.
- Return discussion, if measurable without publishing reader identities.
- Reports and how many reported responses were hidden.
- Approximate minutes spent reviewing, and whether the queue stayed manageable.

Do not publish anonymous identity tokens, network addresses, rejected text, or per-person histories in the review. An empty board is an acceptable low-traffic outcome, not evidence that the feature failed. Expansion requires a separate editorial decision, a reviewed article, and a new explicit series/article/episode boundary.

## Private archive retention after the pilot

The archive is capped at 2,000 records per discussion. There is no automatic deletion on read or submission. An admin can preview eligible counts in the private Vibing Now review panel and deliberately run cleanup there after the pilot review. Cleanup is per discussion and uses the same conditional Blob write and conflict retry as moderation; it recalculates eligibility on every retry rather than applying a stale preview. Failed writes leave the archive unchanged. The preview and cleanup result contain counts only, never submitted text, IDs, or report identities.

- **Pending:** eligible 90 days after submission. Review the queue and capture the privacy-safe pilot aggregate before cleaning up unanswered submissions.
- **Rejected:** eligible 90 days after the moderation decision.
- **Hidden:** eligible 180 days after the hiding decision, allowing time to review resolved reports and the pilot's report aggregate.
- **Approved:** retained without a time limit while visible, including their current report flags. Cleanup never removes approved replies or clears their reports; an operator must hide a reply first if it should no longer be public. Missing or invalid timestamps do not qualify for cleanup and require operator investigation.

The boundary is inclusive at the exact age in UTC. Cleanup can free space for new submissions, but if 2,000 approved replies remain, the archive stays full: do not silently evict public contributions. A larger archive or separate durable storage needs its own reviewed change before that limit is reached. The ordinary public endpoint returns only the last 30 approved replies; neither it nor the submission endpoint exposes the private cleanup controls.

The admin-only moderation panel shows current total records, protected approved replies, and remaining slots on load and after editor actions. At 1,600 records (80% of the limit), it warns editors to preview cleanup; at 1,600 approved replies, it warns them to plan a reviewed storage expansion, since cleanup cannot remove visible replies. At 2,000 total records, submissions stop; when all 2,000 are approved, the submission error explicitly says they are paused until capacity is expanded. Counts are private to the authenticated admin view and do not include identities or submission text in the capacity signal. These thresholds are planning signals, not permission to delete approved replies or increase storage without review.

An hourly scheduled check reads each activated discussion archive independently and emails `FANDOM_ADMIN_EMAILS` through the configured Resend sender when either total records or protected approved replies first reaches 1,600. Each category is notified once per discussion until a successful read below 1,600 rearms it. Emails contain the discussion identifier, counts, limit, threshold, and observation time, never reader identities or submission text. Conditional notification claims prevent overlapping checks from sending the same warning; failed delivery is retried after a 15-minute claim lease. A failed or invalid archive read does not reset alerts, report zero records, or produce a successful scheduled check. The check requires `RESEND_API_KEY`, `FANDOM_AUTH_FROM_EMAIL`, and `FANDOM_ADMIN_EMAILS` at the Netlify runtime. Monitor scheduled-function failures as well as email delivery; a successful provider acceptance is not proof of inbox delivery. Public discussion responses remain unchanged.