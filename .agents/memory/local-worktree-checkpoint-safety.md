---
name: Local worktree checkpoint safety
description: Prevent separate local working copies from entering automatic project checkpoints.
---

Put temporary working copies outside the project root, for example under `/home/runner/worktrees/<name>` (create that parent first), not in `/home/runner/workspace/<name>`. Checkpoint tools may include nested worktrees even if their `.git` is a pointer file. If one is already tracked by an automatic checkpoint, remove it only from the Git index and keep its files on disk.

**Why:** An automatic checkpoint included an existing untracked working copy alongside an unrelated small change, creating an oversized commit with hundreds of unintended files.

**How to apply:** Check Git status and large untracked directories at task start; use an outside-project location for new worktrees. Verify the final diff against the task baseline before any merge or external push.

External release worktrees under `/home/runner` may disappear after an automatic workspace checkpoint while Git still lists them as prunable. Before continuing a staged release, check that the worktree exists; if not, prune stale worktree metadata and re-add the release branch rather than assuming the branch or remote commit was lost.

**Why:** A clean release worktree vanished between a workspace commit and a cherry-pick even though its branch and pushed commit remained intact.

**How to apply:** Keep release branches and remote commits as the durable handoff, and verify the external worktree path before each later release step.

Keep workstation Git exclusion rules in a persistent ignored project-local
file rather than pointing `core.excludesFile` at `/tmp`.

**Why:** A prior temporary exclusion file disappeared while Git retained its
configuration pointer, silently removing protection for local-only files.

**How to apply:** Check that configured exclusion files still exist before
aligning branches. Retain local uploads and verification outputs on disk but
exclude them from new release snapshots. Preserve workstation asset-library
metadata separately from the shared application tree.
