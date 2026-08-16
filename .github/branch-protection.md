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
    "enforce_admins": false,
    "required_pull_request_reviews": {
      "dismiss_stale_reviews": false,
      "require_code_owner_reviews": false,
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
| Enforce admins | `false` | Repo owner can bypass rules via GitHub UI when needed |
| PR reviews required | 1 | All changes must come via PR; direct pushes are blocked |
| Force pushes | disabled | History cannot be rewritten on `main` |
| Push restrictions | none (personal repo) | GitHub only supports push allowlists on organisation repos |

### Why `required_pull_request_reviews` blocks direct pushes

GitHub enforces `required_pull_request_reviews` by rejecting non-PR pushes to the protected branch. Setting `required_approving_review_count: 1` is the API minimum; it means any collaborator (other than the repo owner with `enforce_admins: false`) must open a PR and get one approval. The repo owner can still merge via the GitHub UI "Merge without waiting for requirements" bypass when needed.

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

The project's GitHub connector (connection `conn_github_01M01CFGTEP9N3DD9ZHB9X222J`) has `repo` scope and can `PUT /repos/{owner}/{repo}/branches/main/protection` directly — no personal token needed inside the Replit environment.

### Last verified

Branch protection settings were last verified on 2026-08-16 as part of the automated CI check workflow smoke test.
