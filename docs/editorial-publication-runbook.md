# Editorial Publication Runbook

This runbook governs editorial changes that publish through
`noonotnow/fandom-justlikekatie-com`. It keeps committed editorial authority,
repository review, deployment, and Publication Evidence as separate gates.

## Required order

1. **Commit editorial authority first.** Complete the authority transaction for
   the Website Change or revision, including its immutable decision and related
   records. If the transaction fails or rolls back, stop. Do not create a
   repository branch, commit, or pull request.
2. **Prepare repository delivery.** After the authority transaction commits,
   create a branch from the current `main`, apply only the authorized change,
   and include the authority record identifier in the commit and pull-request
   description.
3. **Open a pull request.** Never push an editorial publication change directly
   to `main`. The pull request must identify the live destination to verify,
   summarize the authorized change, and state the rollback plan.
4. **Review and merge.** Wait for the required test and an approval of the
   current diff. A new push dismisses stale approval, and the last pusher cannot
   supply the final approval. Merge through GitHub; do not reproduce the change
   with a direct push.
5. **Wait for deployment.** Confirm the hosting provider deployed the exact
   merged commit. A merged pull request or successful source build is not
   Publication Evidence.
6. **Verify the live destination.** Open the production URL and verify the
   authorized change, destination, media, links, and relevant metadata. Record
   the deployed commit and verification time.
7. **Record Publication Evidence.** Only after steps 5 and 6 succeed, attach
   revision-scoped Publication Evidence to the authority record. The evidence
   must identify the merged pull request, deployed commit, live URL, and live
   verification result.

If deployment or live verification fails, leave Publication Evidence pending,
record the failure in the operational log, and repair through another reviewed
pull request.

## Pull-request checklist

- [ ] The authority transaction committed before this pull request was opened.
- [ ] The pull request links the Website Change or revision authority record.
- [ ] The diff matches the committed authority and contains no unrelated work.
- [ ] The production URL and verification checks are listed.
- [ ] The required test passes.
- [ ] A reviewer other than the last pusher approved the current diff.
- [ ] The rollback plan is stated.

## Exception path

Exceptions are for urgent production recovery when waiting for the normal
review path would cause greater harm. Convenience, scheduling pressure, or an
unavailable reviewer is not an exception.

Before changing or bypassing branch protection:

1. The repository owner must give explicit written approval in a GitHub issue.
   The approval must name the exact change, explain the urgency, identify the
   operator, and set an expiry.
2. The operator must link the committed authority record and capture the
   current branch-protection state.
3. The operator may relax only the minimum rule needed for the approved change.
   Force pushes and branch deletion remain prohibited.
4. Immediately after the change, restore the documented protection settings and
   run the branch-protection check.
5. Open a follow-up pull request containing or reconciling the emergency diff so
   the change receives review.
6. Deploy and verify the exact commit. Record Publication Evidence only after
   live verification, with the owner approval and exception issue linked.

An exception without prior, explicit owner approval is an unauthorized direct
change and must not be treated as a publication.
