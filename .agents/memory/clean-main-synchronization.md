---
name: Clean main synchronization
description: How to reconcile a feature-rich local branch with GitHub main when local history includes workspace copies.
---

When synchronizing a long-diverged workspace with GitHub main, preserve the full local branch as a backup, but publish a clean snapshot based on the current remote main if local history contains tracked duplicate working copies or transient browser state. Transfer only the merged app, workflow, documentation, and project-memory changes; do not force-push.

**Why:** A normal merge can be functionally correct yet carry thousands of unrelated files and their history onto GitHub. Removing those files in a later commit does not prevent their earlier blobs from being published.

**How to apply:** Merge current remote changes into the full local branch and verify behavior first. Create the publishing commit with the remote default branch as its parent and only the selected source files in its tree. Keep a named local backup ref to the full branch so excluded material is recoverable; align the workspace branch with the clean published revision after verification. Recheck the remote head before pushing, because concurrent merges can advance it.

**Task completion caveat:** Replit's task-completion base may be an independently advancing workspace main rather than GitHub's `origin/main`. A clean GitHub snapshot can still trigger a replay of dozens of unrelated commits against that workspace base. Check both ancestries before completion; retain backup refs, reconcile verified app changes from both sides into a clean tree descended from the workspace main, and test that tree. Do not resolve a long historical replay by blindly choosing one side or reintroducing duplicate workspace copies.

When a release depends on a feature present only in the workspace branch, port the prerequisite feature and its new instrumentation together onto current GitHub main rather than publishing the instrumentation alone. Preserve GitHub-only content when resolving overlapping editorial pages, and verify the exact release tree and its deploy preview before merging.

**Why:** An analytics commit can pass locally yet record no real clicks if its featured link never reached the external production branch; a whole-workspace push can replace newer published discussions.

**How to apply:** Compare the relevant files against the fetched remote head, use a separate clean release branch for the minimum coherent dependency set, and check both the preview and live site for the feature and event code.

During a broad catch-up, compare open release-PR heads as well as production and the workspace. Preserve newer pending implementation and diagnostics explicitly rather than silently replacing or closing their existing review.

**Why:** A pending release can contain newer code absent from both production and the workspace. Copying the workspace onto production alone can discard that work even while all copied tests pass.

**How to apply:** Inventory the pending release's changed files, preserve its newer overlapping versions, combine complementary changes deliberately, and identify the shared scope in the catch-up review. If either PR merges first, reconcile and verify the other against the resulting main; approvals must cover its latest push.

Time-dependent editorial publication gates can block an otherwise backend-only release.

**Why:** Unchanged production failed its next build because the published evidence had expired. The workspace passed because its generator allowed stale evidence, not because the evidence had been refreshed. Its guide also included pending editorial additions, so importing it would silently expand a narrowly authorized timeout fix.

**How to apply:** Reproduce the failure on the clean production baseline at the real current date. Keep the bounded code PR separate and request approval for the necessary evidence review. Do not bypass freshness checks, backdate the build, invent a review date, or copy unapproved editorial data.

A catch-up must preserve current publication activation and retirement decisions, not just the published HTML.

**Why:** An older catch-up can retain newer article files yet restore a retired article URL or activate its old discussion. Workspace inventory and moderation fixtures may also assume the superseded route remains active.

**How to apply:** Reconcile article registrations, redirects, discussion allowlists, sitemap generation and their fixtures against current production together. Retain current production browser expectations and analytics identifiers alongside the published pages; older test snapshots can restore retired link labels even when the articles themselves are preserved. Keep new moderation utilities separate from permission to activate another discussion.