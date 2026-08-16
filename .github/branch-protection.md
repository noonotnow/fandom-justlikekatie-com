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
    "required_pull_request_reviews": null,
    "restrictions": null
  }'
```

### What this enforces

| Setting | Value | Meaning |
|---|---|---|
| Required status check | `test` | The `test` job in `.github/workflows/test.yml` must pass |
| Strict | `false` | Branch doesn't need to be up to date before merging |
| Enforce admins | `false` | Admins are not exempt |
| PR reviews required | none | No review count required |
| Push restrictions | none | Any collaborator can push |

### Check name

The required check name `test` matches the **job id** in `.github/workflows/test.yml` (line 10: `jobs: test:`), not the workflow name ("Tests"). If the job id is ever renamed, update the protection rule to match.

### Re-applying the rule via the Replit GitHub integration

The project's GitHub connector (connection `conn_github_01M01CFGTEP9N3DD9ZHB9X222J`) has `repo` scope and can `PUT /repos/{owner}/{repo}/branches/main/protection` directly — no personal token needed inside the Replit environment.
