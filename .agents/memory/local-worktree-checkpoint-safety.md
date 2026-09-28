---
name: Local worktree checkpoint safety
description: Prevent separate local working copies from entering automatic project checkpoints.
---

Exclude separate local working copies before beginning edits, especially directories containing a full duplicate of this repository. If one is already tracked by an automatic checkpoint, remove it only from the Git index and keep its files on disk.

**Why:** An automatic checkpoint included an existing untracked working copy alongside an unrelated small change, creating an oversized commit with hundreds of unintended files.

**How to apply:** Check Git status and large untracked directories at task start; ignore local working copies before the first code edit. Verify the final diff against the task baseline before any merge or external push.