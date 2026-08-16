---
name: GitHub Actions token vs branch protection reads
description: Why a CI job reading branch protection needs a PAT, not GITHUB_TOKEN
---
In GitHub Actions, `secrets.GITHUB_TOKEN` can fetch `/branches/main/protection` and sees `allow_force_pushes` and `required_pull_request_reviews`, but the `required_status_checks` contexts/checks come back empty — so any assertion on required checks silently fails.

**Why:** discovered when the branch-protection-check workflow failed only its third assertion; the same query with a full-scope PAT returned the contexts. Also: `permissions: administration: read` is NOT a valid Actions permissions key — adding it makes the whole workflow invalid (run shows the filename as its name, 0 jobs).

**How to apply:** for CI jobs reading branch protection, use a repo-scope PAT stored as an Actions secret (`REPO_ADMIN_PAT`, set via `gh secret set`). Never add `administration` to a workflow `permissions` block. A run named after its YAML path with 0 jobs = workflow validation error, not a script failure.
