# Candidate migration alert delivery drill

The candidate job in `.github/workflows/test.yml` runs on a schedule or manual
dispatch. Its failure handler calls `scripts/notify-migration-failure.js` using
the repository's GitHub Actions secrets. Replit secrets do **not** automatically
become GitHub Actions secrets.

## Controlled run (September 24, 2026)

- [Workflow run 35945748042](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/35945748042)
  was dispatched from a temporary branch containing the candidate job.
- PostgreSQL 18 initialized and **Apply every migration twice** passed. A
  temporary step immediately afterward exited with code 1; the notification
  step ran, but failed before sending because `RESEND_API_KEY`,
  `FANDOM_AUTH_FROM_EMAIL`, and `FANDOM_ADMIN_EMAILS` were all unset in GitHub
  Actions. The independent operator configuration check reported the same
  missing settings. **No inbox receipt was verified.**
- The temporary failure branch was deleted after the run. The PostgreSQL 16/17
  required checks and normal candidate job were not modified.

## Delivery retry (September 24, 2026)

- After the three GitHub Actions alert settings were configured, [workflow run
  36013166774](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/36013166774)
  was dispatched from a second temporary branch. PostgreSQL 18 migrations
  passed, the controlled step failed, and the notification step succeeded:
  `Operator notification sent for PostgreSQL 18 candidate run 36013166774.`
- This confirms the GitHub Actions secret, sender, and Resend send API were
  accepted. The operator subsequently confirmed that the message reached the
  existing inbox, named PostgreSQL 18, and linked to this failed run.
- The separate no-email sender-domain configuration check failed with HTTP 401
  because Resend domain reads require a full-access key. This does not reverse
  the successful send result. The check now uses a separate verification key
  rather than expanding the delivery key's permissions.
  Other scheduled/manual jobs also failed in this run; judge the candidate
  alert using its own job steps, not the overall workflow conclusion.

## No-email readiness check

In the repository's **Settings → Environments → operator-sender-verification →
Environment secrets**, set `RESEND_DOMAIN_READ_API_KEY` to a **separate
full-access Resend key from the same Resend account** as the send-only
`RESEND_API_KEY`. Resend offers no read-only domain permission: its domain-list
API requires full access. This environment allows deployments from the `main`
branch only, with no required reviewers, so the weekly schedule runs without
an approval prompt. The `operator-alert-configuration` job also checks
`github.ref` for `refs/heads/main`: manual dispatch from another branch and
pull requests skip this job. The environment secret is not provided to the
notification steps or the deployed app. Keep the send-only key and sender/
recipient settings as Actions repository secrets for their separate jobs.

**Migration:** GitHub does not reveal existing repository secret values.
After adding the environment secret, run **Tests** manually from `main` and
confirm the operator configuration job passes. Then delete the repository-level
`RESEND_DOMAIN_READ_API_KEY` in **Settings → Secrets and variables → Actions**;
leaving it there would let an unreviewed branch add its own job and read it,
regardless of the new job's environment or ref guard. Confirm the environment
secret remains and, on the next scheduled run, that the same no-email job passes.
If the old key cannot be supplied to the environment without retrieving it,
create a fresh full-access verification key in the same Resend account, put it
in the environment, and revoke the old key after the successful check. Rotate
by adding the new environment value, checking from `main`, then revoking the
previous key; if a key may have been exposed, revoke it immediately and expect
the check to fail closed until replaced. Limit environment administration to
trusted repository administrators. GitHub administrators or anyone who can
land workflow changes on `main` can still use this credential; branch
restriction does not protect against malicious reviewed changes. Do not reuse
or upgrade the send-only key for this check.

The check validates sender/recipient syntax and confirms that the sender's
domain is verified and sending-enabled **in the verification key's account**
without sending an email. It cannot independently prove that the send-only
key belongs to the same account or that an email reaches an inbox. The
controlled delivery drill below provides that separate evidence. A missing
or rejected verification key fails the check rather than reporting success;
logs include neither addresses nor provider response bodies.

On September 25, 2026, the [operator configuration job passed in GitHub
Actions](https://github.com/noonotnow/fandom-justlikekatie-com/actions/runs/36136763719)
with the separate `RESEND_DOMAIN_READ_API_KEY`. This was a temporary
verification branch based on GitHub's then-current default branch, carrying
the readiness check and its exact script but no unrelated workspace commits.
Other manual jobs were skipped for that run; no test email was sent. This
proves the no-email check works with the protected GitHub Actions secrets,
not that the default branch already contains the change. The controlled
delivery retry above remains the evidence for the send-only alert path.
The narrowly scoped change for GitHub's default branch is under review in
[pull request #126](https://github.com/noonotnow/fandom-justlikekatie-com/pull/126);
the temporary verification branch can be removed independently.
- The second temporary branch was deleted too. No controlled failure step
  remains in the normal workflow.

## Repeat safely

1. Confirm the repository's **Settings → Secrets and variables → Actions**
   contains `RESEND_API_KEY`, `FANDOM_AUTH_FROM_EMAIL`, and
   `FANDOM_ADMIN_EMAILS`. Configure them there through GitHub's secret UI;
   never commit or print their values. The sender must be verified for the
   Resend account used by that key, and the recipient list must include the
   operator inbox. Check with an operator before sending a drill message.
2. Use a temporary branch containing the candidate job. In *that job only*,
   insert a temporary step **after** `Apply every migration twice` and
   **before** `Notify operators about failed PostgreSQL candidate migration`
   with `run: exit 1`. Do not change the PostgreSQL 16/17 matrix or the
   migration test itself. Push the branch, then dispatch the `Tests` workflow
   with that branch as its ref. Avoid repeated dispatches: each successful
   alert attempt sends another email.
3. Check the candidate job's steps in the run: PostgreSQL 18 migration test
   passes, the controlled step fails, and the notification step succeeds.
   Confirm with an operator that the **existing inbox actually received**
   the message, that its subject names PostgreSQL 18, and that its body links
   to the same failed workflow run. An HTTP success or a green notification
   step alone does not prove inbox receipt.
4. Delete the temporary branch both locally and on GitHub. Confirm that no
   failure step remains in the normal workflow. Record the run URL and inbox
   confirmation in the task handoff without exposing addresses or secrets.

If the default branch does not yet contain the candidate job, select a branch
that does; do not interpret a default-branch dispatch without that job as a
delivery test.