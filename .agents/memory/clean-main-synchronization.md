---
name: Clean main synchronization
description: How to reconcile a feature-rich local branch with GitHub main when local history includes workspace copies.
---

When synchronizing a long-diverged workspace with GitHub main, preserve the full local branch as a backup, but publish a clean snapshot based on the current remote main if local history contains tracked duplicate working copies or transient browser state. Transfer only the merged app, workflow, documentation, and project-memory changes; do not force-push.

**Why:** A normal merge can be functionally correct yet carry thousands of unrelated files and their history onto GitHub. Removing those files in a later commit does not prevent their earlier blobs from being published.

**How to apply:** Merge current remote changes into the full local branch and verify behavior first. Create the publishing commit with the remote default branch as its parent and only the selected source files in its tree. Keep a named local backup ref to the full branch so excluded material is recoverable; align the workspace branch with the clean published revision after verification. Recheck the remote head before pushing, because concurrent merges can advance it.

**Task completion caveat:** Replit's task-completion base may be an independently advancing workspace main rather than GitHub's `origin/main`. A clean GitHub snapshot can still trigger a replay of dozens of unrelated commits against that workspace base. Check both ancestries before completion; retain backup refs, reconcile verified app changes from both sides into a clean tree descended from the workspace main, and test that tree. Do not resolve a long historical replay by blindly choosing one side or reintroducing duplicate workspace copies.