# Archive record alert delivery drill — September 25, 2026

The Archive check and failure-only Resend notification were exercised in
GitHub Actions on a temporary branch. GitHub's default branch did not yet
contain the Archive job, so this drill used a clean branch based on that
default branch with only the Archive checker, notification, and isolated
workflow job added. The branch has been deleted; the ordinary production
workflow and public records were not changed.

- [Failure run 36187003766](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/36187003766):
  the live checker passed on each attempt (`advertisedRecords: 2`). After
  each pass, the drill explicitly simulated HTTP 404 for a public actor
  route **in the job only**; no route or public record was modified. All
  three attempts failed as intended, and the notification step succeeded
  with `Operator notification sent for Archive check run 36187003766`.
  The run's diagnostic output named only the public route and the
  attempt count; the notification included workflow context, not
  record content or credentials. Other scheduled/manual jobs were skipped.
- [Success run 36187187281](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/36187187281):
  the same live checker passed with `advertisedRecords: 2`; the
  notification step was skipped. Other jobs were skipped.

**Inbox receipt confirmed:** the operator confirmed that the Archive
failure alert arrived in the intended inbox after the failure run.
The successful notification step alone would only prove Resend accepted
the send; the operator's separate confirmation establishes receipt.
Do not repeat the failure drill merely to check receipt: every
successful failure run sends another email.

The clean branch's checker copied the Archive enumeration and public-route
checks from this workspace's implementation, with the indexable HTML
assertion inlined because GitHub's default branch did not yet contain its
shared helper. The temporary notifier sent the same subject, recipient
list, and run URL as the workspace implementation. This verifies the
GitHub Actions delivery configuration for the isolated job; it does not
prove that the not-yet-merged default branch will run the post-deployment
job. Verify a normal deployment-triggered run after the Archive job is
merged.