---
name: Protected workflow alert verification
description: Safe live failure-alert checks when the local workflow is ahead of GitHub and delivery requires human confirmation.
---

For protected GitHub Actions failure alerts, use a temporary branch with a dispatch-only switch that fails the original guarded step before any protected shared-store access. Exclude unrelated dispatch jobs, run once, then remove the switch and branch. Check the failed job and notification-step statuses separately. A successful provider request does not prove delivery: an intended recipient must confirm one message per inbox and the correct run and attempt.

**Why:** GitHub's default branch can lag the local workflow, and a live verification initially failed because repository mail secrets were missing despite workspace secrets existing. After the repository secrets were supplied, the retry's provider send succeeded and an operator confirmed one alert per intended inbox. Running the normal integration test merely to test notification could mutate the shared audit store.

**How to apply:** Compare the live default-branch workflow with the local copy before dispatch. Keep the failure switch branch-scoped and off by default, verify repository secret *names* without reading their values, and do not call delivery proven until the operator checks the inboxes. Never conflate this with a successful normal consistency run.