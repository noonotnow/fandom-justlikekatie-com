# Branch Protection Configuration

## `main` branch

The `main` branch has a protection rule applied via the GitHub API. If the repo is ever transferred or recreated, re-apply it with:

```bash
curl -X PUT \
  -H "Authorization: Bearer <GITHUB_TOKEN>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/noonotnow/fandom-justlikekatie-com/branches/main/protection \
  -d '{
    "required_status_checks": {
      "strict": false,
      "contexts": ["test"]
    },
    "enforce_admins": true,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false,
      "require_last_push_approval": true,
      "required_approving_review_count": 1
    },
    "restrictions": null
  }'
```

### What this enforces

| Setting | Value | Meaning |
|---|---|---|
| Required status check | `test` | The `test` job in `.github/workflows/test.yml` must pass |
| Strict | `false` | Branch doesn't need to be up to date before merging |
| Enforce admins | `true` | Repository administrators follow the same PR gate |
| PR reviews required | 1 | All changes must come via PR; direct pushes are blocked |
| Dismiss stale reviews | `true` | Approval must apply to the current diff |
| Last push approval | `true` | The person who most recently pushed cannot supply the final approval |
| Force pushes | disabled | History cannot be rewritten on `main` |
| Push restrictions | none (personal repo) | GitHub only supports push allowlists on organisation repos |

### Why `required_pull_request_reviews` blocks direct pushes

GitHub enforces `required_pull_request_reviews` by rejecting non-PR pushes to the protected branch. Setting `required_approving_review_count: 1` requires an approval, and `enforce_admins: true` applies the gate to repository administrators too. Stale approvals are dismissed, and the most recent pusher cannot supply the final approval.

The `restrictions` field (push allowlist) is only available on organisation repositories and cannot be used here.

### Automated protection check

`.github/workflows/branch-protection-check.yml` runs on every PR to `main` and asserts:

- `allow_force_pushes: false`
- `required_pull_request_reviews` is present
- `test` is a required status check

If any rule is missing the check job fails, making protection drift visible in CI.

### Check name

The required check name `test` matches the **job id** in `.github/workflows/test.yml` (line 10: `jobs: test:`), not the workflow name ("Tests"). If the job id is ever renamed, update the protection rule to match.

### Re-applying the rule via the Replit GitHub integration

The project's GitHub connector has `repo` scope and can `PUT /repos/{owner}/{repo}/branches/main/protection` directly — no personal token is needed inside the Replit environment.

### Editorial publication procedure

Editorial site changes follow [`docs/editorial-publication-runbook.md`](../docs/editorial-publication-runbook.md). The runbook places the authority commit before repository delivery, requires a reviewed PR, and delays Publication Evidence until the merged commit is deployed and the live destination is verified.

### Last verified

Branch protection settings were last verified on 2026-09-22.
