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